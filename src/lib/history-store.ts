import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { env } from "@/lib/env";
import type { HeatpumpSnapshot } from "@/lib/types";

const RETENTION_DAYS = 30;

function retentionCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** ISO date string in local-ish terms (UTC day boundary). */
export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadJsonRecord(filePath: string): Record<string, HeatpumpSnapshot> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as Record<string, HeatpumpSnapshot>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveJsonRecord(filePath: string, values: Record<string, HeatpumpSnapshot>) {
  writeFileSync(filePath, JSON.stringify(values, null, 2));
}

export function createHistoryStore(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });

  return {
    save(snapshot: HeatpumpSnapshot, retentionDays = RETENTION_DAYS) {
      const records = loadJsonRecord(dbPath);
      records[snapshot.timestampUtc] = snapshot;

      const cutoff = new Date(retentionCutoffIso(retentionDays)).getTime();
      const filtered = Object.values(records).filter((entry) => new Date(entry.timestampUtc).getTime() >= cutoff);
      const nextRecords = Object.fromEntries(filtered.map((entry) => [entry.timestampUtc, entry]));
      saveJsonRecord(dbPath, nextRecords);
    },

    getHistory(days = RETENTION_DAYS): HeatpumpSnapshot[] {
      const cutoff = new Date(retentionCutoffIso(days)).getTime();
      const records = loadJsonRecord(dbPath);
      return Object.values(records)
        .filter((entry) => new Date(entry.timestampUtc).getTime() >= cutoff)
        .sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc));
    },

    close() {
      // no-op: file-backed storage is self-contained and does not need an explicit handle
    },
  };
}

let store: ReturnType<typeof createHistoryStore> | null = null;

function historyStore() {
  if (!store) {
    store = createHistoryStore(env().HEATPUMP_HISTORY_DB_PATH);
  }
  return store;
}

export function saveHeatpumpSnapshot(snapshot: HeatpumpSnapshot) {
  historyStore().save(snapshot);
}

export function getHeatpumpHistory(days = RETENTION_DAYS) {
  return historyStore().getHistory(days);
}
