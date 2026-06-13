import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

export function createFroniusBaselineStore(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS fronius_daily_baseline (
      date TEXT PRIMARY KEY,
      meter_import_wh REAL NOT NULL,
      meter_export_wh REAL NOT NULL,
      inverter_total_wh REAL NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `);

  const insertBaselineStmt = db.prepare(`
    INSERT OR IGNORE INTO fronius_daily_baseline (date, meter_import_wh, meter_export_wh, inverter_total_wh, recorded_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const getBaselineStmt = db.prepare(`
    SELECT meter_import_wh, meter_export_wh, inverter_total_wh
    FROM fronius_daily_baseline
    WHERE date = ?
  `);

  const pruneBaselineStmt = db.prepare(`
    DELETE FROM fronius_daily_baseline
    WHERE recorded_at < ?
  `);

  return {
    ensureDailyBaseline(date: string, meterImportWh: number, meterExportWh: number, inverterTotalWh: number) {
      insertBaselineStmt.run(date, meterImportWh, meterExportWh, inverterTotalWh, new Date().toISOString());
      pruneBaselineStmt.run(retentionCutoffIso(RETENTION_DAYS));
    },

    getDailyBaseline(date: string): FroniusDailyBaseline | null {
      const row = getBaselineStmt.get(date) as
        | { meter_import_wh: number; meter_export_wh: number; inverter_total_wh: number }
        | undefined;

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
      db.close();
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
