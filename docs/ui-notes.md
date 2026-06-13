# UI Notes

## 2026-06-13

### Dashboard Color Alignment

- Temperaturen panel now uses the same panel tint as Wettervorhersage.
- Temperatur metric tiles now use the same weather-card style gradient base.
- This is a visual-only change and does not affect API payloads or metric mapping.

### Dead CSS Cleanup

- Removed unused `.weather-panel-time` selectors from `src/app/globals.css`.

### Weather Icon Integration

- Replaced inline hand-written weather SVGs with animated Meteocons SVG assets from `@meteocons/svg`.
- Added Open-Meteo weather code to Meteocons icon slug mapping in `src/app/DashboardClient.tsx`.
- Weather card icon backdrop now renders imported animated SVG files via Next.js image rendering.
