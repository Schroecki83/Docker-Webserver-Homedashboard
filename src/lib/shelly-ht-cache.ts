/**
 * In-process last-known-value cache for battery-powered Shelly H&T sensors.
 *
 * These sensors sleep most of the time and cannot be polled via HTTP.
 * Instead, they are configured in their web UI to call
 *   http://<pi-ip>:3001/api/shelly/ht/report?ip={ip}&temp={tC}&hum={hum}&id={id}
 * whenever they wake up (typically every 5–10 min, configurable).
 *
 * This module stores the most recent reading per device IP so the snapshot
 * API can always return at least a "last known" value.
 */
import type { ClimateReading } from "@/lib/types";

const cache = new Map<string, ClimateReading>();
const nameCache = new Map<string, string>();

function normaliseName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function setCachedShellyName(ip: string, name: string | null | undefined): void {
  const normalised = normaliseName(name);
  if (!normalised) return;
  nameCache.set(ip, normalised);
}

export function getCachedShellyName(ip: string): string | null {
  return nameCache.get(ip) ?? null;
}

export function setCachedShellyHt(ip: string, reading: ClimateReading): void {
  const cachedName = normaliseName(reading.deviceName) ?? getCachedShellyName(ip);
  if (cachedName) {
    nameCache.set(ip, cachedName);
  }

  cache.set(ip, {
    ...reading,
    deviceName: cachedName,
  });
}

export function getCachedShellyHt(ip: string): ClimateReading | null {
  const reading = cache.get(ip);
  if (!reading) return null;

  const cachedName = getCachedShellyName(ip);
  if (!cachedName) return reading;

  return {
    ...reading,
    deviceName: cachedName,
  };
}
