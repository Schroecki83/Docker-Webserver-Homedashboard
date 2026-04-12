"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClimateReading, DashboardSnapshot, ElectricalMetrics, HeatpumpSnapshot } from "@/lib/types";

type ActiveTab = "shelly" | "pv" | "heatpump";

interface SolarwebPowerResponse {
  currentPowerW: number;
  display: string;
  timestampUtc: string;
  sourceLabel: "Aktuelle Leistung";
}

const POLL_MS = 30_000;

export function DashboardClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("shelly");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [pv, setPv] = useState<SolarwebPowerResponse | null>(null);
  const [pvError, setPvError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [snapshotRes, pvRes] = await Promise.all([
          fetch("/api/snapshot", { cache: "no-store" }),
          fetch("/api/solarweb/fronius-power", { cache: "no-store" }),
        ]);

        if (!snapshotRes.ok) {
          throw new Error("Snapshot konnte nicht geladen werden");
        }

        const snapshotData = (await snapshotRes.json()) as DashboardSnapshot;
        if (!cancelled) {
          setSnapshot(snapshotData);
          setSnapshotError(null);
        }

        if (!pvRes.ok) {
          const body = (await pvRes.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) {
            setPvError(body?.error ?? "PV Daten konnten nicht geladen werden");
          }
        } else {
          const pvData = (await pvRes.json()) as SolarwebPowerResponse;
          if (!cancelled) {
            setPv(pvData);
            setPvError(null);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unbekannter Fehler";
        if (!cancelled) {
          setSnapshotError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    const timer = window.setInterval(load, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const heatpumpRows = useMemo(() => mapHeatpumpRows(snapshot?.heatpump), [snapshot?.heatpump]);
  const temperatureRows = useMemo(() => mapTemperatureRows(snapshot?.heatpump, snapshot?.climate ?? []), [snapshot?.heatpump, snapshot?.climate]);

  return (
    <main className="dash-shell">
      <section className="dash-frame">
        <header className="dash-header">
          <p className="dash-kicker">Home Dashboard</p>
          <h1>Phase 3 - Live Tabs</h1>
          <p className="dash-subline">Tab 1: Temperatur | Tab 2: PV | Tab 3: Heatpump</p>
        </header>

        <nav className="tab-row" aria-label="Dashboard Tabs">
          <button
            type="button"
            className={activeTab === "shelly" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("shelly")}
          >
            Tab 1 - Temperatur
          </button>
          <button type="button" className={activeTab === "pv" ? "tab-btn active" : "tab-btn"} onClick={() => setActiveTab("pv")}>
            Tab 2 - PV
          </button>
          <button
            type="button"
            className={activeTab === "heatpump" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("heatpump")}
          >
            Tab 3 - Heatpump
          </button>
        </nav>

        {isLoading ? <p className="state-line">Lade Live-Daten...</p> : null}

        {activeTab === "shelly" ? (
          <section className="tab-panel" aria-live="polite">
            <h2>Temperatur</h2>
            {snapshotError ? <p className="state-line error">{snapshotError}</p> : null}

            <article className="panel-card temperature-panel">
              <h3>Alle Temperaturen</h3>
              {temperatureRows.length === 0 ? (
                <p className="state-line">Keine Temperaturdaten vorhanden.</p>
              ) : (
                <div className="temperature-grid">
                  {temperatureRows.map((row) => (
                    <article key={row.key} className="temperature-metric">
                      <p className="temperature-source">{row.source}</p>
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
            </article>
          </section>
        ) : activeTab === "pv" ? (
          <section className="tab-panel" aria-live="polite">
            <h2>PV Fronius</h2>
            {pvError ? <p className="state-line error">{pvError}</p> : null}

            <PvFlowChart electrical={snapshot?.electrical} pv={pv} />

            <p className="power-note">Quelle: Solarweb PublicDisplay</p>
            <p className="power-time">{pv ? `Stand: ${formatTime(pv.timestampUtc)}` : "Kein Zeitstempel"}</p>
          </section>
        ) : (
          <section className="tab-panel" aria-live="polite">
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
              <p className="power-time">
                {snapshot?.heatpump?.timestampUtc ? `Stand: ${formatTime(snapshot.heatpump.timestampUtc)}` : "Kein Zeitstempel"}
              </p>
            </article>
          </section>
        )}
      </section>
    </main>
  );
}

function PvFlowChart({ electrical, pv }: { electrical?: ElectricalMetrics; pv: SolarwebPowerResponse | null }) {
  const pvPowerW = pv?.currentPowerW ?? electrical?.pvPowerW ?? 0;
  const loadPowerW = electrical?.loadPowerW ?? 0;
  const gridPowerW = electrical?.gridPowerW ?? 0;
  const batteryPowerW = electrical?.batteryPowerW ?? 0;
  const batterySoc = electrical?.batterySocPct ?? null;

  const pvPct = toPct(pvPowerW, 12000);
  const loadPct = toPct(loadPowerW, 12000);
  const gridPct = toPct(Math.abs(gridPowerW), 6000);
  const batteryPct = batterySoc ?? toPct(Math.abs(batteryPowerW), 5000);

  return (
    <article className="pv-flow-card" aria-label="PV Energiefluss">
      <p className="flow-heading">AKTUELLE LEISTUNG</p>

      <div className="flow-canvas">
        <svg className="flow-lines" viewBox="0 0 500 330" aria-hidden="true">
          <line x1="130" y1="90" x2="250" y2="165" />
          <line x1="370" y1="90" x2="250" y2="165" />
          <line x1="130" y1="250" x2="250" y2="165" />
          <line x1="370" y1="250" x2="250" y2="165" />
        </svg>

        <FlowDots className="flow-pv" colorClass="yellow" active={pvPowerW > 5} reverse={false} />
        <FlowDots className="flow-load" colorClass="blue" active={loadPowerW > 5} reverse={false} />
        <FlowDots className="flow-grid" colorClass="gray" active={Math.abs(gridPowerW) > 5} reverse={gridPowerW > 0} />
        <FlowDots className="flow-battery" colorClass="green" active={Math.abs(batteryPowerW) > 5} reverse={batteryPowerW < 0} />

        <FlowNode
          className="node-pv"
          label={formatPower(pvPowerW)}
          ringColor="var(--pv-ring)"
          ringPct={pvPct}
          iconSrc="/images/pv.svg"
          iconAlt="PV"
        />

        <FlowNode
          className="node-load"
          label={formatPower(loadPowerW)}
          ringColor="var(--load-ring)"
          ringPct={loadPct}
          iconSrc="/images/consumption.svg"
          iconAlt="Consumption"
        />

        <FlowNode
          className="node-grid"
          label={gridPowerW >= 0 ? `${formatPower(Math.abs(gridPowerW))} Bezug` : `${formatPower(Math.abs(gridPowerW))} Einsp.`}
          ringColor="var(--grid-ring)"
          ringPct={gridPct}
          iconSrc="/images/grid.svg"
          iconAlt="Grid"
        />

        <FlowNode
          className="node-battery"
          label={batterySoc !== null ? `${Math.round(batterySoc)} %` : formatPower(Math.abs(batteryPowerW))}
          ringColor="var(--battery-ring)"
          ringPct={batteryPct}
          iconSrc="/images/battery_25.svg"
          iconAlt="Battery"
        />

        <div className="flow-node node-center" aria-hidden="true">
          <div className="flow-node-inner center">
            <img src="/images/ICON_GEN24.svg" alt="Inverter" className="flow-icon center-icon" />
          </div>
        </div>
      </div>
    </article>
  );
}

function FlowDots({ className, colorClass, active, reverse }: { className: string; colorClass: string; active: boolean; reverse: boolean }) {
  return (
    <div className={`flow-dots ${className} ${colorClass} ${active ? "active" : ""} ${reverse ? "reverse" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function FlowNode({
  className,
  label,
  ringColor,
  ringPct,
  iconSrc,
  iconAlt,
}: {
  className: string;
  label: string;
  ringColor: string;
  ringPct: number;
  iconSrc: string;
  iconAlt: string;
}) {
  return (
    <div className={`flow-node ${className}`}>
      <p className="node-label">{label}</p>
      <div
        className="flow-ring"
        style={{
          background: `conic-gradient(${ringColor} ${ringPct}%, rgba(0, 0, 0, 0) ${ringPct}% 100%)`,
        }}
      >
        <div className="flow-node-inner">
          <img src={iconSrc} alt={iconAlt} className="flow-icon" />
        </div>
      </div>
    </div>
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
    source: "Shelly H&T",
    label: item.deviceName ?? item.ip,
    temperatureC: item.temperatureC,
    humidityPct: item.humidityPct,
    timestampUtc: item.timestampUtc,
  }));

  if (heatpump) {
    rows.unshift({
      key: "luxtronic-outdoor",
      source: "Luxtronic",
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

function toPct(value: number, max: number) {
  const bounded = Math.max(0, Math.min(100, (value / max) * 100));
  return Number.isFinite(bounded) ? bounded : 0;
}

function formatPower(valueW: number) {
  const absValue = Math.abs(valueW);
  if (absValue >= 1000) {
    return `${(absValue / 1000).toFixed(2)} kW`;
  }
  return `${Math.round(absValue)} W`;
}
