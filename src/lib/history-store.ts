import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { env } from "@/lib/env";
import type { ClimateReading, HeatpumpSnapshot } from "@/lib/types";

const RETENTION_DAYS = 30;

function retentionCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** ISO date string in local-ish terms (UTC day boundary). */
export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface HeatpumpHistoryRow {
  timestamp_utc: string;
  vorlauf_c: number | null;
  ruecklauf_c: number | null;
  ruecklauf_soll_c: number | null;
  heissgas_c: number | null;
  aussentemperatur_c: number | null;
  warmwasser_ist_c: number | null;
  warmwasser_soll_c: number | null;
  waermequelle_ein_c: number | null;
  waermequelle_aus_c: number | null;
}

function mapRowToSnapshot(row: HeatpumpHistoryRow): HeatpumpSnapshot {
  return {
    timestampUtc: row.timestamp_utc,
    vorlauf_c: row.vorlauf_c,
    ruecklauf_c: row.ruecklauf_c,
    ruecklauf_soll_c: row.ruecklauf_soll_c,
    heissgas_c: row.heissgas_c,
    aussentemperatur_c: row.aussentemperatur_c,
    warmwasser_ist_c: row.warmwasser_ist_c,
    warmwasser_soll_c: row.warmwasser_soll_c,
    waermequelle_ein_c: row.waermequelle_ein_c,
    waermequelle_aus_c: row.waermequelle_aus_c,
  };
}

interface ClimateHistoryRow {
  timestamp_utc: string;
  ip: string;
  device_name: string | null;
  temperature_c: number | null;
  humidity_pct: number | null;
}

function mapClimateRow(row: ClimateHistoryRow): ClimateReading {
  return {
    ip: row.ip,
    deviceName: row.device_name,
    temperatureC: row.temperature_c,
    humidityPct: row.humidity_pct,
    timestampUtc: row.timestamp_utc,
  };
}

