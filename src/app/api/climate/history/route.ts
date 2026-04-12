import { NextRequest, NextResponse } from "next/server";

import { getClimateHistory } from "@/lib/history-store";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const daysParam = request.nextUrl.searchParams.get("days");
    const ipParam = request.nextUrl.searchParams.get("ip")?.trim();

    const days = daysParam ? Number(daysParam) : 30;
    const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 30) : 30;
    const safeIp = ipParam && ipParam.length > 0 ? ipParam : undefined;

    return NextResponse.json({
      days: safeDays,
      ip: safeIp ?? null,
      points: getClimateHistory(safeDays, safeIp),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "climate.history_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
