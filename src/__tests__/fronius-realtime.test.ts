import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FroniusRealtimePanel } from "@/app/DashboardClient";
import { fetchRealtimePowerFlow } from "@/lib/providers/fronius";

vi.mock("@/lib/env", () => ({
  env: () => ({ FRONIUS_BASE_URL: "http://fronius.test", FRONIUS_USERNAME: "", FRONIUS_PASSWORD: "" }),
}));

const powerFlow = {
  Head: { Status: { Code: 0, Reason: "", UserMessage: "" }, Timestamp: "2026-04-11T11:48:02+00:00" },
  Body: {
    Data: {
      Site: { P_PV: 2500, P_Grid: -500, P_Load: -1000, P_Akku: -1000, E_Day: 50000 },
      Inverters: { "1": { SOC: 40 } },
    },
  },
};

const storage = {
  Head: { Status: { Code: 0, Reason: "", UserMessage: "" } },
  Body: { Data: { "1": { Controller: { StateOfCharge_Relative: 75, DesignedCapacity: 10000 } } } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Fronius realtime", () => {
  it("requests only live power flow and storage data, and shows no daily or capacity values", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const payload = String(url).includes("GetPowerFlowRealtimeData") ? powerFlow : storage;
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const metrics = await fetchRealtimePowerFlow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("GetPowerFlowRealtimeData.fcgi"),
      expect.stringContaining("GetStorageRealtimeData.cgi"),
    ]);
    expect(metrics.batterySocPct).toBe(75);

    const html = renderToStaticMarkup(createElement(FroniusRealtimePanel, { electrical: metrics }));
    expect(html).toContain("PV Production");
    expect(html).toContain("Consumption");
    expect(html).toContain("Grid");
    expect(html).toContain("Battery");
    expect(html).toContain("SOC 75%");
    expect(html).toContain("2.50");
    expect(html).not.toContain("Tageswerte");
    expect(html).not.toContain("kWh");
    expect(html).not.toContain("Kapazitaet");
  });

  it("shows unavailable values rather than zero when there is no reading", () => {
    const html = renderToStaticMarkup(createElement(FroniusRealtimePanel, {}));
    expect(html).toContain("Keine Live-Daten");
    expect(html.match(/<strong>--<\/strong>/g)).toHaveLength(4);
    expect(html).not.toContain("Kein Verbrauch");
  });

  it("uses the inverter charge when storage data fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) =>
      String(url).includes("GetPowerFlowRealtimeData")
        ? new Response(JSON.stringify(powerFlow), { status: 200 })
        : new Response(null, { status: 503 }),
    ));
    expect((await fetchRealtimePowerFlow()).batterySocPct).toBe(40);
  });

  it("reports power flow errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) =>
      String(url).includes("GetPowerFlowRealtimeData")
        ? new Response(null, { status: 503 })
        : new Response(JSON.stringify(storage), { status: 200 }),
    ));
    await expect(fetchRealtimePowerFlow()).rejects.toThrow("Fronius HTTP error 503");
  });
});
