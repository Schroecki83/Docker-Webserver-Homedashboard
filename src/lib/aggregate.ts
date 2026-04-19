/**
 * Aggregate service.
 * Fans out to all providers concurrently, tolerates individual failures,
 * and merges results into a single DashboardSnapshot.
 *
 * Staleness rule: a source is "stale" if its timestamp is > 2 minutes old.
 * Precedence: Fronius is authoritative for electrical metrics.
 * Climate data: cloud only
 */
import { fetchPowerFlow } from "@/lib/providers/fronius";
import { fetchAllShelly25 } from "@/lib/providers/shelly-25";
import { fetchLuxtronicSnapshot } from "@/lib/providers/luxtronic-ws";
import { fetchShellyCloudDevices } from "@/lib/providers/shelly-cloud";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { DashboardSnapshot, SourceMetadata, SourceState } from "@/lib/types";

const STALE_MS = 2 * 60 * 1000;

function ageState(timestampUtc: string): SourceState {
  const age = Date.now() - new Date(timestampUtc).getTime();
  return age > STALE_MS ? "stale" : "ok";
}

async function settle<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", `${label}.failed`, { message });
    return { ok: false, message };
  }
}

export async function buildSnapshot(): Promise<DashboardSnapshot> {
  const { SHELLY_GEN1_DEVICES, LUXTRONIC_HOST, LUXTRONIC_PORT, LUXTRONIC_PASSWORD } = env();

  const [froniusResult, shelly25Result, luxtronicResult, shellyCloudResult] = await Promise.all([
    settle("fronius", fetchPowerFlow),
    settle("shelly.25", () => fetchAllShelly25(SHELLY_GEN1_DEVICES)),
    settle("luxtronic", () => fetchLuxtronicSnapshot(LUXTRONIC_HOST, LUXTRONIC_PORT, LUXTRONIC_PASSWORD)),
    settle("shelly.cloud", fetchShellyCloudDevices),
  ]);

  const sources: SourceMetadata[] = [];

  // Fronius source metadata
  if (froniusResult.ok) {
    sources.push({
      source: "fronius",
      state: ageState(froniusResult.value.timestampUtc),
      updatedAt: froniusResult.value.timestampUtc,
    });
  } else {
    sources.push({ source: "fronius", state: "error", updatedAt: new Date().toISOString(), message: froniusResult.message });
  }

  // Shelly source metadata (shutters + cloud climate)
  const shellyOk = shelly25Result.ok || shellyCloudResult.ok;
  sources.push({
    source: "shelly",
    state: shellyOk ? "ok" : "error",
    updatedAt: new Date().toISOString(),
    message: !shellyOk
      ? [shelly25Result.ok ? "" : shelly25Result.message, shellyCloudResult.ok ? "" : shellyCloudResult.message]
          .filter(Boolean)
          .join("; ")
      : undefined,
  });

  // Luxtronic source metadata
  if (luxtronicResult.ok) {
    sources.push({
      source: "luxtronic",
      state: ageState(luxtronicResult.value.timestampUtc),
      updatedAt: luxtronicResult.value.timestampUtc,
    });
  } else {
    sources.push({ source: "luxtronic", state: "error", updatedAt: new Date().toISOString(), message: luxtronicResult.message });
  }

  // Climate data: cloud only
  const climate = shellyCloudResult.ok ? shellyCloudResult.value : [];

  return {
    electrical: froniusResult.ok ? froniusResult.value : undefined,
    heatpump: luxtronicResult.ok ? luxtronicResult.value : undefined,
    climate,
    shutters: shelly25Result.ok ? shelly25Result.value : [],
    sources,
  };
}