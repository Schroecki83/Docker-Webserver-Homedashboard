import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { env } from "@/lib/env";

const RETENTION_DAYS = 2;

function retentionCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** ISO date string at UTC day boundary. */
export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface FroniusDailyBaseline {
  meterImportWh: number;
  meterExportWh: number;
  inverterTotalWh: number;
}

interface FroniusBaselineRecord {
  date: string;
  meter_import_wh: number;
  meter_export_wh: number;
  inverter_total_wh: number;
  recorded_at: string;
}

function loadJsonRecord(filePath: string): Record<string, FroniusBaselineRecord> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as Record<string, FroniusBaselineRecord>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveJsonRecord(filePath: string, values: Record<string, FroniusBaselineRecord>) {
  writeFileSync(filePath, JSON.stringify(values, null, 2));
}

export function createFroniusBaselineStore(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });

  return {
    ensureDailyBaseline(date: string, meterImportWh: number, meterExportWh: number, inverterTotalWh: number) {
      const records = loadJsonRecord(dbPath);
      const now = new Date().toISOString();
      records[date] = {
        date,
        meter_import_wh: meterImportWh,
        meter_export_wh: meterExportWh,
        inverter_total_wh: inverterTotalWh,
        recorded_at: now,
      };

      const cutoff = new Date(retentionCutoffIso(RETENTION_DAYS)).getTime();
      const filtered = Object.values(records).filter((entry) => new Date(entry.recorded_at).getTime() >= cutoff);
      const nextRecords = Object.fromEntries(filtered.map((entry) => [entry.date, entry]));
      saveJsonRecord(dbPath, nextRecords);
    },

    getDailyBaseline(date: string): FroniusDailyBaseline | null {
      const records = loadJsonRecord(dbPath);
      const row = records[date];

      if (!row) {
        return null;
      }

      return {
        meterImportWh: row.meter_import_wh,
        meterExportWh: row.meter_export_wh,
        inverterTotalWh: row.inverter_total_wh,
      };
    },

    close() {
      // no-op: file-backed storage is self-contained and does not need an explicit handle
    },
  };
}

let store: ReturnType<typeof createFroniusBaselineStore> | null = null;

function froniusBaselineStore() {
  if (!store) {
    store = createFroniusBaselineStore(env().FRONIUS_BASELINE_DB_PATH);
  }
  return store;
}

export function ensureFroniusDailyBaseline(date: string, meterImportWh: number, meterExportWh: number, inverterTotalWh: number) {
  froniusBaselineStore().ensureDailyBaseline(date, meterImportWh, meterExportWh, inverterTotalWh);
}

export function getFroniusDailyBaseline(date: string): FroniusDailyBaseline | null {
  return froniusBaselineStore().getDailyBaseline(date);
}
