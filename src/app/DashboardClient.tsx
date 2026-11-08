"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { HouseholdPanel } from "./HouseholdPanel";
import type { ClimateReading, DashboardSnapshot, ElectricalMetrics, HeatpumpSnapshot, WeatherForecast } from "@/lib/types";

type ActiveTab = "dashboard" | "pv" | "heatpump" | "household";

type MeteoconImporter = () => Promise<{ default: string }>;

const METEOCON_IMPORTERS = {
  "clear-day": () => import("@meteocons/svg/fill/clear-day.svg"),
  "partly-cloudy-day": () => import("@meteocons/svg/fill/partly-cloudy-day.svg"),
  overcast: () => import("@meteocons/svg/fill/overcast.svg"),
  "overcast-day": () => import("@meteocons/svg/fill/overcast-day.svg"),
  "overcast-day-rain": () => import("@meteocons/svg/fill/overcast-day-rain.svg"),
  "fog-day": () => import("@meteocons/svg/fill/fog-day.svg"),
  drizzle: () => import("@meteocons/svg/fill/drizzle.svg"),
  snow: () => import("@meteocons/svg/fill/snow.svg"),
  "thunderstorms-day-rain": () => import("@meteocons/svg/fill/thunderstorms-day-rain.svg"),
} satisfies Record<string, MeteoconImporter>;

type MeteoconSlug = keyof typeof METEOCON_IMPORTERS;

