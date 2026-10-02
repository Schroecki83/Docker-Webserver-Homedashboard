export type SourceState = "ok" | "stale" | "error";

export interface SourceMetadata {
  source: "fronius" | "shelly" | "luxtronic" | "weather";
  state: SourceState;
  updatedAt: string;
  message?: string;
}

export interface WeatherForecastDay {
  date: string;
  weatherCode: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationProbabilityPct: number | null;
  windSpeedMaxKmh: number | null;
}

export interface WeatherForecast {
  latitude: number;
  longitude: number;
  timezone: string;
  updatedAt: string;
  days: WeatherForecastDay[];
}

export interface ElectricalMetrics {
  pvPowerW: number;
  gridPowerW: number;
  loadPowerW: number;
  batteryPowerW: number;
  pvEnergyTodayKwh: number | null;
  loadEnergyTodayKwh: number | null;
  gridImportTodayKwh: number | null;
  gridExportTodayKwh: number | null;
  autonomyPct: number | null;
  selfConsumptionPct: number | null;
  batterySocPct: number | null;
  batteryStoredEnergyKwh: number | null;
  batteryCapacityKwh: number | null;
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
  deviceName?: string | null;
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

export interface HomeConnectEntry {
  key: string;
  label: string;
  value: string | number | boolean | null;
  display: string;
  unit: string | null;
  source: "status" | "setting" | "program" | "option";
}

export interface HomeConnectAppliance {
  haId: string;
  name: string;
  type: string;
  brand: string;
  vib: string;
  connected: boolean;
  finished: boolean;
  entries: HomeConnectEntry[];
  error?: string;
}

export type HomeConnectState = "ok" | "not_configured" | "unauthorized" | "error";

export interface HomeConnectSnapshot {
  state: HomeConnectState;
  message?: string;
  appliances: HomeConnectAppliance[];
  fetchedAtUtc: string | null;
}

export interface HomeConnectDeviceAuth {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresAtUtc: string;
}

export interface DashboardSnapshot {
  electrical?: ElectricalMetrics;
  heatpump?: HeatpumpSnapshot;
  weather?: WeatherForecast;
  climate: ClimateReading[];
  shutters: ShutterReading[];
  sources: SourceMetadata[];
}
