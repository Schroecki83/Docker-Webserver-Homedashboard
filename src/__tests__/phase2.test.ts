import { describe, it, expect } from "vitest";
import { mapPowerFlow } from "@/lib/providers/fronius";
import type { ClimateReading, ShutterReading } from "@/lib/types";

// ── mapPowerFlow sign convention tests ────────────────────────────────────────
describe("mapPowerFlow sign conventions", () => {
  it("loadPowerW is always positive regardless of P_Load sign", () => {
    const base = {
      Head: { Status: { Code: 0, Reason: "", UserMessage: "" }, Timestamp: "2026-04-11T12:00:00+00:00" },
      Body: { Data: { Site: { P_PV: 5000, P_Grid: 0, P_Load: -3000, P_Akku: 0 } } },
    };
    const result = mapPowerFlow(base as never);
    expect(result.loadPowerW).toBe(3000);
  });

  it("exports batteryPowerW negative when battery is charging", () => {
    const base = {
      Head: { Status: { Code: 0, Reason: "", UserMessage: "" }, Timestamp: "2026-04-11T12:00:00+00:00" },
      Body: { Data: { Site: { P_PV: 6000, P_Grid: 0, P_Load: -2000, P_Akku: -3000 } } },
    };
    const result = mapPowerFlow(base as never);
    // Negative P_Akku = charging — we preserve the sign for the UI to interpret
    expect(result.batteryPowerW).toBe(-3000);
  });
});

// ── ClimateReading shape ───────────────────────────────────────────────────────
describe("ClimateReading type contract", () => {
  it("accepts null values for offline sensors", () => {
    const reading: ClimateReading = {
      ip: "192.168.70.34",
      temperatureC: null,
      humidityPct: null,
      timestampUtc: new Date().toISOString(),
    };
    expect(reading.temperatureC).toBeNull();
    expect(reading.humidityPct).toBeNull();
  });
});

// ── ShutterReading shape ───────────────────────────────────────────────────────
describe("ShutterReading type contract", () => {
  it("isMoving is false for closed/open state", () => {
    const reading: ShutterReading = {
      ip: "192.168.70.97",
      positionPct: 100,
      powerW: 0,
      isMoving: false,
      timestampUtc: new Date().toISOString(),
    };
    expect(reading.isMoving).toBe(false);
  });
});
