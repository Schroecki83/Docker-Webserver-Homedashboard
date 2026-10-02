import { NextResponse } from "next/server";
import { fetchHomeConnect } from "@/lib/providers/homeconnect";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await fetchHomeConnect());
}
