"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { HomeConnectAppliance, HomeConnectDeviceAuth, HomeConnectSnapshot } from "@/lib/types";

const REFRESH_MS = 5 * 60_000;
const AUTH_POLL_MS = 5_000;

export function HouseholdPanel() {
  const [data, setData] = useState<HomeConnectSnapshot | null>(null);
  const [auth, setAuth] = useState<HomeConnectDeviceAuth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const authActive = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/homeconnect", { cache: "no-store" });
      setData((await response.json()) as HomeConnectSnapshot);
    } catch {
      setData({ state: "error", message: "Server nicht erreichbar", appliances: [], fetchedAtUtc: null });
    }
  }, []);

  // Nur laufend, solange der Tab sichtbar ist (API-Kontingent schonen)
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const startAuth = async () => {
    setAuthError(null);
    const response = await fetch("/api/homeconnect/auth", { method: "POST" });
    if (!response.ok) {
      setAuthError("Verbindung konnte nicht gestartet werden.");
      return;
    }
    setAuth((await response.json()) as HomeConnectDeviceAuth);
    authActive.current = true;
  };

  useEffect(() => {
    if (!auth) {
      return;
    }
    const timer = setInterval(async () => {
      if (!authActive.current) {
        return;
      }
      const response = await fetch("/api/homeconnect/auth", { cache: "no-store" });
      const { status } = (await response.json()) as { status: string };
      if (status === "authorized") {
        authActive.current = false;
        setAuth(null);
        void load();
      } else if (status !== "pending") {
        authActive.current = false;
        setAuth(null);
        setAuthError("Autorisierung abgelaufen oder abgelehnt.");
      }
    }, AUTH_POLL_MS);
    return () => clearInterval(timer);
  }, [auth, load]);

  if (!data) {
    return <p className="state-line">Lade Haushaltsgeräte...</p>;
  }

  if (data.state === "unauthorized") {
    return (
      <article className="panel-card hc-connect">
        <h3>Home Connect verbinden</h3>
        <p className="state-line">{data.message}</p>
        {auth ? (
          <div className="hc-code">
            <p>
              Code <strong>{auth.userCode}</strong> auf{" "}
              <a href={auth.verificationUriComplete ?? auth.verificationUri} target="_blank" rel="noreferrer">
                {auth.verificationUri}
              </a>{" "}
              eingeben und bestätigen.
            </p>
          </div>
        ) : (
          <button type="button" className="hc-btn" onClick={() => void startAuth()}>
            Verbinden
          </button>
        )}
        {authError ? <p className="state-line error">{authError}</p> : null}
      </article>
    );
  }

  if (data.state === "not_configured" || (data.state === "error" && data.appliances.length === 0)) {
    return <p className="state-line error">{data.message}</p>;
  }

  return (
    <>
      {data.state === "error" ? <p className="state-line error">{data.message}</p> : null}
      {data.appliances.length === 0 ? <p className="state-line">Keine Haushaltsgeräte gefunden.</p> : null}
      <div className="hc-grid" style={{ "--hc-cols": Math.max(data.appliances.length, 1) } as CSSProperties}>
        {data.appliances.map((appliance) => (
          <ApplianceCard key={appliance.haId} appliance={appliance} />
        ))}
      </div>
      {data.fetchedAtUtc ? (
        <p className="power-time">Stand: {new Date(data.fetchedAtUtc).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}</p>
      ) : null}
    </>
  );
}

function ApplianceCard({ appliance }: { appliance: HomeConnectAppliance }) {
  const finished = appliance.connected && appliance.finished;
  return (
    <article className="panel-card hc-card">
      <header className="hc-card-header">
        <h3>{appliance.name}</h3>
        <span className={appliance.connected ? "hc-badge on" : "hc-badge"}>{appliance.connected ? "Online" : "Offline"}</span>
      </header>
      <p className="hc-sub">
        {appliance.brand} {appliance.type}
      </p>
      {finished ? <span className="hc-badge on hc-finished">Programm abgeschlossen</span> : null}
      {appliance.error ? <p className="state-line error">{appliance.error}</p> : null}
      {appliance.entries.length > 0 ? (
        <ul className="metric-list">
          {appliance.entries.map((entry) => (
            <li key={`${entry.source}:${entry.key}`} title={entry.key}>
              <span>{entry.label}</span>
              <strong>
                {entry.display}
                {entry.unit ? ` ${entry.unit}` : ""}
              </strong>
            </li>
          ))}
        </ul>
      ) : appliance.connected ? (
        <p className="state-line">Keine Werte (Mapping prüfen).</p>
      ) : null}
    </article>
  );
}
