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

### Shelly App Launcher Tab

- Added Shelly App as a 4th tab item directly in the main tab row (right of Heizung).
- Updated tablet/mobile tab row behavior from 3 to 4 columns with smaller tab width and tighter typography.
- Switched Shelly launcher action to strict `shelly://` deep link without an in-app Play Store fallback URL.
