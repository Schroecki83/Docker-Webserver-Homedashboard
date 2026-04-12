import { NextResponse } from "next/server";

const SOLARWEB_URL = "https://www.solarweb.com/PublicDisplay?token=42b53c34-7a6c-4b9c-ba53-f083ddc76d0d";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(SOLARWEB_URL, {
      cache: "no-store",
      headers: {
        "user-agent": "home-dashboard/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Solarweb request failed with ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const parsed = extractCurrentPower(html);

    if (!parsed) {
      return NextResponse.json({ error: "Aktuelle Leistung konnte nicht aus Solarweb gelesen werden" }, { status: 502 });
    }

    return NextResponse.json({
      sourceLabel: "Aktuelle Leistung",
      currentPowerW: parsed.valueW,
      display: parsed.display,
      timestampUtc: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface CurrentPower {
  valueW: number;
  display: string;
}

function extractCurrentPower(html: string): CurrentPower | null {
  const patterns = [
    /CURRENT\s+POWER\s+([0-9]+(?:[.,][0-9]+)?)\s*(kW|W|MW)/i,
    /Aktuelle\s+Leistung\s*[:]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(kW|W|MW)/i,
    /([0-9]+(?:[.,][0-9]+)?)\s*(kW|W|MW)\s+of\s+solar\s+energy\s+is\s+produced/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) {
      continue;
    }

    const numeric = Number.parseFloat(match[1].replace(",", "."));
    if (Number.isNaN(numeric)) {
      continue;
    }

    const unit = match[2].toUpperCase();
    const valueW = toWatt(numeric, unit);
    return {
      valueW,
      display: formatDisplay(numeric, unit),
    };
  }

  return null;
}

function toWatt(value: number, unit: string): number {
  if (unit === "MW") {
    return value * 1_000_000;
  }

  if (unit === "KW") {
    return value * 1_000;
  }

  return value;
}

function formatDisplay(value: number, unit: string): string {
  if (unit.toUpperCase() === "W") {
    return `${Math.round(value)} W`;
  }

  return `${value.toFixed(2)} ${unit.toUpperCase()}`;
}
