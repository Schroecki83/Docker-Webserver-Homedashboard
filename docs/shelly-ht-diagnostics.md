# Shelly H&T Diagnostics

If your Shelly H&T sensors are not sending updates to the dashboard, use this guide to diagnose the issue.

## Webhook URL Configuration

Each Shelly H&T sensor must be configured in its web UI:
1. Go to **Settings → Actions → Sensor Update Report**
2. Enter the webhook URL:
   ```
   http://192.168.70.26:3001/api/shelly/ht/report?ip={ip}&temp={tC}&hum={hum}&name={id}
   ```

**Important:** Use `name={id}` to pass the device identifier, not `id=`.

## Monitor Webhook Calls

View webhook calls in real-time with:

```bash
# Tail the last 50 lines of logs and watch for new shelly.ht.report events
docker compose logs -f --tail=50 | grep -E "shelly\.ht\.report|Sensor Update"

# Or see all recent logs (last 20 lines)
docker compose logs --tail=20
```

You should see log lines like:
```json
{"level":"info","message":"shelly.ht.report_received","details":{"ip":"192.168.70.34","name":"Wohnzimmer","tempRaw":"25.5","humRaw":"60"},"timestamp":"2026-04-19T10:15:30.000Z"}
{"level":"info","message":"shelly.ht.report_cached","details":{"ip":"192.168.70.34","name":"Wohnzimmer","temperatureC":25.5,"humidityPct":60},"timestamp":"2026-04-19T10:15:30.000Z"}
```

## Troubleshooting

### No webhook calls received

1. **Check if devices are powered on**
   - Access the Shelly web UI at its IP (e.g., http://192.168.70.34)
   - If unreachable, the device is likely asleep or offline.

2. **Verify webhook URL is saved**
   - In the Shelly web UI, go to **Settings → Actions → Sensor Update Report**
   - Confirm the URL is exactly: `http://192.168.70.26:3001/api/shelly/ht/report?ip={ip}&temp={tC}&hum={hum}&name={id}`
   - The device must be set to wake and send reports (usually configurable in Power Settings or Sleep Timer)

3. **Test connectivity to the Pi**
   - From any device on your network, try: `ping 192.168.70.26`
   - Or test the endpoint manually:
     ```bash
     curl "http://192.168.70.26:3001/api/shelly/ht/report?ip=192.168.70.34&temp=25.5&hum=60&name=Test"
     ```

4. **Check Shelly sleep/wake interval**
   - Shelly devices often have a configurable wake period (default may be very long).
   - In the Shelly web UI, check **Settings → Device** for sleep or power management settings.
   - Reduce the wake/report interval to 5–10 minutes if it's longer.

5. **Manually trigger a report**
   - Access the Shelly web UI and look for a "Test" or "Send Report" button.
   - Or press the Shelly's physical button to wake it and trigger an immediate report.

### Webhook calls received but data not updating

1. **Check the dashboard snapshot**
   - Run: `curl -s http://192.168.70.26:3001/api/snapshot | grep -A5 192.168.70.34`
   - Look for the IP and verify `timestampUtc` is recent.

2. **Verify parameter names**
   - The logs should show the exact parameters received.
   - Ensure the Shelly is sending `temp` (or `tC`), `hum`, and `name` (or `id`).

3. **Check recent logs for errors**
   - Look for `shelly.ht.report_rejected` entries, which will indicate why a report was rejected.

## Historical Data

To retrieve historical temperature and humidity data:

```bash
curl "http://192.168.70.26:3001/api/climate/history?ip=192.168.70.34&days=7"
```

This returns the last 7 days of readings for that device.
