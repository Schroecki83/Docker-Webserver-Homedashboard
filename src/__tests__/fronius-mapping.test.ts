import { describe, expect, it } from "vitest";

import { mapPowerFlow } from "@/lib/providers/fronius";

describe("mapPowerFlow", () => {
  it("maps a valid Fronius powerflow response", () => {
    const result = mapPowerFlow({
      Head: {
        Status: {
          Code: 0,
          Reason: "",
          UserMessage: "",
        },
        Timestamp: "2026-04-11T11:48:02+00:00",
      },
      Body: {
        Data: {
          Site: {
            P_PV: 6096.17,
            P_Grid: 2.2,
            P_Load: -2937.49,
            P_Akku: -3117.62,
            rel_Autonomy: 99.92,
            rel_SelfConsumption: 100,
          },
          Inverters: {
            "1": {
              SOC: 89.9,
            },
          },
        },
      },
    });

    expect(result).toEqual({
      pvPowerW: 6096.17,
      gridPowerW: 2.2,
      loadPowerW: 2937.49,
      batteryPowerW: -3117.62,
      autonomyPct: 99.92,
      selfConsumptionPct: 100,
      batterySocPct: 89.9,
      timestampUtc: "2026-04-11T11:48:02+00:00",
    });
  });

  it("rejects non-zero Fronius status codes", () => {
    expect(() =>
      mapPowerFlow({
        Head: {
          Status: {
            Code: 1,
            Reason: "failure",
            UserMessage: "bad request",
          },
          Timestamp: "2026-04-11T11:48:02+00:00",
        },
        Body: {
          Data: {
            Site: {
              P_PV: 0,
              P_Grid: 0,
              P_Load: 0,
              P_Akku: 0,
            },
          },
        },
      } as never),
    ).toThrow("bad request");
  });
});