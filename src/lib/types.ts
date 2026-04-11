export type SourceState = "ok" | "stale" | "error";

export interface SourceMetadata {
  source: "fronius" | "shelly" | "luxtronic";
  state: SourceState;
  updatedAt: string;
  message?: string;
}

export interface ElectricalMetrics {
  pvPowerW: number;
  gridPowerW: number;
  loadPowerW: number;
  batteryPowerW: number;
  autonomyPct: number | null;
  selfConsumptionPct: number | null;
  batterySocPct: number | null;
  timestampUtc: string;
}

export interface HeatpumpSnapshot {
  timestampUtc: string;
  vorlauf_c: number | null;
  ruecklauf_c: number | null;
  ruecklauf_soll_c: number | null;
  heissgas_c: number | null;
  aussentemperatur_c: number | null;
  warmwasser_ist_c: number | null;
  warmwasser_soll_c: number | null;
  waermequelle_ein_c: number | null;
  waermequelle_aus_c: number | null;
}

export interface ClimateReading {
  ip: string;
  temperatureC: number | null;
  humidityPct: number | null;
  timestampUtc: string;
}

export interface ShutterReading {
  ip: string;
  positionPct: number | null;
  powerW: number | null;
  isMoving: boolean;
  timestampUtc: string;
}

export interface DashboardSnapshot {
  electrical?: ElectricalMetrics;
  heatpump?: HeatpumpSnapshot;
  climate: ClimateReading[];
  shutters: ShutterReading[];
  sources: SourceMetadata[];
}