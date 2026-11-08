# Fronius Mapping

This document defines how Fronius API payloads are mapped into the dashboard electrical metrics.

The Fronius tab uses `/api/fronius/realtime` while open, refreshing every 10 seconds. It shows current power flow, battery state of charge and the source timestamp; daily totals and battery capacity are not displayed. `/api/fronius` and the dashboard snapshot retain the existing daily metrics.

## Realtime Power Flow Mapping

| Dashboard metric | Fronius source |
| --- | --- |
| pvPowerW | Site.P_PV |
| gridPowerW | Site.P_Grid |
| loadPowerW | abs(Site.P_Load) |
| batteryPowerW | Site.P_Akku |
| pvEnergyTodayKwh | Site.E_Day or Inverters[0].E_Day, in kWh; overridden by the daily delta baseline in the full API |
| autonomyPct | Site.rel_Autonomy |
| selfConsumptionPct | Site.rel_SelfConsumption |
| batterySocPct | Inverters[0].SOC (fallback only) |
| timestampUtc | Head.Timestamp |

Endpoint:
- GET /solar_api/v1/GetPowerFlowRealtimeData.fcgi

The realtime endpoint also reads storage state of charge. If the storage request fails, it logs a warning and falls back to the inverter's SOC. It does not request the daily counter endpoints.

## Daily Energy Mapping

Daily values are derived from local cumulative counters, because some GEN24 installations return `null` for `E_Day`/`DAY_ENERGY`.

Read each cycle:
- GET /solar_api/v1/GetMeterRealtimeData.cgi?Scope=System
	- `EnergyReal_WAC_Plus_Absolute` (grid import lifetime Wh)
	- `EnergyReal_WAC_Minus_Absolute` (grid export lifetime Wh)
- GET /solar_api/v1/GetInverterRealtimeData.cgi?Scope=Device&DeviceId=1&DataCollection=CommonInverterData
	- `TOTAL_ENERGY.Value` (PV lifetime Wh)

Daily baseline logic:
- First successful sample per UTC day is stored in the JSON file configured by `FRONIUS_BASELINE_DB_PATH`, even if the filename ends in `.db`.
- Current day values are calculated as `current_lifetime - baseline_lifetime`.
- Baselines are pruned by recording time after 2 days.

Mapped daily metrics:
- `gridImportTodayKwh`
- `gridExportTodayKwh`
- `pvEnergyTodayKwh`

Computed metric:
- loadEnergyTodayKwh = max(0, pvEnergyTodayKwh - gridExportTodayKwh + gridImportTodayKwh)

## Storage Mapping

Storage values are read from:
- GET /solar_api/v1/GetStorageRealtimeData.cgi?Scope=System

Controller field mapping:
- batterySocPct: Controller.StateOfCharge_Relative
- batteryCapacityKwh: Controller.DesignedCapacity or Controller.Capacity_Maximum (Wh to kWh)
- batteryStoredEnergyKwh: batteryCapacityKwh * batterySocPct / 100

## Source of Truth

The provider and power-flow mapping are implemented in `src/lib/providers/fronius.ts`; the daily load calculation is in `src/lib/providers/fronius-mapping.ts`.
