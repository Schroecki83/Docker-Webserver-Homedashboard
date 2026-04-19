import { env } from "@/lib/env";
import {
  computeLoadEnergyTodayKwh,
} from "@/lib/providers/fronius-mapping";
import { ensureFroniusDailyBaseline, getFroniusDailyBaseline, todayUtcDate } from "@/lib/history-store";
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
  E_Day?: number | null;
  rel_Autonomy?: number | null;
  rel_SelfConsumption?: number | null;
}

interface FroniusInverterData {
  SOC?: number | null;
  E_Day?: number | null;
}

interface FroniusMeterData {
  EnergyReal_WAC_Plus_Absolute?: number | null;
  EnergyReal_WAC_Minus_Absolute?: number | null;
}

interface FroniusMeterResponse {
  Head: { Status: FroniusStatus };
  Body: { Data?: Record<string, FroniusMeterData> | null };
}

interface FroniusInverterCommonData {
  TOTAL_ENERGY?: { Value: number | null } | null;
}

interface FroniusInverterCommonResponse {
  Head: { Status: FroniusStatus };
  Body: { Data: FroniusInverterCommonData };
}

interface FroniusStorageController {
  StateOfCharge_Relative?: number | null;
  DesignedCapacity?: number | null;
  Capacity_Maximum?: number | null;
}

interface FroniusStorageSystemResponse {
  Head: {
    Status: FroniusStatus;
  };
  Body: {
    Data?: Record<string, { Controller?: FroniusStorageController | null } | null> | null;
  };
}

interface FroniusDailyMetrics {
  pvEnergyTodayKwh: number | null;
  gridImportTodayKwh: number | null;
  gridExportTodayKwh: number | null;
}

interface FroniusStorageMetrics {
  batterySocPct: number | null;
  batteryStoredEnergyKwh: number | null;
  batteryCapacityKwh: number | null;
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
  const pvEnergyDayWh = Site.E_Day ?? primaryInverter?.E_Day ?? null;

  return {
    pvPowerW: Site.P_PV,
    gridPowerW: Site.P_Grid,
    loadPowerW: Math.abs(Site.P_Load),
    batteryPowerW: Site.P_Akku,
    pvEnergyTodayKwh: toKwh(pvEnergyDayWh),
    loadEnergyTodayKwh: null,
    gridImportTodayKwh: null,
    gridExportTodayKwh: null,
    autonomyPct: Site.rel_Autonomy ?? null,
    selfConsumptionPct: Site.rel_SelfConsumption ?? null,
    batterySocPct: primaryInverter?.SOC ?? null,
    batteryStoredEnergyKwh: null,
    batteryCapacityKwh: null,
    timestampUtc: response.Head.Timestamp,
  };
}

