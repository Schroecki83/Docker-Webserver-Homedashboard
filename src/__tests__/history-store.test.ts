import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createHistoryStore } from "@/lib/history-store";
import type { HeatpumpSnapshot } from "@/lib/types";

function makeSnapshot(timestampUtc: string, vorlauf = 20.4): HeatpumpSnapshot {
  return {
    timestampUtc,
    vorlauf_c: vorlauf,
    ruecklauf_c: 20.8,
    ruecklauf_soll_c: 21.1,
    heissgas_c: 16.5,
    aussentemperatur_c: 14.0,
    warmwasser_ist_c: 47.2,
    warmwasser_soll_c: 48.0,
    waermequelle_ein_c: 11.6,
    waermequelle_aus_c: 12.1,
  };
}

describe("history store", () => {
  it("persists and returns heatpump snapshots in order", () => {
    const dir = mkdtempSync(join(tmpdir(), "heatpump-history-"));
    const store = createHistoryStore(join(dir, "history.db"));

    store.save(makeSnapshot("2026-04-10T00:00:00.000Z", 20.4));
    store.save(makeSnapshot("2026-04-11T00:00:00.000Z", 21.4));

    const result = store.getHistory(30);
    expect(result).toHaveLength(2);
    expect(result[0].vorlauf_c).toBe(20.4);
    expect(result[1].vorlauf_c).toBe(21.4);

    store.close();
  });

  it("prunes entries older than the retention window when saving", () => {
    const dir = mkdtempSync(join(tmpdir(), "heatpump-history-"));
    const store = createHistoryStore(join(dir, "history.db"));
    const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const freshTimestamp = new Date().toISOString();

    store.save(makeSnapshot(oldTimestamp));
    store.save(makeSnapshot(freshTimestamp, 22.2));

    const result = store.getHistory(30);
    expect(result).toHaveLength(1);
    expect(result[0].timestampUtc).toBe(freshTimestamp);

    store.close();
  });
});
