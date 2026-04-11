import { env } from "@/lib/env";
import type { ElectricalMetrics } from "@/lib/types";

interface FroniusStatus {
  Code: number;
  Reason: string;
  UserMessage: string;
}

interface FroniusSiteData {
  P_PV: number;
  P_Grid: number;
  P_Load: number;
  P_Akku: number;
  rel_Autonomy?: number | null;
  rel_SelfConsumption?: number | null;
}

interface FroniusInverterData {
  SOC?: number | null;
}

interface FroniusPowerFlowResponse {
  Head: {
    Status: FroniusStatus;
    Timestamp: string;
  };
  Body: {
    Data: {
      Site: FroniusSiteData;
      Inverters?: Record<string, FroniusInverterData>;
    };
  };
}

function buildHeaders() {
  const { FRONIUS_USERNAME, FRONIUS_PASSWORD } = env();
  if (!FRONIUS_USERNAME || !FRONIUS_PASSWORD) {
    return undefined;
  }

  return {
    Authorization: `Basic ${Buffer.from(`${FRONIUS_USERNAME}:${FRONIUS_PASSWORD}`).toString("base64")}`,
  };
}

export function mapPowerFlow(response: FroniusPowerFlowResponse): ElectricalMetrics {
  const status = response.Head.Status;
  if (status.Code !== 0) {
    throw new Error(status.UserMessage || status.Reason || `Fronius request failed with code ${status.Code}`);
  }

  const { Site, Inverters } = response.Body.Data;
  const primaryInverter = Inverters ? Object.values(Inverters)[0] : undefined;

  return {
    pvPowerW: Site.P_PV,
    gridPowerW: Site.P_Grid,
    loadPowerW: Math.abs(Site.P_Load),
    batteryPowerW: Site.P_Akku,
    autonomyPct: Site.rel_Autonomy ?? null,
    selfConsumptionPct: Site.rel_SelfConsumption ?? null,
    batterySocPct: primaryInverter?.SOC ?? null,
    timestampUtc: response.Head.Timestamp,
  };
}

export async function fetchPowerFlow(): Promise<ElectricalMetrics> {
  const { FRONIUS_BASE_URL } = env();
  const url = `${FRONIUS_BASE_URL.replace(/\/$/, "")}/solar_api/v1/GetPowerFlowRealtimeData.fcgi`;
  const response = await fetch(url, { headers: buildHeaders(), cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Fronius HTTP error ${response.status}`);
  }

  const payload = (await response.json()) as FroniusPowerFlowResponse;
  return mapPowerFlow(payload);
}