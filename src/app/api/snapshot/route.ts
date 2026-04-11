import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/aggregate";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await buildSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "snapshot.build_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
