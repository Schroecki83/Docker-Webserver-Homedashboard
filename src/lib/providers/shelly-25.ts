/**
 * Shelly 2.5 Gen1 adapter — local LAN HTTP polling.
 * Supports: roller/shutter position and power draw.
 * Endpoint: GET http://<ip>/status
 */
import type { ShutterReading } from "@/lib/types";
import { log } from "@/lib/logger";

interface ShellyRollerStatus {
  current_pos?: number;
  state?: string;
}

interface Shelly25Status {
  rollers?: ShellyRollerStatus[];
  meters?: Array<{ power: number; is_valid: boolean }>;
  time?: string;
}

function nowUtc(): string {
  return new Date().toISOString();
}

export async function fetchShelly25(ip: string): Promise<ShutterReading> {
  const url = `http://${ip}/status`;
  let status: Shelly25Status;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    status = (await res.json()) as Shelly25Status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "shelly.25.fetch_failed", { ip, message });
    return { ip, positionPct: null, powerW: null, isMoving: false, timestampUtc: nowUtc() };
  }

  const roller = status.rollers?.[0];
  const meter = status.meters?.[0];

  return {
    ip,
    positionPct: roller?.current_pos ?? null,
    powerW: meter?.is_valid ? meter.power : null,
    isMoving: roller?.state === "open" || roller?.state === "close",
    timestampUtc: nowUtc(),
  };
}

export async function fetchAllShelly25(ips: string[]): Promise<ShutterReading[]> {
  return Promise.all(ips.map((ip) => fetchShelly25(ip)));
}
