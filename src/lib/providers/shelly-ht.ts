/**
 * Shelly Gen1 H&T adapter — local LAN HTTP polling.
 * Supports: Shelly H&T (humidity + temperature sensor).
 * Endpoint: GET http://<ip>/status
 */
import type { ClimateReading } from "@/lib/types";
import { log } from "@/lib/logger";

interface ShellyHtStatus {
  tmp?: { value: number; tC: number; tF: number; is_valid: boolean };
  hum?: { value: number; is_valid: boolean };
  time?: string;
}

function nowUtc(): string {
  return new Date().toISOString();
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
    return { ip, temperatureC: null, humidityPct: null, timestampUtc: nowUtc() };
  }

  return {
    ip,
    temperatureC: status.tmp?.is_valid ? (status.tmp.tC ?? status.tmp.value) : null,
    humidityPct: status.hum?.is_valid ? status.hum.value : null,
    timestampUtc: nowUtc(),
  };
}

export async function fetchAllShellyHt(ips: string[]): Promise<ClimateReading[]> {
  return Promise.all(ips.map((ip) => fetchShellyHt(ip)));
}
