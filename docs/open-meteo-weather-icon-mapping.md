# Open-Meteo to Meteocons Mapping

This document describes how Open-Meteo weather codes are mapped to Meteocons animated SVG slugs for the dashboard weather forecast cards.

Source of truth in code:
- `src/app/DashboardClient.tsx`
- function: `meteoconSlugFromWeatherCode(code)`

Package source:
- `@meteocons/svg`
- style currently used: `fill`

## Mapping Table

| Open-Meteo WMO code(s) | Condition | Meteocons slug |
| --- | --- | --- |
| `0` | Clear sky | `clear-day` |
| `1`, `2` | Mainly clear / partly cloudy | `partly-cloudy-day` |
| `3` | Overcast | `overcast-day` |
| `45`, `48` | Fog / depositing rime fog | `fog-day` |
| `51`, `53`, `55`, `56`, `57` | Drizzle / freezing drizzle | `drizzle` |
| `61`, `63`, `65`, `66`, `67`, `80`, `81`, `82` | Rain / freezing rain / showers | `overcast-day-rain` |
| `71`, `73`, `75`, `77`, `85`, `86` | Snow / snow grains / snow showers | `snow` |
| `95`, `96`, `99` | Thunderstorm (+ hail) | `thunderstorms-day-rain` |
| fallback | Unknown/missing code | `overcast` |

## Notes

- This mapping controls only icon visuals. Text labels and weather values are still derived from existing dashboard weather logic.
- The dashboard continues to use Open-Meteo forecast data; Meteocons provides icon assets only.
