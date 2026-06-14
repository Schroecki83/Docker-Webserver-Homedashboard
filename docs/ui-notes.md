# UI Notes

## 2026-06-14

### Android Edge-to-Edge Support

- Added viewport metadata mapping in `src/app/layout.tsx` (`viewportFit: "cover"`, theme color, and mobile web app capability metadata).
- Added standalone manifest route in `src/app/manifest.ts` for home-screen launches (`display: "standalone"`, landscape orientation).
- Added safe-area inset padding in `src/app/globals.css` to keep layout usable around tablet system UI cutouts.

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

### Tab Row Simplification

- Removed the Shelly App tab and all related launch behavior from the main navigation.
- Restored responsive tab row behavior to a 3-column layout (Dashboard, Fronius, Heizung).
