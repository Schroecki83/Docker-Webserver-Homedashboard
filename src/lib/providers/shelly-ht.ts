/**
 * Shelly Gen1 H&T adapter — local LAN HTTP polling.
 * Supports: Shelly H&T (humidity + temperature sensor).
 * Endpoint: GET http://<ip>/status
 */
import type { ClimateReading } from "@/lib/types";
import { log } from "@/lib/logger";
import { getCachedShellyHt, getCachedShellyName, setCachedShellyHt, setCachedShellyName } from "@/lib/shelly-ht-cache";
import { getLatestClimateReading } from "@/lib/history-store";

interface ShellyHtStatus {
  tmp?: { value: number; tC: number; tF: number; is_valid: boolean };
  hum?: { value: number; is_valid: boolean };
  time?: string;
}

interface ShellyHtSettings {
  name?: string;
}

const SHELLY_NAME_OVERRIDES: Record<string, string> = {
  "192.168.70.34": "Wohnzimmer",
  "192.168.70.40": "Gang 1. OG",
  "192.168.70.36": "Vorhaus",
};

function nowUtc(): string {
  return new Date().toISOString();
}

function resolveShellyName(ip: string, apiName: string | null): string | null {
  return SHELLY_NAME_OVERRIDES[ip] ?? apiName;
}

async function fetchShellyHtName(ip: string): Promise<string | null> {
  const cachedName = getCachedShellyName(ip);
  if (cachedName) {
    return cachedName;
  }

  try {
    const settingsUrl = `http://${ip}/settings`;
    const res = await fetch(settingsUrl, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!res.ok) {
      return null;
    }

    const settings = (await res.json()) as ShellyHtSettings;
    const name = settings.name?.trim();
    if (!name) {
      return null;
    }

    setCachedShellyName(ip, name);
    return name;
  } catch {
    return cachedName;
  }
}

export async function fetchShellyHt(ip: string): Promise<ClimateReading> {
  const url = `http://${ip}/status`;
  let status: ShellyHtStatus;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    status = (await res.json()) as ShellyHtStatus;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "shelly.ht.fetch_failed", { ip, message });
    // Device is likely sleeping — prefer in-memory cache, then SQLite history, then null reading.
    const cached = getCachedShellyHt(ip);
    if (cached) {
      return {
        ...cached,
        deviceName: resolveShellyName(ip, cached.deviceName ?? getCachedShellyName(ip)),
      };
    }

    const persisted = getLatestClimateReading(ip);
    if (persisted) {
      return {
        ...persisted,
        deviceName: resolveShellyName(ip, persisted.deviceName ?? getCachedShellyName(ip)),
      };
    }

    return {
      ip,
      deviceName: resolveShellyName(ip, getCachedShellyName(ip)),
      temperatureC: null,
      humidityPct: null,
      timestampUtc: nowUtc(),
    };
  }

  const deviceName = resolveShellyName(ip, await fetchShellyHtName(ip));

  const reading: ClimateReading = {
    ip,
    deviceName,
    temperatureC: status.tmp?.is_valid ? (status.tmp.tC ?? status.tmp.value) : null,
    humidityPct: status.hum?.is_valid ? status.hum.value : null,
    timestampUtc: nowUtc(),
  };

  // Keep cache up-to-date with successful live readings.
  setCachedShellyHt(ip, reading);
  return reading;
}

export async function fetchAllShellyHt(ips: string[]): Promise<ClimateReading[]> {
  return Promise.all(ips.map((ip) => fetchShellyHt(ip)));
}
