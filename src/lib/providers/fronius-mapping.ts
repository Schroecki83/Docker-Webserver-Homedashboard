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