export async function fetchPowerFlow(): Promise<ElectricalMetrics> {
  const { FRONIUS_BASE_URL } = env();
  const baseUrl = FRONIUS_BASE_URL.replace(/\/$/, "");
  const headers = buildHeaders();
  const [powerFlowResponse, dailyMetrics, storageMetrics] = await Promise.all([
    fetchJson<FroniusPowerFlowResponse>(`${baseUrl}/solar_api/v1/GetPowerFlowRealtimeData.fcgi`, headers),
    fetchDailyMetrics(baseUrl, headers).catch((): FroniusDailyMetrics => ({ pvEnergyTodayKwh: null, gridImportTodayKwh: null, gridExportTodayKwh: null })),
    fetchStorageMetrics(baseUrl, headers).catch(() => ({ batterySocPct: null, batteryStoredEnergyKwh: null, batteryCapacityKwh: null })),
  ]);

  const metrics = mapPowerFlow(powerFlowResponse);
  const batterySocPct = storageMetrics.batterySocPct ?? metrics.batterySocPct;

  return {
    ...metrics,
    pvEnergyTodayKwh: dailyMetrics.pvEnergyTodayKwh,
    loadEnergyTodayKwh: computeLoadEnergyTodayKwh({
      pvEnergyTodayKwh: dailyMetrics.pvEnergyTodayKwh,
      gridImportTodayKwh: dailyMetrics.gridImportTodayKwh,
      gridExportTodayKwh: dailyMetrics.gridExportTodayKwh,
    }),
    gridImportTodayKwh: dailyMetrics.gridImportTodayKwh,
    gridExportTodayKwh: dailyMetrics.gridExportTodayKwh,
    batterySocPct,
    batteryStoredEnergyKwh: storageMetrics.batteryStoredEnergyKwh,
    batteryCapacityKwh: storageMetrics.batteryCapacityKwh,
  };
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, { headers, cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Fronius HTTP error ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchDailyMetrics(baseUrl: string, headers?: HeadersInit): Promise<FroniusDailyMetrics> {
  const [meterResponse, inverterResponse] = await Promise.all([
    fetchJson<FroniusMeterResponse>(`${baseUrl}/solar_api/v1/GetMeterRealtimeData.cgi?Scope=System`, headers),
    fetchJson<FroniusInverterCommonResponse>(
      `${baseUrl}/solar_api/v1/GetInverterRealtimeData.cgi?Scope=Device&DeviceId=1&DataCollection=CommonInverterData`,
      headers,
    ),
  ]);

  const meter = Object.values(meterResponse.Body.Data ?? {})[0];
  const meterImportWh = meter?.EnergyReal_WAC_Plus_Absolute ?? null;
  const meterExportWh = meter?.EnergyReal_WAC_Minus_Absolute ?? null;
  const inverterTotalWh = inverterResponse.Body.Data.TOTAL_ENERGY?.Value ?? null;

  if (meterImportWh === null || meterExportWh === null || inverterTotalWh === null) {
    return { pvEnergyTodayKwh: null, gridImportTodayKwh: null, gridExportTodayKwh: null };
  }

  const today = todayUtcDate();
  ensureFroniusDailyBaseline(today, meterImportWh, meterExportWh, inverterTotalWh);
  const baseline = getFroniusDailyBaseline(today);

  if (!baseline) {
    return { pvEnergyTodayKwh: null, gridImportTodayKwh: null, gridExportTodayKwh: null };
  }

  const gridImportTodayKwh = toKwh(Math.max(0, meterImportWh - baseline.meterImportWh));
  const gridExportTodayKwh = toKwh(Math.max(0, meterExportWh - baseline.meterExportWh));
  const pvEnergyTodayKwh = toKwh(Math.max(0, inverterTotalWh - baseline.inverterTotalWh));

  return { pvEnergyTodayKwh, gridImportTodayKwh, gridExportTodayKwh };
}

async function fetchStorageMetrics(baseUrl: string, headers?: HeadersInit): Promise<FroniusStorageMetrics> {
  const payload = await fetchJson<FroniusStorageSystemResponse>(`${baseUrl}/solar_api/v1/GetStorageRealtimeData.cgi?Scope=System`, headers);
  ensureStatusOk(payload.Head.Status);

  const controllers = Object.values(payload.Body.Data ?? {})
    .map((item) => item?.Controller)
    .filter((controller): controller is FroniusStorageController => Boolean(controller));

  const controller = controllers[0];
  if (!controller) {
    return {
      batterySocPct: null,
      batteryStoredEnergyKwh: null,
      batteryCapacityKwh: null,
    };
  }

  const batterySocPct = controller.StateOfCharge_Relative ?? null;
  const capacityWh = controller.DesignedCapacity ?? controller.Capacity_Maximum ?? null;
  const batteryCapacityKwh = toKwh(capacityWh);

  return {
    batterySocPct,
    batteryStoredEnergyKwh:
      batterySocPct !== null && capacityWh !== null ? ((capacityWh / 1000) * batterySocPct) / 100 : null,
    batteryCapacityKwh,
  };
}

function ensureStatusOk(status: FroniusStatus): void {
  if (status.Code !== 0) {
    throw new Error(status.UserMessage || status.Reason || `Fronius request failed with code ${status.Code}`);
  }
}

function toKwh(valueWh: number | null | undefined): number | null {
  if (valueWh === null || valueWh === undefined || Number.isNaN(valueWh)) {
    return null;
  }

  return valueWh / 1000;
}
