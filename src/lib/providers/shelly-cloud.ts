/**
 * Shelly Cloud API provider.
 * 
 * Fetches Shelly H&T sensor data via Shelly's cloud API as a fallback when:
 * - Devices are offline/sleeping and not responding to LAN polling
 * - Webhook reports haven't been received recently
 * 
 * Requires SHELLY_CLOUD_AUTH_TOKEN environment variable.
 * Get token: https://control.shelly.cloud → Account → Mobile App
 */
import type { ClimateReading } from "@/lib/types";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

const SHELLY_CLOUD_API_URL = "https://iot.shelly.cloud/iot";

interface ShellyCloudDevice {
  id: string;
  name: string;
  model: string;
  status: Record<string, unknown>;
}

interface ShellyCloudHtData {
  tmp?: { value: number };
  hum?: { value: number };
}

interface ShellyCloudApiError {
  code: number;
  message?: string;
}

function isShellyError(obj: unknown): obj is ShellyCloudApiError {
  return typeof obj === "object" && obj !== null && "code" in obj;
}

export async function fetchShellyCloudDevices(): Promise<ClimateReading[]> {
  const token = env().SHELLY_CLOUD_AUTH_TOKEN;
  if (!token) {
    return [];
  }

  try {
    const response = await fetch(`${SHELLY_CLOUD_API_URL}/devices`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log("warn", "shelly.cloud.api_error", { status: response.status });
      return [];
    }

    const data = (await response.json()) as { devices?: ShellyCloudDevice[] };
    const devices = data.devices ?? [];

    // Filter for H&T devices and extract temperature/humidity
    const readings: ClimateReading[] = [];
    for (const device of devices) {
      if (!device.model.toLowerCase().includes("h&t") && !device.model.toLowerCase().includes("ht")) {
        continue;
      }

      const htData = device.status as ShellyCloudHtData;
      const temperatureC = htData.tmp?.value ?? null;
      const humidityPct = htData.hum?.value ?? null;

      if (temperatureC !== null || humidityPct !== null) {
        readings.push({
          ip: device.id,
          deviceName: device.name ?? null,
          temperatureC,
          humidityPct,
          timestampUtc: new Date().toISOString(),
        });

        log("info", "shelly.cloud.device_fetched", {
          id: device.id,
          name: device.name,
          model: device.model,
          temperatureC,
          humidityPct,
        });
      }
    }

    return readings;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "shelly.cloud.fetch_failed", { message });
    return [];
  }
}
