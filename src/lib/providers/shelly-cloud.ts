/**
 * Shelly Cloud API provider.
 *
 * Fetches Shelly H&T sensor data from Shelly Cloud.
 * No local LAN polling or webhook cache is used.
 *
 * Requires SHELLY_CLOUD_AUTH_TOKEN environment variable.
 * Get token: https://control.shelly.cloud → Account → Mobile App
 */
import type { ClimateReading } from "@/lib/types";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

interface ShellyCloudHtData {
  tmp?: { value?: number; tC?: number; is_valid?: boolean };
  hum?: { value?: number; is_valid?: boolean };
  temperature?: number;
  humidity?: number;
  ext_temperature?: number | { value?: number; tC?: number };
  ext_humidity?: number | { value?: number };
  name?: string;
  id?: string;
  _updated?: string;
  wifi_sta?: { ip?: string };
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object") {
    const candidate = value as { value?: unknown; tC?: unknown };
    return asFiniteNumber(candidate.value) ?? asFiniteNumber(candidate.tC);
  }

  return null;
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = asFiniteNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

const SHELLY_NAME_OVERRIDES: Record<string, string> = {
  // by IP
  "192.168.70.34": "Wohnzimmer",
  "192.168.70.40": "Gang 1. OG",
  "192.168.70.36": "Vorhaus",
  // by device ID (as returned by Shelly Cloud API)
  "e4d0ae": "Wohnzimmer",
  "244cab43695d": "Gang 1. OG",
  "ad55a4": "Vorhaus",
};

export async function fetchShellyCloudDevices(): Promise<ClimateReading[]> {
  const config = env();
  const token = config.SHELLY_CLOUD_AUTH_TOKEN;
  const apiUrl = config.SHELLY_CLOUD_API_URL;
  const expectedDevices = new Set(config.SHELLY_HT_DEVICES);

  log("info", "shelly.cloud.fetch_start", { apiUrl, hasToken: !!token });

  if (!token) {
    log("warn", "shelly.cloud.no_token", {});
    return [];
  }

  try {
    const url = `${apiUrl}/device/all_status?auth_key=${encodeURIComponent(token)}`;
    log("info", "shelly.cloud.api_call", { endpoint: `${apiUrl}/device/all_status` });
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log("warn", "shelly.cloud.api_error", { status: response.status });
      return [];
    }

    const payload = (await response.json()) as {
      data?: {
        devices_status?: Record<string, ShellyCloudHtData>;
      } | Record<string, ShellyCloudHtData>;
    };

    const nestedStatuses = payload.data && "devices_status" in payload.data ? payload.data.devices_status : undefined;
    const deviceStatuses = nestedStatuses ?? (payload.data as Record<string, ShellyCloudHtData> | undefined) ?? {};

    // Accept legacy (tmp/hum) and newer payload variants (temperature/ext_temperature).
    const readings: ClimateReading[] = [];
    for (const [id, htData] of Object.entries(deviceStatuses)) {
      const temperatureC = pickFirstNumber(htData.tmp?.value, htData.tmp?.tC, htData.temperature, htData.ext_temperature);
      const humidityPct = pickFirstNumber(htData.hum?.value, htData.humidity, htData.ext_humidity);

      if (temperatureC === null && humidityPct === null) {
        continue;
      }

      const ip = htData.wifi_sta?.ip ?? id;
      if (expectedDevices.size > 0 && !expectedDevices.has(ip) && !expectedDevices.has(id)) {
        continue;
      }

      const deviceName = htData.name ?? SHELLY_NAME_OVERRIDES[ip] ?? SHELLY_NAME_OVERRIDES[id] ?? ip;
      const timestampUtc = htData._updated
        ? new Date(htData._updated + " UTC").toISOString()
        : new Date().toISOString();

      readings.push({
        ip,
        deviceName,
        temperatureC,
        humidityPct,
        timestampUtc,
      });
    }

    return readings;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "shelly.cloud.fetch_failed", { message });
    return [];
  }
}
