# Metropolis Arena — Interactive Seating Map

A React 19 + TypeScript single-page application that renders a fully interactive arena seating map for ~13,000 seats at smooth 60 fps. Built with Vite.

---

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

| Command        | Description                          |
| -------------- | ------------------------------------ |
| `pnpm dev`     | Start development server (HMR)       |
| `pnpm build`   | Type-check (`tsc -b`) then Vite build |
| `pnpm preview` | Preview the production bundle        |
| `pnpm lint`    | Run ESLint                           |
| `pnpm format`  | Auto-format with Prettier            |

---

## Features

### Core
- **Interactive seating map** rendered on an HTML5 Canvas with ~13,000 seats across three tiers
- **Click or keyboard** to select seats (arrow keys to navigate, Enter / Space to toggle)
- **Up to 8 seats** per order with a live running subtotal, service fees, and total
- **Selection persists** across page reloads via `localStorage` (key `arena01:selection:v2`)
- **Seat detail tooltip** on hover / focus: section, row, seat, price tier, and status
- **Fully accessible**: `role="application"` canvas, `aria-label` on every interactive element, dashed focus ring, `aria-live` region for keyboard-navigation announcements

### Map controls
| Control | Action |
|---|---|
| Click seat | Select / deselect |
| Drag | Pan the map |
| Scroll wheel | Zoom in / out |
| Pinch (touch) | Zoom in / out |
| `+` / `−` keys | Zoom in / out |
| Arrow keys | Move focus to the nearest seat in that direction |
| Enter / Space | Select / deselect focused seat |
| Escape | Clear keyboard focus |
| Zoom buttons (bottom-right) | `+` zoom in · `−` zoom out · `⤢` fit to view |

### Toolbar (top-right of map)
| Button | Effect |
|---|---|
| **Status** (default) | Colour seats by status (available / reserved / held / sold) |
| **Price** | Heatmap — colour seats by price tier instead |
| **Live** | Toggle simulated real-time seat-status updates (WebSocket-style) |
| **☾ / ☀** | Toggle dark / light theme |

### Selection panel (right sidebar)
- **Adjacent seat finder** — pick a count (2–8) and optional price tier, click *Find N seats together* to auto-select the best available run. Click again to cycle through alternatives.
- **Seat list** — each selected seat shows section, row, seat number, tier, and price with a one-click remove button.
- **Order summary** — subtotal, 13% service fee, and total update in real time.
- **Checkout** — active only when seats are selected.

### Stretch goals (all implemented)
- Simulated live seat-status updates with flash animations
- Price-tier heatmap toggle
- "Find N adjacent seats" helper with tier filtering and cycling
- Pinch-zoom and touch pan for mobile
- Full dark-mode with WCAG AA–compliant contrast ratios

---

## Project structure

```
arena-tickets/
├── public/
│   └── venue.json                  # Venue metadata (name, event, date, map dimensions)
├── src/
│   ├── types/
│   │   └── index.ts                # Shared TypeScript types and interfaces
│   ├── utils/
│   │   ├── venueGenerator.ts       # Deterministic arena seat generation (~13k seats)
│   │   ├── colors.ts               # Light / dark theme palettes and seat colouring
│   │   └── format.ts               # formatMoney, countAvailable, STATUS_LABELS
│   ├── components/
│   │   ├── Header.tsx              # Top bar — venue name, event, available count, selection pill
│   │   ├── Toolbar.tsx             # Status/Price toggle, Live button, dark-mode toggle
│   │   ├── Legend.tsx              # Bottom-left colour key (status or price-tier mode)
│   │   ├── ZoomControls.tsx        # Bottom-right +/−/fit buttons
│   │   ├── SeatingMap.tsx          # Canvas map + all pointer/keyboard/touch interactions
│   │   └── SelectionPanel.tsx      # Right sidebar — adjacent finder, seat list, order summary
│   ├── App.tsx                     # Root component — wires all state together
│   ├── main.tsx                    # React entry point
│   └── index.css                   # CSS reset, theme tokens (CSS custom properties), animations
├── index.html                      # Loads Hanken Grotesk from Google Fonts
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── eslint.config.js
└── package.json
```

---

## Incomplete features / TODOs

- **Tests** — no unit or end-to-end tests are included. The adjacent-finder algorithm (`buildAdjCandidates`) and the directional-navigation scoring function (`directional`) are the highest-value targets for unit tests. Playwright or Cypress would be appropriate for E2E.
- **Real WebSocket** — live updates are simulated with `setInterval`. A production build would replace `startLive` / `stopLive` with a real WebSocket or SSE connection.
- **Checkout flow** — the Checkout button shows a toast. A real implementation would route to a payment or seat-confirmation page.
- **`venue.json` seat data** — the file currently holds only metadata. A backend would serve full seat data (with real-time statuses) through an API, replacing the procedural generator.
- **Section filter / search** — there is no way to search for a section by number. A search bar above the panel would help users navigate a large arena.
- **Reduced-motion support** — the flash and pulse-dot animations do not check `prefers-reduced-motion`. Wrapping the animation starts with a media-query check would improve comfort for motion-sensitive users.
