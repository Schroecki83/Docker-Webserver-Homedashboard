import { NextResponse } from "next/server";
import { pollDeviceAuth, startDeviceAuth } from "@/lib/providers/homeconnect";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await startDeviceAuth());
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log("error", "homeconnect.auth_start_failed", { message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ status: await pollDeviceAuth() });
}
