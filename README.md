# Home Dashboard

Home energy dashboard for Raspberry Pi using Next.js.

Stable release: `1.0.0`

Current data sources:
- Fronius GEN24 (local inverter API)
- Fronius Smart Meter (daily import/export deltas from local counters)
- Luxtronic heatpump (LAN)
- Shelly H&T (Shelly Cloud API only)

## Runtime Model

- Frontend uses Server-Sent Events via `/api/stream` for live updates.
- Stream updates are emitted every 30 seconds.
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

Useful Make targets:

```bash
make build   # build image
make up      # start in background
make dev     # run in foreground with rebuild
make down    # stop stack
```

### Local dev

```bash
npm install
npm run dev
```

Also available:

```bash
npm run test
npm run lint
```

## Environment Variables

- `FRONIUS_BASE_URL` local inverter base URL, e.g. `http://192.168.70.79` (default set)
- `FRONIUS_USERNAME` optional basic-auth user
- `FRONIUS_PASSWORD` optional basic-auth password
- `HEATPUMP_HISTORY_DB_PATH` SQLite DB path (default `/app/data/heatpump-history.db`)
- `LUXTRONIC_HOST` heatpump IP/host (default set)
- `LUXTRONIC_PORT` heatpump port (default `8214`)
- `LUXTRONIC_PASSWORD` heatpump password (required)
- `SHELLY_HT_DEVICES` expected Shelly H&T devices by IP (comma-separated)
- `SHELLY_GEN1_DEVICES` Shelly Gen1 devices by IP (comma-separated)
- `SHELLY_CLOUD_API_URL` Shelly cloud API base URL (default set)
- `SHELLY_CLOUD_AUTH_TOKEN` Shelly cloud auth token
- `PORT` app port (default `3001`)

Notes:
- In Docker mode, `./data` is mounted to `/app/data` for persistent SQLite history.
- Empty `SHELLY_*_DEVICES` values are valid and resolve to empty lists.

## API Endpoints

- `GET /api/health` health check
- `GET /api/stream` SSE stream for live dashboard updates
- `GET /api/snapshot` single snapshot payload (debug/compat)
- `GET /api/fronius` raw mapped Fronius metrics
- `GET /api/heatpump/history?days=<1..30>` persisted heatpump points (default `30`)

## Documentation

- [docs/fronius-mapping.md](docs/fronius-mapping.md)
- [docs/shelly-cloud-integration.md](docs/shelly-cloud-integration.md)
- [docs/shelly-ht-diagnostics.md](docs/shelly-ht-diagnostics.md)