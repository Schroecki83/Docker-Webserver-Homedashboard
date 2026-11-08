import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFroniusBaselineStore } from "./fronius-baseline-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Fronius daily baseline store", () => {
  it("retains the first readings of a day", () => {
    const directory = mkdtempSync(join(tmpdir(), "fronius-baseline-"));
    temporaryDirectories.push(directory);
    const store = createFroniusBaselineStore(join(directory, "baseline.json"));

    store.ensureDailyBaseline("2026-09-23", 100, 200, 300);
    store.ensureDailyBaseline("2026-09-23", 150, 250, 350);

    expect(store.getDailyBaseline("2026-09-23")).toEqual({
      meterImportWh: 100,
      meterExportWh: 200,
      inverterTotalWh: 300,
    });
  });
});