# Shelly H&T Diagnostics

This guide is for the current cloud-only Shelly H&T integration.

## Important Changes

- Removed: `/api/shelly/ht/report` webhook endpoint
- Removed: local Shelly H&T LAN polling provider
- Removed: `/api/climate/history` endpoint

If you are still testing webhook URLs, those requests will not be used by the current dashboard.

## Quick Health Checks

1. Check snapshot climate payload:

```bash
curl -s "http://<host>:3001/api/snapshot" | grep -A30 '"climate"'
```

2. Check stream endpoint delivers updates:

```bash
curl -N "http://<host>:3001/api/stream"
```

3. Check Shelly logs:

```bash
docker logs home-dashboard 2>&1 | grep "shelly.cloud"
```

## Most Common Failure Cases

### `shelly.cloud.no_token`

`SHELLY_CLOUD_AUTH_TOKEN` is missing in container env.

### `shelly.cloud.api_error`

Cloud endpoint or token invalid. Verify:

```bash
SHELLY_CLOUD_API_URL=https://shelly-146-eu.shelly.cloud
```

### Climate array empty despite valid token

- Shelly account may not expose H&T values for current devices.
- Device may be present but without humidity (`hum`) data.
- Device is filtered out when not recognized as H&T payload.

## Direct Cloud API Check

```bash
curl -s "${SHELLY_CLOUD_API_URL}/device/all_status?auth_key=${SHELLY_CLOUD_AUTH_TOKEN}" | python3 -m json.tool | head -120
```

Look for `data.devices_status` entries containing both:
- `tmp`
- `hum`

## Device Naming

Dashboard device labels are resolved in this order:
1. Shelly cloud `name`
2. Local override map by IP
3. Local override map by device ID
4. Raw IP/device ID
