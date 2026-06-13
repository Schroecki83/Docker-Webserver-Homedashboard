import { env } from "@/lib/env";
import type { WeatherForecast } from "@/lib/types";

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  daily?: {
    time?: string[];
    weather_code?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function mapOpenMeteoForecast(payload: OpenMeteoResponse, fallbackLatitude: number, fallbackLongitude: number): WeatherForecast {
  const daily = payload.daily;
  const dates = daily?.time ?? [];

  const days = dates.slice(0, 5).map((date, index) => ({
    date,
    weatherCode: asFiniteNumber(daily?.weather_code?.[index]),
    temperatureMinC: asFiniteNumber(daily?.temperature_2m_min?.[index]),
    temperatureMaxC: asFiniteNumber(daily?.temperature_2m_max?.[index]),
    precipitationProbabilityPct: asFiniteNumber(daily?.precipitation_probability_max?.[index]),
    windSpeedMaxKmh: asFiniteNumber(daily?.wind_speed_10m_max?.[index]),
  }));

  return {
    latitude: asFiniteNumber(payload.latitude) ?? fallbackLatitude,
    longitude: asFiniteNumber(payload.longitude) ?? fallbackLongitude,
    timezone: payload.timezone ?? "auto",
    updatedAt: new Date().toISOString(),
    days,
  };
}

export async function fetchWeatherForecast(): Promise<WeatherForecast> {
  const { WEATHER_LAT, WEATHER_LON } = env();

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(WEATHER_LAT));
  url.searchParams.set("longitude", String(WEATHER_LON));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "5");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  return mapOpenMeteoForecast(payload, WEATHER_LAT, WEATHER_LON);
}