# Fronius Mapping

This document defines how Fronius API payloads are mapped into the dashboard electrical metrics.

## Realtime Power Flow Mapping

| Dashboard metric | Fronius source |
| --- | --- |
| pvPowerW | Site.P_PV |
| gridPowerW | Site.P_Grid |
| loadPowerW | abs(Site.P_Load) |
| batteryPowerW | Site.P_Akku |
| pvEnergyTodayKwh | derived from `TOTAL_ENERGY` daily delta baseline |
| autonomyPct | Site.rel_Autonomy |
| selfConsumptionPct | Site.rel_SelfConsumption |
| batterySocPct | Inverters[0].SOC (fallback only) |
| timestampUtc | Head.Timestamp |

Endpoint:
- GET /solar_api/v1/GetPowerFlowRealtimeData.fcgi

## Daily Energy Mapping

Daily values are derived from local cumulative counters, because some GEN24 installations return `null` for `E_Day`/`DAY_ENERGY`.

Read each cycle:
- GET /solar_api/v1/GetMeterRealtimeData.cgi?Scope=System
	- `EnergyReal_WAC_Plus_Absolute` (grid import lifetime Wh)
	- `EnergyReal_WAC_Minus_Absolute` (grid export lifetime Wh)
- GET /solar_api/v1/GetInverterRealtimeData.cgi?Scope=Device&DeviceId=1&DataCollection=CommonInverterData
	- `TOTAL_ENERGY.Value` (PV lifetime Wh)

Daily baseline logic:
- First successful sample per UTC day is stored in SQLite table `fronius_daily_baseline`.
- Current day values are calculated as `current_lifetime - baseline_lifetime`.
- Baseline rows are pruned to 24h retention.

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

The mapping constants used by runtime code are defined in src/lib/providers/fronius-mapping.ts.
