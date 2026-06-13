# Shelly Launcher Tab

This document describes the Shelly App launcher entry in the dashboard tab row.

## UI Placement

- The tab row now contains four entries:
  - Dashboard
  - Fronius
  - Heizung
  - Shelly App
- Shelly App is positioned directly to the right of Heizung as the 4th tab item.
- On tablet/mobile/coarse-pointer layouts, the tab row is rendered as 4 equal columns with reduced tab size.

## Launch Behavior

- The Shelly App control is implemented in `src/app/DashboardClient.tsx`.
- Click action uses strict deep link launch:

```text
shelly://
```

- No Play Store fallback URL is configured in dashboard code.

## Platform Constraints

- Whether the Shelly app opens directly is controlled by Android/browser/app deep-link handling.
- If the browser redirects to Play Store anyway, that redirect is external to dashboard fallback logic.

## Related Styling

- Tab styling and responsive 4-column behavior are defined in `src/app/globals.css`.
