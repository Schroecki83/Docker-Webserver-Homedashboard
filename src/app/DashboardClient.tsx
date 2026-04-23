"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClimateReading, DashboardSnapshot, ElectricalMetrics, HeatpumpSnapshot } from "@/lib/types";

type ActiveTab = "shelly" | "pv" | "heatpump";

export function DashboardClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("shelly");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as DashboardSnapshot;
        setSnapshot(data);
        setSnapshotError(null);
      } catch {
        setSnapshotError("Ungültige Antwort vom Server");
      } finally {
        setIsLoading(false);
      }
    };

    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data as string) as { error: string };
        setSnapshotError(data.error);
      } catch {
        // connection error — browser will auto-reconnect
      }
      setIsLoading(false);
    });

    return () => {
      es.close();
    };
  }, []);

  const heatpumpRows = useMemo(() => mapHeatpumpRows(snapshot?.heatpump), [snapshot?.heatpump]);
  const temperatureRows = useMemo(() => mapTemperatureRows(snapshot?.heatpump, snapshot?.climate ?? []).slice(0, 4), [snapshot?.heatpump, snapshot?.climate]);

  return (
    <main className="dash-shell">
      <section className={`dash-frame dash-frame-${activeTab}`}>
        <nav className="tab-row" aria-label="Dashboard Tabs">
          <button
            type="button"
            className={activeTab === "shelly" ? "tab-btn tab-dashboard active" : "tab-btn tab-dashboard"}
            onClick={() => setActiveTab("shelly")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activeTab === "pv" ? "tab-btn tab-fronius active" : "tab-btn tab-fronius"}
            onClick={() => setActiveTab("pv")}
          >
            Fronius
          </button>
          <button
            type="button"
            className={activeTab === "heatpump" ? "tab-btn tab-heizung active" : "tab-btn tab-heizung"}
            onClick={() => setActiveTab("heatpump")}
          >
            Heizung
          </button>
        </nav>

        {isLoading ? <p className="state-line">Lade Live-Daten...</p> : null}

        {activeTab === "shelly" ? (
          <section className="tab-panel tab-panel-dashboard" aria-live="polite">
            <h2>Temperatur</h2>
            {snapshotError ? <p className="state-line error">{snapshotError}</p> : null}

            {temperatureRows.length === 0 ? (
              <p className="state-line">Keine Temperaturdaten vorhanden.</p>
            ) : (
              <div className="temperature-grid">
                {temperatureRows.map((row) => (
                  <article key={row.key} className="temperature-metric">
                    <h4>{row.label}</h4>
                    <strong>{formatTemp(row.temperatureC)}</strong>
                    {row.humidityPct !== null ? <p className="temperature-meta">Luftfeuchte {formatHumidity(row.humidityPct)}</p> : null}
                    <p className="temperature-meta">
                      <StaleBadge timestampUtc={row.timestampUtc} hasData={row.temperatureC !== null} />
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === "pv" ? (
          <section className="tab-panel tab-panel-fronius" aria-live="polite">
            <h2>PV Fronius</h2>
            {snapshotError ? <p className="state-line error">{snapshotError}</p> : null}

            <div className="fronius-layout">
              <FroniusRealtimePanel electrical={snapshot?.electrical} />
              <FroniusDailyPanel electrical={snapshot?.electrical} />
            </div>
          </section>
        ) : (
          <section className="tab-panel tab-panel-heizung" aria-live="polite">
            <h2>Heatpump - Full Information</h2>
            {snapshotError ? <p className="state-line error">{snapshotError}</p> : null}

            <article className="panel-card">
              <h3>Luxtronic</h3>
              {heatpumpRows.length === 0 ? (
                <p className="state-line">Keine Waermepumpen-Daten vorhanden.</p>
              ) : (
                <ul className="metric-list">
                  {heatpumpRows.map((row) => (
                    <li key={row.label}>
                      <span>{row.label}</span>
                      <strong>{formatTemp(row.value)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}
      </section>
    </main>
  );
}

function FroniusRealtimePanel({ electrical }: { electrical?: ElectricalMetrics }) {
  const pvPowerW = electrical?.pvPowerW ?? 0;
  const loadPowerW = electrical?.loadPowerW ?? 0;
  const gridPowerW = electrical?.gridPowerW ?? 0;
  const batteryPowerW = electrical?.batteryPowerW ?? 0;
  const batterySoc = electrical?.batterySocPct ?? null;
  const batteryCapacity = electrical?.batteryCapacityKwh ?? null;
  const gridFlowClass = gridPowerW < 0 ? "flow-green" : gridPowerW > 0 ? "flow-red" : "flow-neutral";
  const batteryFlowClass = batteryPowerW < 0 ? "flow-green" : batteryPowerW > 0 ? "flow-red" : "flow-neutral";

  return (
    <article className="fronius-realtime-card">
      <div className="fronius-realtime-header">
        <p>Realtime</p>
      </div>

      <div className="fronius-realtime-grid">
        <RealtimeMetricCard
          label="PV Production"
          reading={formatPowerParts(pvPowerW)}
          detail={pvPowerW > 0 ? "Produktion aktiv" : "Keine Produktion"}
          accentClass="pv"
        />
        <RealtimeMetricCard
          label="Consumption"
          reading={formatPowerParts(loadPowerW)}
          detail={loadPowerW > 0 ? "Aktueller Verbrauch" : "Kein Verbrauch"}
          accentClass="consumption"
        />
        <RealtimeMetricCard
          label="Grid"
          reading={formatPowerParts(gridPowerW)}
          detail={gridPowerW >= 0 ? "Netzbezug" : "Einspeisung"}
          accentClass="grid"
          flowClass={gridFlowClass}
        />
        <RealtimeMetricCard
          label="Battery"
          reading={formatPowerParts(batteryPowerW)}
          detail={formatBatteryDetail(batterySoc, batteryCapacity)}
          accentClass="battery"
          flowClass={batteryFlowClass}
        />
      </div>
    </article>
  );
}

function RealtimeMetricCard({
  label,
  reading,
  detail,
  accentClass,
  flowClass,
}: {
  label: string;
  reading: { value: string; unit: string };
  detail: string;
  accentClass: string;
  flowClass?: "flow-green" | "flow-red" | "flow-neutral";
}) {
  return (
    <article className={`fronius-metric-card ${accentClass}`}>
      <p>{label}</p>
      <div className={`fronius-metric-reading ${flowClass ?? "flow-neutral"}`}>
        <strong>{reading.value}</strong>
        <span>{reading.unit}</span>
      </div>
      <span>{detail}</span>
    </article>
  );
}

function FroniusDailyPanel({ electrical }: { electrical?: ElectricalMetrics }) {
  const batteryValue =
    electrical?.batteryStoredEnergyKwh !== null && electrical?.batteryStoredEnergyKwh !== undefined
      ? formatEnergy(electrical.batteryStoredEnergyKwh, 1)
      : electrical?.batterySocPct !== null && electrical?.batterySocPct !== undefined
        ? `${Math.round(electrical.batterySocPct)} %`
        : "--";
  const batteryUnit =
    electrical?.batteryStoredEnergyKwh !== null && electrical?.batteryStoredEnergyKwh !== undefined
      ? formatBatteryUnit(electrical.batterySocPct ?? null, electrical.batteryCapacityKwh ?? null)
      : electrical?.batterySocPct !== null && electrical?.batterySocPct !== undefined
        ? "SOC"
        : "";

  return (
    <aside className="fronius-side-card">
      <div className="fronius-day-header">
        <p>{formatDateLabel(electrical?.timestampUtc)}</p>
        <span>Tageswerte</span>
      </div>

      <div className="fronius-day-list">
        <DayMetricRow
          iconSrc="/images/pv.svg"
          iconAlt="PV"
          label="PV Produktion"
          value={formatEnergy(electrical?.pvEnergyTodayKwh ?? null)}
          unit="kWh"
        />
        <DayMetricRow
          iconSrc="/images/consumption.svg"
          iconAlt="Verbrauch"
          label="Stromverbrauch"
          value={formatEnergy(electrical?.loadEnergyTodayKwh ?? null)}
          unit="kWh"
        />
        <DayMetricRow
          iconSrc="/images/battery_25.svg"
          iconAlt="Batterie"
          label="Batterieladung"
          value={batteryValue}
          unit={batteryUnit}
        />
        <DayMetricRow
          iconSrc="/images/grid.svg"
          iconAlt="Netz"
          label="Stromexport"
          value={formatEnergy(electrical?.gridExportTodayKwh ?? null)}
          unit="kWh"
        />
      </div>

      <p className="power-time">{electrical?.timestampUtc ? `Stand: ${formatTime(electrical.timestampUtc)}` : "Kein Zeitstempel"}</p>
    </aside>
  );
}

function DayMetricRow({
  iconSrc,
  iconAlt,
  label,
  value,
  unit,
}: {
  iconSrc: string;
  iconAlt: string;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <article className="fronius-day-item">
      <div className="fronius-day-icon-wrap">
        <img src={iconSrc} alt={iconAlt} className="fronius-day-icon" />
      </div>
      <div className="fronius-day-copy">
        <p>{label}</p>
        <div className="fronius-day-value">
          <strong>{value}</strong>
          {unit ? <span>{unit}</span> : null}
        </div>
      </div>
    </article>
  );
}

function mapHeatpumpRows(heatpump: HeatpumpSnapshot | undefined) {
  if (!heatpump) {
    return [];
  }

  return [
    { label: "Vorlauf", value: heatpump.vorlauf_c },
    { label: "Ruecklauf", value: heatpump.ruecklauf_c },
    { label: "Ruecklauf Soll", value: heatpump.ruecklauf_soll_c },
    { label: "Heissgas", value: heatpump.heissgas_c },
    { label: "Aussentemperatur", value: heatpump.aussentemperatur_c },
    { label: "Warmwasser Ist", value: heatpump.warmwasser_ist_c },
    { label: "Warmwasser Soll", value: heatpump.warmwasser_soll_c },
    { label: "Waermequelle Ein", value: heatpump.waermequelle_ein_c },
    { label: "Waermequelle Aus", value: heatpump.waermequelle_aus_c },
  ];
}

function mapTemperatureRows(heatpump: HeatpumpSnapshot | undefined, climate: ClimateReading[]) {
  const rows = climate.map((item) => ({
    key: item.ip,
    label: item.deviceName ?? item.ip,
    temperatureC: item.temperatureC,
    humidityPct: item.humidityPct,
    timestampUtc: item.timestampUtc,
  }));

  if (heatpump) {
    rows.unshift({
      key: "luxtronic-outdoor",
      label: "Aussentemperatur",
      temperatureC: heatpump.aussentemperatur_c,
      humidityPct: null,
      timestampUtc: heatpump.timestampUtc,
    });
  }

  return rows;
}

function formatTemp(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(1)} °C`;
}

function formatHumidity(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(0)} %`;
}

function formatEnergy(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return value.toLocaleString("de-AT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDateLabel(timestampUtc?: string) {
  const date = timestampUtc ? new Date(timestampUtc) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Heute";
  }

  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Vienna",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StaleBadge({ timestampUtc, hasData }: { timestampUtc: string; hasData: boolean }) {
  if (!hasData) {
    return <span className="stale-badge offline"> schläft, kein letzter Wert</span>;
  }

  const ts = new Date(timestampUtc).getTime();
  if (Number.isNaN(ts)) {
    return <span className="stale-badge cached"> letzter Wert, Zeit unbekannt</span>;
  }

  const ageMin = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  const label = ageMin < 60 ? `vor ${ageMin} min` : `vor ${Math.floor(ageMin / 60)} h`;
  return <span className="stale-badge cached"> letzter Wert {label}</span>;
}

function formatPowerParts(valueW: number) {
  const absValue = Math.abs(valueW);
  if (absValue >= 1000) {
    return { value: (absValue / 1000).toFixed(2), unit: "kW" };
  }
  return { value: `${Math.round(absValue)}`, unit: "W" };
}

function formatBatteryDetail(soc: number | null, capacityKwh: number | null) {
  if (soc !== null && capacityKwh !== null) {
    return `${Math.round(soc)}% von ${formatEnergy(capacityKwh, 1)} kWh`;
  }

  if (soc !== null) {
    return `SOC ${Math.round(soc)}%`;
  }

  if (capacityKwh !== null) {
    return `Kapazitaet ${formatEnergy(capacityKwh, 1)} kWh`;
  }

  return "Keine Batteriedaten";
}

function formatBatteryUnit(soc: number | null, capacityKwh: number | null) {
  if (soc !== null && capacityKwh !== null) {
    return `kWh / ${formatEnergy(capacityKwh, 1)} kWh (${Math.round(soc)}%)`;
  }

  if (soc !== null) {
    return `kWh (${Math.round(soc)}%)`;
  }

  if (capacityKwh !== null) {
    return `kWh / ${formatEnergy(capacityKwh, 1)} kWh`;
  }

  return "kWh";
}
