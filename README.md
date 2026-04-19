# Home Dashboard

Home energy dashboard for Raspberry Pi using Next.js.

Current data sources:
- Fronius GEN24 (local inverter API)
- Fronius Smart Meter (daily import/export deltas from local counters)
- Luxtronic heatpump (LAN)
- Shelly H&T (Shelly Cloud API only)

## Runtime Model

- Frontend uses Server-Sent Events via `/api/stream` for live updates.
- Backend still exposes `/api/snapshot` for direct JSON polling/debugging.
- Heatpump history is stored in SQLite.
- Fronius daily values are derived from local cumulative counters and a per-day baseline.

## Quick Start

### Docker (recommended)

1. Copy `.env.example` to `.env` and set values.
2. Build image:

```bash
make build
```

3. Start stack:

```bash
docker compose up -d
```

4. Open dashboard at `http://<host>:3001`.

### Local dev

```bash
npm install
npm run dev
```

## Environment Variables

- `FRONIUS_BASE_URL` local inverter base URL, e.g. `http://192.168.70.79`
- `FRONIUS_USERNAME` optional basic-auth user
- `FRONIUS_PASSWORD` optional basic-auth password
- `HEATPUMP_HISTORY_DB_PATH` SQLite DB path
- `LUXTRONIC_HOST` heatpump IP/host
- `LUXTRONIC_PORT` heatpump port
- `LUXTRONIC_PASSWORD` heatpump password
- `SHELLY_HT_DEVICES` expected Shelly H&T devices by IP
- `SHELLY_GEN1_DEVICES` Shelly Gen1 devices by IP
- `SHELLY_CLOUD_API_URL` Shelly cloud API base URL
- `SHELLY_CLOUD_AUTH_TOKEN` Shelly cloud auth token
- `PORT` app port (default `3001`)

## API Endpoints

- `GET /api/health` health check
- `GET /api/stream` SSE stream for live dashboard updates
- `GET /api/snapshot` single snapshot payload (debug/compat)
- `GET /api/fronius` raw mapped Fronius metrics

## Documentation

- [docs/fronius-mapping.md](docs/fronius-mapping.md)
- [docs/shelly-cloud-integration.md](docs/shelly-cloud-integration.md)
- [docs/shelly-ht-diagnostics.md](docs/shelly-ht-diagnostics.md)