export function createHistoryStore(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS heatpump_history (
      timestamp_utc TEXT PRIMARY KEY,
      vorlauf_c REAL,
      ruecklauf_c REAL,
      ruecklauf_soll_c REAL,
      heissgas_c REAL,
      aussentemperatur_c REAL,
      warmwasser_ist_c REAL,
      warmwasser_soll_c REAL,
      waermequelle_ein_c REAL,
      waermequelle_aus_c REAL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS shelly_ht_history (
      timestamp_utc TEXT NOT NULL,
      ip TEXT NOT NULL,
      device_name TEXT,
      temperature_c REAL,
      humidity_pct REAL,
      PRIMARY KEY (timestamp_utc, ip)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS fronius_daily_baseline (
      date TEXT PRIMARY KEY,
      meter_import_wh REAL NOT NULL,
      meter_export_wh REAL NOT NULL,
      inverter_total_wh REAL NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO heatpump_history (
      timestamp_utc,
      vorlauf_c,
      ruecklauf_c,
      ruecklauf_soll_c,
      heissgas_c,
      aussentemperatur_c,
      warmwasser_ist_c,
      warmwasser_soll_c,
      waermequelle_ein_c,
      waermequelle_aus_c
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const queryStmt = db.prepare(`
    SELECT
      timestamp_utc,
      vorlauf_c,
      ruecklauf_c,
      ruecklauf_soll_c,
      heissgas_c,
      aussentemperatur_c,
      warmwasser_ist_c,
      warmwasser_soll_c,
      waermequelle_ein_c,
      waermequelle_aus_c
    FROM heatpump_history
    WHERE timestamp_utc >= ?
    ORDER BY timestamp_utc ASC
  `);

  const insertClimateStmt = db.prepare(`
    INSERT OR REPLACE INTO shelly_ht_history (
      timestamp_utc,
      ip,
      device_name,
      temperature_c,
      humidity_pct
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const queryClimateStmt = db.prepare(`
    SELECT
      timestamp_utc,
      ip,
      device_name,
      temperature_c,
      humidity_pct
    FROM shelly_ht_history
    WHERE timestamp_utc >= ?
    ORDER BY timestamp_utc ASC, ip ASC
  `);

  const queryClimateByIpStmt = db.prepare(`
    SELECT
      timestamp_utc,
      ip,
      device_name,
      temperature_c,
      humidity_pct
    FROM shelly_ht_history
    WHERE timestamp_utc >= ? AND ip = ?
    ORDER BY timestamp_utc ASC
  `);

  const queryLatestClimateByIpStmt = db.prepare(`
    SELECT
      timestamp_utc,
      ip,
      device_name,
      temperature_c,
      humidity_pct
    FROM shelly_ht_history
    WHERE ip = ?
    ORDER BY timestamp_utc DESC
    LIMIT 1
  `);

  const pruneStmt = db.prepare(`DELETE FROM heatpump_history WHERE timestamp_utc < ?`);
  const pruneClimateStmt = db.prepare(`DELETE FROM shelly_ht_history WHERE timestamp_utc < ?`);

  const insertBaselineStmt = db.prepare(`
    INSERT OR IGNORE INTO fronius_daily_baseline (date, meter_import_wh, meter_export_wh, inverter_total_wh, recorded_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const getBaselineStmt = db.prepare(`
    SELECT meter_import_wh, meter_export_wh, inverter_total_wh FROM fronius_daily_baseline WHERE date = ?
  `);
  const pruneBaselineStmt = db.prepare(`
    DELETE FROM fronius_daily_baseline WHERE recorded_at < ?
  `);

  return {
    save(snapshot: HeatpumpSnapshot, retentionDays = RETENTION_DAYS) {
      insertStmt.run(
        snapshot.timestampUtc,
        snapshot.vorlauf_c,
        snapshot.ruecklauf_c,
        snapshot.ruecklauf_soll_c,
        snapshot.heissgas_c,
        snapshot.aussentemperatur_c,
        snapshot.warmwasser_ist_c,
        snapshot.warmwasser_soll_c,
        snapshot.waermequelle_ein_c,
        snapshot.waermequelle_aus_c,
      );
      pruneStmt.run(retentionCutoffIso(retentionDays));
    },

    getHistory(days = RETENTION_DAYS): HeatpumpSnapshot[] {
      const rows = queryStmt.all(retentionCutoffIso(days)) as unknown as HeatpumpHistoryRow[];
      return rows.map(mapRowToSnapshot);
    },

    saveClimate(readings: ClimateReading[], retentionDays = RETENTION_DAYS) {
      for (const reading of readings) {
        if (reading.temperatureC === null && reading.humidityPct === null) {
          continue;
        }

        insertClimateStmt.run(
          reading.timestampUtc,
          reading.ip,
          reading.deviceName ?? null,
          reading.temperatureC,
          reading.humidityPct,
        );
      }

      pruneClimateStmt.run(retentionCutoffIso(retentionDays));
    },

    getClimateHistory(days = RETENTION_DAYS, ip?: string): ClimateReading[] {
      const rows = ip
        ? (queryClimateByIpStmt.all(retentionCutoffIso(days), ip) as unknown as ClimateHistoryRow[])
        : (queryClimateStmt.all(retentionCutoffIso(days)) as unknown as ClimateHistoryRow[]);

      return rows.map(mapClimateRow);
    },

    getLatestClimateByIp(ip: string): ClimateReading | null {
      const row = queryLatestClimateByIpStmt.get(ip) as ClimateHistoryRow | undefined;
      if (!row) {
        return null;
      }
      return mapClimateRow(row);
    },

    /** Insert baseline for today only if none exists yet (INSERT OR IGNORE). */
    ensureFroniusDailyBaseline(date: string, meterImportWh: number, meterExportWh: number, inverterTotalWh: number) {
      insertBaselineStmt.run(date, meterImportWh, meterExportWh, inverterTotalWh, new Date().toISOString());
      pruneBaselineStmt.run(retentionCutoffIso(1));
    },

    getFroniusDailyBaseline(date: string): { meterImportWh: number; meterExportWh: number; inverterTotalWh: number } | null {
      const row = getBaselineStmt.get(date) as { meter_import_wh: number; meter_export_wh: number; inverter_total_wh: number } | undefined;
      if (!row) return null;
      return { meterImportWh: row.meter_import_wh, meterExportWh: row.meter_export_wh, inverterTotalWh: row.inverter_total_wh };
    },

    close() {
      db.close();
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

export function saveClimateReadings(readings: ClimateReading[]) {
  historyStore().saveClimate(readings);
}

export function getClimateHistory(days = RETENTION_DAYS, ip?: string) {
  return historyStore().getClimateHistory(days, ip);
}

export function getLatestClimateReading(ip: string) {
  return historyStore().getLatestClimateByIp(ip);
}

export function ensureFroniusDailyBaseline(date: string, meterImportWh: number, meterExportWh: number, inverterTotalWh: number) {
  historyStore().ensureFroniusDailyBaseline(date, meterImportWh, meterExportWh, inverterTotalWh);
}

export function getFroniusDailyBaseline(date: string) {
  return historyStore().getFroniusDailyBaseline(date);
}
