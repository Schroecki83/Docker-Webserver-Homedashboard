# Fronius Mapping

This document defines how Fronius API payloads are mapped into the dashboard electrical metrics.

## Realtime Power Flow Mapping

| Dashboard metric | Fronius source |
| --- | --- |
| pvPowerW | Site.P_PV |
| gridPowerW | Site.P_Grid |
| loadPowerW | abs(Site.P_Load) |
| batteryPowerW | Site.P_Akku |
| pvEnergyTodayKwh | Site.E_Day, fallback Inverters[0].E_Day |
| autonomyPct | Site.rel_Autonomy |
| selfConsumptionPct | Site.rel_SelfConsumption |
| batterySocPct | Inverters[0].SOC (fallback only) |
| timestampUtc | Head.Timestamp |

Endpoint:
- GET /solar_api/v1/GetPowerFlowRealtimeData.fcgi

## Daily Energy Mapping

Archive channels are read from:
- GET /solar_api/v1/GetArchiveData.cgi?Scope=System&StartDate=YYYY-MM-DD&EndDate=YYYY-MM-DD&Channel=EnergyReal_WAC_Plus_Absolute&Channel=EnergyReal_WAC_Minus_Absolute

Channel mapping:
- gridImportTodayKwh: EnergyReal_WAC_Plus_Absolute
- gridExportTodayKwh: EnergyReal_WAC_Minus_Absolute

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
