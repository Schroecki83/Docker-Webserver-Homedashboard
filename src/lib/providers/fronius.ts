import { env } from "@/lib/env";
import {
  FRONIUS_ARCHIVE_CHANNEL_MAP,
  computeLoadEnergyTodayKwh,
} from "@/lib/providers/fronius-mapping";
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

interface FroniusArchiveChannel {
  Values?: Record<string, number | null> | null;
}

interface FroniusArchiveDataPoint {
  Data?: Record<string, FroniusArchiveChannel> | null;
}

interface FroniusArchiveResponse {
  Head: {
    Status: FroniusStatus;
  };
  Body: {
    Data?: Record<string, FroniusArchiveDataPoint> | null;
  };
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

interface FroniusArchiveMetrics {
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
  const [powerFlowResponse, archiveMetrics, storageMetrics] = await Promise.all([
    fetchJson<FroniusPowerFlowResponse>(`${baseUrl}/solar_api/v1/GetPowerFlowRealtimeData.fcgi`, headers),
    fetchArchiveMetrics(baseUrl, headers).catch(() => ({ gridImportTodayKwh: null, gridExportTodayKwh: null })),
    fetchStorageMetrics(baseUrl, headers).catch(() => ({ batterySocPct: null, batteryStoredEnergyKwh: null, batteryCapacityKwh: null })),
  ]);

  const metrics = mapPowerFlow(powerFlowResponse);
  const batterySocPct = storageMetrics.batterySocPct ?? metrics.batterySocPct;

  return {
    ...metrics,
    loadEnergyTodayKwh: computeLoadEnergyTodayKwh({
      pvEnergyTodayKwh: metrics.pvEnergyTodayKwh,
      gridImportTodayKwh: archiveMetrics.gridImportTodayKwh,
      gridExportTodayKwh: archiveMetrics.gridExportTodayKwh,
    }),
    gridExportTodayKwh: archiveMetrics.gridExportTodayKwh,
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

async function fetchArchiveMetrics(baseUrl: string, headers?: HeadersInit): Promise<FroniusArchiveMetrics> {
  const params = new URLSearchParams({
    Scope: "System",
    StartDate: froniusToday(),
    EndDate: froniusToday(),
  });
  params.append("Channel", FRONIUS_ARCHIVE_CHANNEL_MAP.gridImportTodayKwh);
  params.append("Channel", FRONIUS_ARCHIVE_CHANNEL_MAP.gridExportTodayKwh);

  const payload = await fetchJson<FroniusArchiveResponse>(`${baseUrl}/solar_api/v1/GetArchiveData.cgi?${params.toString()}`, headers);
  ensureStatusOk(payload.Head.Status);

  const channels = Object.values(payload.Body.Data ?? {})
    .flatMap((item) => Object.entries(item?.Data ?? {}));

  const gridImportedKwh = getFirstArchiveValue(channels, FRONIUS_ARCHIVE_CHANNEL_MAP.gridImportTodayKwh);
  const gridExportedKwh = getFirstArchiveValue(channels, FRONIUS_ARCHIVE_CHANNEL_MAP.gridExportTodayKwh);

  return {
    gridImportTodayKwh: gridImportedKwh,
    gridExportTodayKwh: gridExportedKwh,
  };
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

function getFirstArchiveValue(
  channels: Array<[string, FroniusArchiveChannel]>,
  channelName: string,
): number | null {
  const match = channels.find(([name]) => name === channelName)?.[1];
  const values = Object.values(match?.Values ?? {}).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }

  return toKwh(values[0]);
}

function froniusToday(): string {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function toKwh(valueWh: number | null | undefined): number | null {
  if (valueWh === null || valueWh === undefined || Number.isNaN(valueWh)) {
    return null;
  }

  return valueWh / 1000;
}