export function DashboardClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [froniusRealtime, setFroniusRealtime] = useState<ElectricalMetrics | undefined>();
  const [froniusError, setFroniusError] = useState<string | null>(null);

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

  useEffect(() => {
    if (activeTab !== "pv") return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const response = await fetch("/api/fronius/realtime", { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Fronius HTTP ${response.status}`);
        }
        const data = (await response.json()) as ElectricalMetrics;
        if (!controller.signal.aborted) {
          setFroniusRealtime(data);
          setFroniusError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setFroniusRealtime(undefined);
          setFroniusError(err instanceof Error ? err.message : "Fronius-Daten nicht verfügbar");
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 10_000);
      }
    }

    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeTab]);

  const heatpumpRows = useMemo(() => mapHeatpumpRows(snapshot?.heatpump), [snapshot?.heatpump]);
  const temperatureRows = useMemo(() => mapTemperatureRows(snapshot?.heatpump, snapshot?.climate ?? []).slice(0, 4), [snapshot?.heatpump, snapshot?.climate]);
  const weather = snapshot?.weather;

  return (
    <main className="dash-shell">
      <section className={`dash-frame dash-frame-${activeTab}`}>
        <nav className="tab-row" aria-label="Dashboard Tabs">
          <button
            type="button"
            className={activeTab === "dashboard" ? "tab-btn tab-dashboard active" : "tab-btn tab-dashboard"}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activeTab === "pv" ? "tab-btn tab-fronius active" : "tab-btn tab-fronius"}
            onClick={() => {
              if (activeTab !== "pv") {
                setFroniusRealtime(undefined);
                setFroniusError(null);
                setActiveTab("pv");
              }
            }}
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
          <button
            type="button"
            className={activeTab === "household" ? "tab-btn tab-haushalt active" : "tab-btn tab-haushalt"}
            onClick={() => setActiveTab("household")}
          >
            Haushalt
          </button>
        </nav>

        {isLoading ? <p className="state-line">Lade Live-Daten...</p> : null}

        {activeTab === "dashboard" ? (
          <section className="tab-panel tab-panel-dashboard" aria-live="polite">
            <h2>Dashboard</h2>
            {snapshotError ? <p className="state-line error">{snapshotError}</p> : null}

            <div className="dashboard-layout">
              <article className="panel-card temperature-panel">
                <h3>Temperaturen</h3>
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
              </article>

              <WeatherForecastPanel forecast={weather} />
            </div>
          </section>
        ) : activeTab === "pv" ? (
          <section className="tab-panel tab-panel-fronius" aria-live="polite">
            <h2>PV Fronius</h2>
            {froniusError ? <p className="state-line error">{froniusError}</p> : null}
            <FroniusRealtimePanel electrical={froniusRealtime} />
          </section>
        ) : activeTab === "household" ? (
          <section className="tab-panel tab-panel-haushalt" aria-live="polite">
            <h2>Haushalt</h2>
            <HouseholdPanel />
          </section>
        ) : (
          <section className="tab-panel tab-panel-heizung" aria-live="polite">
            <h2>Wärmepumpe</h2>
            {snapshotError ? <p className="state-line error">{snapshotError}</p> : null}

            {heatpumpRows.length === 0 ? (
              <p className="state-line">Keine Waermepumpen-Daten vorhanden.</p>
            ) : (
              <ul className="metric-list">
                {heatpumpRows.map((row) => (
                  <li key={row.key}>
                    <span>{row.label}</span>
                    <strong>{formatTemp(row.value)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

function WeatherForecastPanel({ forecast }: { forecast?: WeatherForecast }) {
  return (
    <article className="panel-card weather-panel">
      <div className="weather-panel-header">
        <h3>Wettervorhersage</h3>
      </div>

      {!forecast || forecast.days.length === 0 ? (
        <p className="state-line">Keine Wettervorhersage vorhanden.</p>
      ) : (
        <div className="weather-grid">
          {forecast.days.map((day) => (
            <article key={day.date} className={`weather-card weather-card-${weatherVariant(day.weatherCode)}`}>
              <div className="weather-card-backdrop" aria-hidden="true">
                <WeatherConditionIcon code={day.weatherCode} />
              </div>

              <div className="weather-card-header">
                <p>{formatForecastWeekday(day.date)}</p>
                <span>{formatForecastDate(day.date)}</span>
              </div>

              <strong className="weather-card-condition">{describeWeatherCode(day.weatherCode)}</strong>

              <div className="weather-card-temps">
                <span className="weather-temp-max">{formatTemp(day.temperatureMaxC)}</span>
                <span className="weather-temp-min">{formatTemp(day.temperatureMinC)}</span>
              </div>

              <dl className="weather-card-stats">
                <div>
                  <dt>Regen</dt>
                  <dd>{formatPercent(day.precipitationProbabilityPct)}</dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>{formatWind(day.windSpeedMaxKmh)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

function WeatherConditionIcon({ code }: { code: number | null }) {
  const slug = meteoconSlugFromWeatherCode(code);
  const [iconSrc, setIconSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    METEOCON_IMPORTERS[slug]()
      .then((module) => {
        if (!cancelled) {
          setIconSrc(module.default);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIconSrc(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!iconSrc) {
    return null;
  }

  return <Image src={iconSrc} alt="" className="weather-icon-svg" fill unoptimized sizes="120px" />;
}

export function FroniusRealtimePanel({ electrical }: { electrical?: ElectricalMetrics }) {
  const pvPowerW = electrical?.pvPowerW;
  const loadPowerW = electrical?.loadPowerW;
  const gridPowerW = electrical?.gridPowerW;
  const batteryPowerW = electrical?.batteryPowerW;
  const batterySoc = electrical?.batterySocPct ?? null;
  const gridFlowClass = gridPowerW === undefined ? "flow-neutral" : gridPowerW < 0 ? "flow-green" : gridPowerW > 0 ? "flow-red" : "flow-neutral";
  const batteryFlowClass = batteryPowerW === undefined ? "flow-neutral" : batteryPowerW < 0 ? "flow-green" : batteryPowerW > 0 ? "flow-red" : "flow-neutral";

  return (
    <article className="fronius-realtime-card">
      <div className="fronius-realtime-header">
        <p>Realtime</p>
        <span>{electrical?.timestampUtc ? `Stand: ${formatTime(electrical.timestampUtc, true)}` : "Keine Live-Daten"}</span>
      </div>

      <div className="fronius-realtime-grid">
        <RealtimeMetricCard
          label="PV Production"
          reading={formatPowerParts(pvPowerW)}
          detail={pvPowerW === undefined ? "Keine Daten" : pvPowerW > 0 ? "Produktion aktiv" : "Keine Produktion"}
          accentClass="pv"
          iconSrc="/images/pv.svg"
        />
        <RealtimeMetricCard
          label="Consumption"
          reading={formatPowerParts(loadPowerW)}
          detail={loadPowerW === undefined ? "Keine Daten" : loadPowerW > 0 ? "Aktueller Verbrauch" : "Kein Verbrauch"}
          accentClass="consumption"
          iconSrc="/images/consumption.svg"
        />
        <RealtimeMetricCard
          label="Grid"
          reading={formatPowerParts(gridPowerW)}
          detail={gridPowerW === undefined ? "Keine Daten" : gridPowerW >= 0 ? "Netzbezug" : "Einspeisung"}
          accentClass="grid"
          flowClass={gridFlowClass}
          gridIcon
        />
        <RealtimeMetricCard
          label="Battery"
          reading={formatPowerParts(batteryPowerW)}
          detail={batterySoc !== null ? `SOC ${Math.round(batterySoc)}%` : "Keine Batteriedaten"}
          accentClass="battery"
          flowClass={batteryFlowClass}
          iconSrc={batteryIconSrc(batterySoc, batteryPowerW)}
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
  iconSrc,
  gridIcon,
}: {
  label: string;
  reading: { value: string; unit: string };
  detail: string;
  accentClass: string;
  flowClass?: "flow-green" | "flow-red" | "flow-neutral";
  iconSrc?: string;
  gridIcon?: boolean;
}) {
  return (
    <article className={`fronius-metric-card ${accentClass}${iconSrc || gridIcon ? " has-icon" : ""}`}>
      <p>{label}</p>
      <div className={`fronius-metric-reading ${flowClass ?? "flow-neutral"}`}>
        <strong>{reading.value}</strong>
        <span>{reading.unit}</span>
      </div>
      <span>{detail}</span>
      {iconSrc ? <Image src={iconSrc} alt="" width={64} height={64} className={`fronius-metric-icon${accentClass === "battery" ? " fronius-battery-icon" : ""}`} unoptimized /> : null}
      {gridIcon ? <span aria-hidden="true" className={`fronius-metric-icon fronius-grid-icon ${flowClass ?? "flow-neutral"}`} /> : null}
    </article>
  );
}

function batteryIconSrc(soc: number | null, powerW: number | undefined): string | undefined {
  if (soc === null || !Number.isFinite(soc) || soc < 0 || soc > 100 || powerW === undefined || !Number.isFinite(powerW)) {
    return undefined;
  }

  const level = soc < 37.5 ? 25 : soc < 62.5 ? 50 : soc < 87.5 ? 75 : 100;
  return `/images/battery_${powerW < 0 ? "charging_" : ""}${level}.svg`;
}

function mapHeatpumpRows(heatpump: HeatpumpSnapshot | undefined) {
  if (!heatpump) {
    return [];
  }

  return [
    { key: "ruecklauf-soll", label: "Rücklauf Soll", value: heatpump.ruecklauf_soll_c },
    { key: "ruecklauf", label: "Rücklauf", value: heatpump.ruecklauf_c },
    { key: "warmwasser-soll", label: "Warmwasser Soll", value: heatpump.warmwasser_soll_c },
    { key: "warmwasser", label: "Warmwasser", value: heatpump.warmwasser_ist_c },
    { key: "aussentemperatur", label: "Aussentemperatur", value: heatpump.aussentemperatur_c },
    { key: "vorlauf-2", label: "Vorlauf", value: heatpump.vorlauf_c },
    { key: "heisgas", label: "Heisgas", value: heatpump.heissgas_c },
    { key: "waermequelle-ein", label: "Wärmequelle Ein", value: heatpump.waermequelle_ein_c },
    { key: "waermequelle-aus", label: "Wärmequelle Aus", value: heatpump.waermequelle_aus_c },
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

function formatTime(value: string, includeSeconds = false) {
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
    second: includeSeconds ? "2-digit" : undefined,
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

  return <span className="stale-badge cached"> letzter Wert {formatTime(timestampUtc)}</span>;
}

function formatPowerParts(valueW: number | undefined) {
  if (valueW === undefined || !Number.isFinite(valueW)) {
    return { value: "--", unit: "" };
  }
  const absValue = Math.abs(valueW);
  if (absValue >= 1000) {
    return { value: (absValue / 1000).toFixed(2), unit: "kW" };
  }
  return { value: `${Math.round(absValue)}`, unit: "W" };
}

function formatForecastWeekday(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("de-AT", {
    weekday: "short",
    timeZone: "Europe/Vienna",
  }).format(date);
}

function formatForecastDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Vienna",
  }).format(date);
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return `${Math.round(value)} %`;
}

function formatWind(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return `${Math.round(value)} km/h`;
}

function describeWeatherCode(code: number | null) {
  switch (code) {
    case 0:
      return "Klar";
    case 1:
    case 2:
      return "Leicht bewoelkt";
    case 3:
      return "Bedeckt";
    case 45:
    case 48:
      return "Nebel";
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return "Niesel";
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
      return "Regen";
    case 71:
    case 73:
    case 75:
    case 77:
      return "Schnee";
    case 80:
    case 81:
    case 82:
      return "Schauer";
    case 85:
    case 86:
      return "Schneeschauer";
    case 95:
    case 96:
    case 99:
      return "Gewitter";
    default:
      return "Unbekannt";
  }
}

function weatherVariant(code: number | null) {
  switch (code) {
    case 0:
      return "clear";
    case 1:
    case 2:
    case 3:
      return "cloud";
    case 45:
    case 48:
      return "fog";
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
    case 80:
    case 81:
    case 82:
      return "rain";
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return "snow";
    case 95:
    case 96:
    case 99:
      return "storm";
    default:
      return "cloud";
  }
}

function meteoconSlugFromWeatherCode(code: number | null): MeteoconSlug {
  switch (code) {
    case 0:
      return "clear-day";
    case 1:
    case 2:
      return "partly-cloudy-day";
    case 3:
      return "overcast-day";
    case 45:
    case 48:
      return "fog-day";
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return "drizzle";
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
    case 80:
    case 81:
    case 82:
      return "overcast-day-rain";
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return "snow";
    case 95:
    case 96:
    case 99:
      return "thunderstorms-day-rain";
    default:
      return "overcast";
  }
}
