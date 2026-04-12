export const FRONIUS_POWERFLOW_FIELD_MAP = {
  pvPowerW: "Site.P_PV",
  gridPowerW: "Site.P_Grid",
  loadPowerW: "abs(Site.P_Load)",
  batteryPowerW: "Site.P_Akku",
  pvEnergyTodayKwh: "Site.E_Day || Inverters[0].E_Day",
  autonomyPct: "Site.rel_Autonomy",
  selfConsumptionPct: "Site.rel_SelfConsumption",
  batterySocPct: "Inverters[0].SOC",
  timestampUtc: "Head.Timestamp",
} as const;

export const FRONIUS_ARCHIVE_CHANNEL_MAP = {
  gridImportTodayKwh: "EnergyReal_WAC_Plus_Absolute",
  gridExportTodayKwh: "EnergyReal_WAC_Minus_Absolute",
} as const;

export const FRONIUS_STORAGE_FIELD_MAP = {
  batterySocPct: "Controller.StateOfCharge_Relative",
  batteryCapacityWh: "Controller.DesignedCapacity || Controller.Capacity_Maximum",
} as const;

export interface LoadEnergyInput {
  pvEnergyTodayKwh: number | null;
  gridImportTodayKwh: number | null;
  gridExportTodayKwh: number | null;
}

export function computeLoadEnergyTodayKwh(input: LoadEnergyInput): number | null {
  const { pvEnergyTodayKwh, gridImportTodayKwh, gridExportTodayKwh } = input;

  if (pvEnergyTodayKwh === null && gridImportTodayKwh === null && gridExportTodayKwh === null) {
    return null;
  }

  return Math.max(0, (pvEnergyTodayKwh ?? 0) - (gridExportTodayKwh ?? 0) + (gridImportTodayKwh ?? 0));
}
