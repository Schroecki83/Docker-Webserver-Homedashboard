import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/aggregate";
import { saveClimateReadings, saveHeatpumpSnapshot } from "@/lib/history-store";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await buildSnapshot();

    if (snapshot.heatpump) {
      try {
        saveHeatpumpSnapshot(snapshot.heatpump);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        log("warn", "heatpump.persist_failed", { message });
      }
    }

    if (snapshot.climate.length > 0) {
      try {
        saveClimateReadings(snapshot.climate);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        log("warn", "climate.persist_failed", { message });
      }
    }

    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "snapshot.build_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
