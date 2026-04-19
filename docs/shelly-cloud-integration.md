# Shelly Cloud Integration

Shelly H&T data is now fetched from Shelly Cloud only.

There is no LAN polling provider, no webhook endpoint, and no fallback placeholder injection.

## Current Data Flow

1. Backend calls `{SHELLY_CLOUD_API_URL}/device/all_status?auth_key=...`.
2. Response is parsed from `data.devices_status`.
3. Only devices with humidity data (`hum`) are treated as H&T sensors.
4. Snapshot exposes readings in `climate[]`.

If token/API call fails, `climate[]` is empty.

## Required Environment Variables

```bash
SHELLY_CLOUD_API_URL=https://shelly-146-eu.shelly.cloud
SHELLY_CLOUD_AUTH_TOKEN=your_token_here
```

Optional display mapping:

```bash
SHELLY_HT_DEVICES=192.168.70.34,192.168.70.40,192.168.70.36
```

## Verify Configuration

Check environment inside the container:

```bash
docker compose exec app env | grep -E "SHELLY_CLOUD_API_URL|SHELLY_CLOUD_AUTH_TOKEN"
```

Check logs:

```bash
docker logs home-dashboard 2>&1 | grep "shelly.cloud"
```

Expected log sequence:
- `shelly.cloud.fetch_start`
- `shelly.cloud.api_call`

Possible warning logs:
- `shelly.cloud.no_token`
- `shelly.cloud.api_error`
- `shelly.cloud.fetch_failed`

## API Check

```bash
curl -s "http://<host>:3001/api/snapshot" | grep -A30 '"climate"'
```

## Notes

- Device naming prefers cloud name, then local overrides by IP/device ID.
- Timestamp prefers Shelly `_updated` when available.
- H&T devices are filtered by presence of humidity field to avoid non-climate Shelly devices.
