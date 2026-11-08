import { NextResponse } from "next/server";
import { fetchRealtimePowerFlow } from "@/lib/providers/fronius";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    return NextResponse.json(await fetchRealtimePowerFlow(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "fronius.realtime_fetch_failed", { message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
