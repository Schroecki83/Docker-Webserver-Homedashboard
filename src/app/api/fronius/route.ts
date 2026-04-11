import { NextResponse } from "next/server";
import { fetchPowerFlow } from "@/lib/providers/fronius";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const data = await fetchPowerFlow();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "fronius.fetch_failed", { message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
