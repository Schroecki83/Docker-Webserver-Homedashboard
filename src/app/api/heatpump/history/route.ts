import { NextRequest, NextResponse } from "next/server";

import { getHeatpumpHistory } from "@/lib/history-store";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? Number(daysParam) : 30;
    const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 30) : 30;

    return NextResponse.json({ days: safeDays, points: getHeatpumpHistory(safeDays) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "heatpump.history_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
