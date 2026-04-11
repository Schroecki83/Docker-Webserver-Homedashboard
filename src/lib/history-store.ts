import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { env } from "@/lib/env";
import type { HeatpumpSnapshot } from "@/lib/types";

const RETENTION_DAYS = 30;

function retentionCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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

  const pruneStmt = db.prepare(`DELETE FROM heatpump_history WHERE timestamp_utc < ?`);

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
