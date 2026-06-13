import { beforeEach, describe, expect, it, vi } from "vitest";

describe("open-meteo provider", () => {
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
    process.env.WEATHER_LAT = "48.117930872502676";
    process.env.WEATHER_LON = "14.86961950661282";
  });

  it("maps five daily forecast entries from Open-Meteo", async () => {
    const { mapOpenMeteoForecast } = await import("@/lib/providers/open-meteo");

    const forecast = mapOpenMeteoForecast(
      {
        latitude: 48.1179,
        longitude: 14.8696,
        timezone: "Europe/Vienna",
        daily: {
          time: ["2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"],
          weather_code: [0, 3, 61, 80, 95, 2],
          temperature_2m_max: [25.3, 23.1, 19.8, 18.5, 21.9, 24.2],
          temperature_2m_min: [13.4, 12.1, 10.5, 9.8, 11.2, 12.3],
          precipitation_probability_max: [10, 20, 75, 60, 85, 15],
          wind_speed_10m_max: [9.2, 12.5, 23.2, 18.1, 30.3, 14.4],
        },
      },
      48.117930872502676,
      14.86961950661282,
    );

    expect(forecast.timezone).toBe("Europe/Vienna");
    expect(forecast.days).toHaveLength(5);
    expect(forecast.days[0]).toMatchObject({
      date: "2026-06-13",
      weatherCode: 0,
      temperatureMaxC: 25.3,
      temperatureMinC: 13.4,
      precipitationProbabilityPct: 10,
      windSpeedMaxKmh: 9.2,
    });
    expect(forecast.days[4]?.weatherCode).toBe(95);
  });

  it("requests the configured coordinate forecast from Open-Meteo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: 48.117930872502676,
        longitude: 14.86961950661282,
        timezone: "Europe/Vienna",
        daily: {
          time: ["2026-06-13"],
          weather_code: [0],
          temperature_2m_max: [25.3],
          temperature_2m_min: [13.4],
          precipitation_probability_max: [10],
          wind_speed_10m_max: [9.2],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWeatherForecast } = await import("@/lib/providers/open-meteo");
    const forecast = await fetchWeatherForecast();

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("latitude=48.117930872502676");
    expect(requestUrl).toContain("longitude=14.86961950661282");
    expect(requestUrl).toContain("forecast_days=5");
    expect(forecast.days).toHaveLength(1);
  });
});