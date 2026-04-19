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
  name?: string;
  id?: string;
  _updated?: string;
  wifi_sta?: { ip?: string };
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

    // Extract only H&T devices (have both tmp and hum fields)
    const readings: ClimateReading[] = [];
    for (const [id, htData] of Object.entries(deviceStatuses)) {
      if (!htData?.hum) continue; // not an H&T sensor

      const ip = htData.wifi_sta?.ip ?? id;
      const temperatureC = htData.tmp?.value ?? htData.tmp?.tC ?? null;
      const humidityPct = htData.hum?.value ?? null;
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
