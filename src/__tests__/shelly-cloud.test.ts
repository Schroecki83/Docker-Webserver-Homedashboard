import { beforeEach, describe, expect, it, vi } from "vitest";

describe("shelly-cloud provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    process.env.FRONIUS_BASE_URL = "http://192.168.70.79";
    process.env.FRONIUS_USERNAME = "";
    process.env.FRONIUS_PASSWORD = "";
    process.env.HEATPUMP_HISTORY_DB_PATH = "/tmp/heatpump-history.db";
    process.env.LUXTRONIC_HOST = "192.168.70.47";
    process.env.LUXTRONIC_PORT = "8214";
    process.env.LUXTRONIC_PASSWORD = "9999";
    process.env.SHELLY_HT_DEVICES = "";
    process.env.SHELLY_GEN1_DEVICES = "";
    process.env.SHELLY_CLOUD_API_URL = "https://example.shelly.cloud";
    process.env.SHELLY_CLOUD_AUTH_TOKEN = "token";
  });

  it("parses legacy and modern temperature/humidity payload shapes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          devices_status: {
            one: {
              wifi_sta: { ip: "192.168.70.34" },
              ext_temperature: 21.6,
              ext_humidity: 44,
              _updated: "2026-04-23 12:00:00",
            },
            two: {
              wifi_sta: { ip: "192.168.70.40" },
              tmp: { tC: 20.1 },
              hum: { value: 51 },
            },
            three: {
              wifi_sta: { ip: "192.168.70.36" },
              temperature: 19.8,
            },
            ignored: {
              wifi_sta: { ip: "192.168.70.99" },
            },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchShellyCloudDevices } = await import("@/lib/providers/shelly-cloud");
    const readings = await fetchShellyCloudDevices();

    expect(readings).toHaveLength(3);
    expect(readings.map((r) => r.ip)).toEqual(["192.168.70.34", "192.168.70.40", "192.168.70.36"]);
    expect(readings[0]?.temperatureC).toBe(21.6);
    expect(readings[0]?.humidityPct).toBe(44);
    expect(readings[2]?.temperatureC).toBe(19.8);
    expect(readings[2]?.humidityPct).toBeNull();
  });

  it("filters to SHELLY_HT_DEVICES when configured", async () => {
    process.env.SHELLY_HT_DEVICES = "192.168.70.34,192.168.70.40";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          devices_status: {
            keep1: {
              wifi_sta: { ip: "192.168.70.34" },
              ext_temperature: 21.6,
            },
            keep2: {
              wifi_sta: { ip: "192.168.70.40" },
              tmp: { tC: 20.1 },
            },
            drop: {
              wifi_sta: { ip: "192.168.70.99" },
              ext_temperature: 42.2,
            },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchShellyCloudDevices } = await import("@/lib/providers/shelly-cloud");
    const readings = await fetchShellyCloudDevices();

    expect(readings.map((r) => r.ip)).toEqual(["192.168.70.34", "192.168.70.40"]);
  });
});