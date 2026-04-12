/**
 * Shelly H&T push receiver.
 *
 * Configure each Shelly H&T sensor (in its web UI under
 * Settings → Actions → Sensor Update Report) with a URL of:
 *
 *   http://<pi-ip>:3001/api/shelly/ht/report?ip={ip}&temp={tC}&hum={hum}&id={id}
 *
 * The sensor calls this URL via GET every time it wakes up.
 */
import { NextRequest, NextResponse } from "next/server";
import { setCachedShellyHt } from "@/lib/shelly-ht-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // {ip} and {tC} are the standard Shelly template variable names.
  const ip = params.get("ip");
  const name = params.get("name") ?? params.get("devicename") ?? params.get("device_name");
  const tempRaw = params.get("temp") ?? params.get("tC");
  const humRaw = params.get("hum");

  if (!ip || !tempRaw) {
    return NextResponse.json({ error: "missing ip or temp" }, { status: 400 });
  }

  const temperatureC = Number.parseFloat(tempRaw);
  if (!Number.isFinite(temperatureC)) {
    return NextResponse.json({ error: "invalid temp value" }, { status: 400 });
  }

  const humidityPctRaw = humRaw !== null ? Number.parseFloat(humRaw) : null;
  const humidityPct = humidityPctRaw !== null && Number.isFinite(humidityPctRaw) ? humidityPctRaw : null;

  setCachedShellyHt(ip, {
    ip,
    deviceName: name,
    temperatureC,
    humidityPct,
    timestampUtc: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, ip });
}
