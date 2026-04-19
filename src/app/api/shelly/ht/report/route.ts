/**
 * Shelly H&T push receiver.
 *
 * Configure each Shelly H&T sensor (in its web UI under
 * Settings → Actions → Sensor Update Report) with a URL of:
 *
 *   http://<pi-ip>:3001/api/shelly/ht/report?ip={ip}&temp={tC}&hum={hum}&name={id}
 *
 * The sensor calls this URL via GET every time it wakes up.
 * 
 * Note: Use {id} for the name parameter; the id parameter itself is ignored.
 */
import { NextRequest, NextResponse } from "next/server";
import { setCachedShellyHt } from "@/lib/shelly-ht-cache";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // {ip} and {tC} are the standard Shelly template variable names.
  const ip = params.get("ip");
  const name = params.get("name") ?? params.get("devicename") ?? params.get("device_name") ?? params.get("id");
  const tempRaw = params.get("temp") ?? params.get("tC");
  const humRaw = params.get("hum");

  log("info", "shelly.ht.report_received", {
    ip,
    name,
    tempRaw,
    humRaw,
    url: request.nextUrl.toString(),
  });

  if (!ip || !tempRaw) {
    log("warn", "shelly.ht.report_rejected", { ip, tempRaw, reason: "missing required params" });
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

  log("info", "shelly.ht.report_cached", {
    ip,
    name,
    temperatureC,
    humidityPct,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, ip });
}
