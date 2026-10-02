/**
 * Home Connect provider (read-only).
 *
 * OAuth2 Device Flow, tokens persisted in HOMECONNECT_TOKEN_PATH.
 * Data is cached because the API is limited (~1000 calls/day, 1 + 3 per appliance per refresh).
 * Docs: https://api-docs.home-connect.com/
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  HomeConnectAppliance,
  HomeConnectDeviceAuth,
  HomeConnectEntry,
  HomeConnectSnapshot,
} from "@/lib/types";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { applyMapping, loadMapping, type RawEntry } from "@/lib/providers/homeconnect-mapping";

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
}

interface PendingDeviceAuth {
  deviceCode: string;
  expiresAtMs: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

interface HcItem {
  key: string;
  value?: string | number | boolean | null;
  unit?: string;
  displayvalue?: string;
}

class HomeConnectHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let pending: PendingDeviceAuth | null = null;
let cache: { snapshot: HomeConnectSnapshot; expiresAtMs: number } | null = null;
let inflight: Promise<HomeConnectSnapshot> | null = null;
let backoffUntilMs = 0;

function isConfigured() {
  return env().HOMECONNECT_CLIENT_ID.length > 0;
}

async function readToken(): Promise<StoredToken | null> {
  try {
    return JSON.parse(await fs.readFile(env().HOMECONNECT_TOKEN_PATH, "utf8")) as StoredToken;
  } catch {
    return null;
  }
}

async function writeToken(token: StoredToken) {
  const file = env().HOMECONNECT_TOKEN_PATH;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(token), { mode: 0o600 });
}

async function postForm<T>(urlPath: string, body: Record<string, string>): Promise<{ status: number; json: T }> {
  const response = await fetch(`${env().HOMECONNECT_BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, json };
}

function clientParams(): Record<string, string> {
  const { HOMECONNECT_CLIENT_ID, HOMECONNECT_CLIENT_SECRET } = env();
  return HOMECONNECT_CLIENT_SECRET
    ? { client_id: HOMECONNECT_CLIENT_ID, client_secret: HOMECONNECT_CLIENT_SECRET }
    : { client_id: HOMECONNECT_CLIENT_ID };
}

async function storeTokenResponse(json: TokenResponse, fallbackRefresh?: string) {
  if (!json.access_token) {
    return null;
  }
  const token: StoredToken = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? fallbackRefresh ?? "",
    expiresAtMs: Date.now() + (json.expires_in ?? 86_400) * 1000,
  };
  await writeToken(token);
  return token;
}

async function getAccessToken(): Promise<string | null> {
  const token = await readToken();
  if (!token) {
    return null;
  }
  if (token.expiresAtMs - Date.now() > 60_000) {
    return token.accessToken;
  }
  if (!token.refreshToken) {
    return null;
  }

  const { status, json } = await postForm<TokenResponse>("/security/oauth/token", {
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
    ...clientParams(),
  });
  if (status !== 200) {
    log("warn", "homeconnect.refresh_failed", { status, error: json.error });
    return null;
  }
  return (await storeTokenResponse(json, token.refreshToken))?.accessToken ?? null;
}

export async function startDeviceAuth(): Promise<HomeConnectDeviceAuth> {
  if (!isConfigured()) {
    throw new Error("HOMECONNECT_CLIENT_ID fehlt");
  }
  const { status, json } = await postForm<{
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
  }>("/security/oauth/device_authorization", {
    client_id: env().HOMECONNECT_CLIENT_ID,
    scope: env().HOMECONNECT_SCOPE,
  });
  if (status !== 200 || !json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error(`Device-Authorization fehlgeschlagen (HTTP ${status})`);
  }

  const expiresAtMs = Date.now() + (json.expires_in ?? 300) * 1000;
  const publicInfo: HomeConnectDeviceAuth = {
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    verificationUriComplete: json.verification_uri_complete ?? null,
    expiresAtUtc: new Date(expiresAtMs).toISOString(),
  };
  pending = { deviceCode: json.device_code, expiresAtMs };
  return publicInfo;
}

export type DeviceAuthPoll = "pending" | "authorized" | "none" | "expired" | "denied";

export async function pollDeviceAuth(): Promise<DeviceAuthPoll> {
  if (!pending) {
    return "none";
  }
  if (Date.now() > pending.expiresAtMs) {
    pending = null;
    return "expired";
  }

  const { json } = await postForm<TokenResponse>("/security/oauth/token", {
    grant_type: "device_code",
    device_code: pending.deviceCode,
    ...clientParams(),
  });
  if (json.access_token) {
    await storeTokenResponse(json);
    pending = null;
    cache = null;
    backoffUntilMs = 0;
    return "authorized";
  }
  if (json.error === "authorization_pending" || json.error === "slow_down") {
    return "pending";
  }
  pending = null;
  return json.error === "expired_token" ? "expired" : "denied";
}

async function hcGet<T>(token: string, apiPath: string): Promise<T> {
  const response = await fetch(`${env().HOMECONNECT_BASE_URL}/api${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.bsh.sdk.v1+json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new HomeConnectHttpError(response.status, `HTTP ${response.status} ${apiPath}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

async function optionalGet<T>(token: string, apiPath: string): Promise<T | null> {
  try {
    return await hcGet<T>(token, apiPath);
  } catch (err) {
    // 404 = z. B. kein aktives Programm, 403/409 = Scope bzw. Gerät offline
    if (err instanceof HomeConnectHttpError && [403, 404, 409].includes(err.status)) {
      return null;
    }
    throw err;
  }
}

function toRaw(items: HcItem[] | undefined, source: RawEntry["source"]): RawEntry[] {
  return (items ?? []).map((item) => ({
    key: item.key,
    value: item.value ?? null,
    unit: item.unit ?? null,
    source,
  }));
}

async function fetchAppliance(
  token: string,
  base: { haId: string; name: string; type: string; brand: string; vib: string; connected: boolean },
  mapping: Awaited<ReturnType<typeof loadMapping>>,
): Promise<HomeConnectAppliance> {
  if (!base.connected) {
    return { ...base, finished: false, entries: [] };
  }

  const [status, settings, program] = await Promise.all([
    optionalGet<{ status: HcItem[] }>(token, `/homeappliances/${base.haId}/status`),
    optionalGet<{ settings: HcItem[] }>(token, `/homeappliances/${base.haId}/settings`),
    optionalGet<{ key: string; options?: HcItem[] }>(token, `/homeappliances/${base.haId}/programs/active`),
  ]);

  const raw: RawEntry[] = [
    ...toRaw(status?.status, "status"),
    ...toRaw(settings?.settings, "setting"),
    ...(program ? [{ key: "BSH.Common.Root.ActiveProgram", value: program.key, unit: null, source: "program" as const }] : []),
    ...toRaw(program?.options, "option"),
  ];

  const entries: HomeConnectEntry[] = applyMapping(raw, mapping, base.type, base.haId);
  const finished = raw.some(
    (item) => item.key === "BSH.Common.Status.OperationState" && item.value === "BSH.Common.EnumType.OperationState.Finished",
  );
  return { ...base, finished, entries };
}

async function refresh(): Promise<HomeConnectSnapshot> {
  const empty = { appliances: [], fetchedAtUtc: null };
  if (!isConfigured()) {
    return { state: "not_configured", message: "HOMECONNECT_CLIENT_ID ist nicht gesetzt.", ...empty };
  }

  const token = await getAccessToken();
  if (!token) {
    return { state: "unauthorized", message: "Home Connect ist noch nicht verbunden.", ...empty };
  }

  try {
    const [list, mapping] = await Promise.all([
      hcGet<{
        homeappliances: Array<{
          haId: string;
          name: string;
          type: string;
          brand: string;
          vib: string;
          connected: boolean;
        }>;
      }>(token, "/homeappliances"),
      loadMapping(),
    ]);

    const appliances = await Promise.all(
      list.homeappliances.map((base) =>
        fetchAppliance(token, base, mapping).catch((err): HomeConnectAppliance => {
          if (err instanceof HomeConnectHttpError && err.status === 429) {
            throw err;
          }
          return { ...base, finished: false, entries: [], error: err instanceof Error ? err.message : "Fehler" };
        }),
      ),
    );
    return { state: "ok", appliances, fetchedAtUtc: new Date().toISOString() };
  } catch (err) {
    if (err instanceof HomeConnectHttpError && err.status === 429) {
      backoffUntilMs = Date.now() + 15 * 60_000;
    }
    if (err instanceof HomeConnectHttpError && err.status === 401) {
      return { state: "unauthorized", message: "Token ungültig, bitte neu verbinden.", ...empty };
    }
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "homeconnect.fetch_failed", { message });
    return { state: "error", message, ...empty };
  }
}

export async function fetchHomeConnect(): Promise<HomeConnectSnapshot> {
  const now = Date.now();
  if (cache && (cache.expiresAtMs > now || backoffUntilMs > now)) {
    return cache.snapshot;
  }
  if (!cache && backoffUntilMs > now) {
    return { state: "error", message: "Rate-Limit erreicht, Pause aktiv.", appliances: [], fetchedAtUtc: null };
  }

  inflight ??= refresh()
    .then((snapshot) => {
      // Fehlerzustände und Rate-Limit-Pause: letzte gute Daten behalten
      const keepOld = snapshot.state === "error" && cache?.snapshot.state === "ok";
      const result = keepOld ? { ...cache!.snapshot, message: snapshot.message } : snapshot;
      cache = {
        snapshot: result,
        expiresAtMs: Date.now() + (snapshot.state === "ok" ? env().HOMECONNECT_CACHE_SECONDS * 1000 : 15_000),
      };
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
