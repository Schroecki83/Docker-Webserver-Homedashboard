# Shelly Cloud Integration

This document explains how to set up Shelly Cloud API integration for retrieving H&T sensor data when devices are offline or in sleep mode.

## Why Shelly Cloud?

The dashboard uses a **layered approach** to fetch Shelly H&T data:

1. **Webhook/Local Cache** (primary) — Device calls dashboard when it wakes up
2. **LAN Polling** — Dashboard polls device directly on local network
3. **Shelly Cloud** (fallback) — Fetch latest data from Shelly's cloud if local sources fail
4. **SQLite History** (final fallback) — Use last known value from persistent storage

The cloud integration provides resilience when devices are:
- Sleeping for long periods (battery-powered sensors)
- Offline or unreachable on the local network
- Not calling the webhook due to configuration issues

## Setup

### 1. Get Your Shelly Cloud Auth Token

The auth token is a secure API key that allows the dashboard to fetch your device data from Shelly's cloud.

**Via Shelly Home App / Cloud Account:**
1. Log in to [https://control.shelly.cloud](https://control.shelly.cloud)
2. Go to **Account → API tokens** or similar (exact location may vary by app version)
3. Create a new API token or copy your existing token
4. The token looks like: `xxxxxxxxxxxxxxxxxxxx`

**Alternatively (programmatic retrieval):**
```bash
# Login to get auth token (replace with your actual email/password)
curl -X POST https://shelly-cloud-api.shelly.cloud/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your.email@example.com","password":"your_password"}'
```

### 2. Configure Environment Variable

Add your auth token to the `.env` file:

```bash
SHELLY_CLOUD_AUTH_TOKEN=your_token_here
```

### 3. Rebuild and Restart

```bash
docker compose down
docker compose build
docker compose up -d
```

## Monitoring

Check the logs to see when the cloud integration is being used:

```bash
# Watch for successful cloud fetches
docker compose logs -f | grep "shelly.cloud"

# You should see entries like:
# {"level":"info","message":"shelly.cloud.device_fetched","details":{"id":"...","name":"Wohnzimmer","temperatureC":22.5}...}
# {"level":"info","message":"shelly.cloud.fallback_used","details":{"ip":"...","name":"Wohnzimmer"}...}
```

## Data Freshness

Cloud API data may have some latency (typically 1–5 minutes behind real-time) because:
- Devices only report to cloud periodically
- Network propagation delays
- Cloud caching

For maximum freshness, local webhook/polling methods are preferred. Cloud is a fallback for resilience.

## Troubleshooting

### Cloud integration not working

1. **Verify token is valid:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://iot.shelly.cloud/iot/devices
   ```
   Should return a list of devices in JSON format.

2. **Check environment variable is set:**
   ```bash
   # Inside the container
   docker compose exec app env | grep SHELLY_CLOUD_AUTH_TOKEN
   ```

3. **Review logs for errors:**
   ```bash
   docker compose logs | grep shelly.cloud
   ```
   Look for `shelly.cloud.api_error` or `shelly.cloud.fetch_failed` entries.

### Devices not appearing from cloud

1. **Verify devices are registered in Shelly Cloud:**
   - Log in to https://control.shelly.cloud
   - Check that your H&T sensors appear in the device list

2. **Check device model:**
   - The cloud provider only fetches devices with "H&T" in the model name
   - Verify your device reports as "Shelly H&T" or similar

3. **Token permissions:**
   - Ensure your API token has permission to read device data
   - Some tokens may have restricted scopes; regenerate if needed

## Data Source Priority

When multiple data sources are available for a device, the snapshot API returns data in this order:

1. **Webhook** — If device called the webhook endpoint recently
2. **LAN Poll** — If device is reachable on local network
3. **Cache** — In-memory cache from previous webhook/poll
4. **Cloud** — Latest data from Shelly's cloud API
5. **SQLite** — Last reading from persistent history store
6. **Null** — No data available

Example timeline:
- 10:00 → Device calls webhook → data from webhook (1)
- 10:01 → No new webhook → data from cache (3)
- 10:05 → Cache stale, device offline → data from cloud (4)
- 10:10 → Cloud unavailable → data from SQLite (5)

## API Endpoints

The cloud provider is integrated transparently via the snapshot API:

```bash
# Get all climate readings (includes cloud data as fallback)
curl http://192.168.70.26:3001/api/snapshot | grep -A20 '"climate"'
```

Individual data sources are logged but not separately exposed via API; the snapshot reflects the best available data.
