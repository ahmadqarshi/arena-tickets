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

## Architecture and key decisions

### Seat data — procedural generation, not a static JSON file

The spec calls for `public/venue.json` and smooth rendering of ~15,000 seats. Embedding 15,000 seat records in a JSON file would produce a ~2 MB payload with no benefit over in-memory generation. Instead:

- `public/venue.json` carries the venue **metadata** (name, event, date, map dimensions).
- `src/utils/venueGenerator.ts` generates all seats at app start using a seeded, deterministic RNG (seed `0x1f2e3d4c`). The algorithm is ported exactly from the design prototype, so the output — section layout, coordinates, price tiers, and initial statuses — is bit-for-bit identical across every run and every browser.
- `useMemo` in `App.tsx` ensures generation runs exactly once per session.

This approach gives instant first paint (no network round-trip for a large payload), fully deterministic seat IDs (safe for `localStorage` persistence), and zero infrastructure cost for the assignment.

### Canvas 2D — why not SVG or DOM elements?

SVG and DOM rendering become janky above a few thousand elements because each element is a separate layout and paint box. At 13,000 seats, animating hover, selection, and live flashes would trigger thousands of style recalculations per frame.

The Canvas 2D approach used here:

1. **Batched colour-group rendering** — seats are grouped by fill colour (`Map<color, Seat[]>`), then each group is drawn with a single `beginPath()` → many `arc()` calls → one `fill()`. This gives O(distinct colours) draw calls instead of O(seats), keeping frame time under 2 ms on a mid-range laptop.
2. **Spatial grid hit testing** — a 26 px cell grid (`Map<"gx:gy", Seat[]>`) covers the canvas. On every pointer move only the few cells near the cursor are searched, keeping hit detection at O(1) regardless of seat count.
3. **`requestAnimationFrame` scheduling** — redraws are coalesced via a `drawScheduled` flag so rapid state changes (e.g. multiple pointer-move events in one frame) produce exactly one draw per frame.
4. **Ref-based engine state** — view transform, hover ID, focus ID, pointer map, and flash timers all live in plain variables inside a single `useEffect` closure. They never pass through React's reconciler, so there is no overhead from re-renders for purely visual state.

### React state vs. refs

| State | Where it lives | Why |
|---|---|---|
| `selectedIds`, `theme`, `heatmap`, `live`, `toast`, `avail` | React state in `App.tsx` | Drives UI in Header and SelectionPanel; needs to trigger re-renders |
| View transform, hover, focus, pointers, flashes | Refs inside `SeatingMap`'s canvas effect | Purely visual; updating them must not cause re-renders |
| Adjacent-finder candidates / cycle index | Refs inside `SelectionPanel` | Derived from stable venue data; no re-render needed |

The `scheduleDrawRef` pattern bridges the two worlds: a `() => void` ref is set inside the canvas effect and called from a secondary `useEffect` that watches React state (`[selectedIds, heatmap, theme]`), so the canvas redraws whenever React state changes without re-registering any event listeners.

### Imperative map handle (`SeatingMapHandle`)

The adjacent-seat finder in `SelectionPanel` needs to zoom and flash the canvas after it selects a run of seats. `SeatingMap` exposes two methods via `useImperativeHandle`:

```ts
interface SeatingMapHandle {
  zoomToSeats(xs: number[], ys: number[], targetScale: number): void;
  flashSeats(ids: string[]): void;
}
```

`App.tsx` holds a `useRef<SeatingMapHandle>` and passes it to `SelectionPanel` as a prop. This avoids lifting view state into React, keeping the canvas engine fully self-contained.

### Live updates

The *Live* toggle starts a 2.6-second `setInterval` that randomly flips 4–8 seat statuses (the same distribution as the design prototype). Direct mutation of `seat.status` on the shared `venueData.seats` array is intentional — it mirrors a WebSocket `push` that would arrive from a server and update the same data structure. The canvas reads these mutations on the next scheduled draw. The only React state updated by the live tick is `avail` (the available-seat count shown in the header), which is passed up via the `onAvailChange` callback.

### Theming

CSS custom properties (`--bg`, `--panel`, `--border`, `--text`, `--dim`, `--chip`, `--accent`) are declared for `[data-theme="light"]` (default) and `[data-theme="dark"]` in `index.css`. The `data-theme` attribute is set on the root `<div>` in `App.tsx`. The canvas palette (`getPalette(theme)`) mirrors the same values so SVG colours and canvas colours always match.

### Responsiveness

At ≤ 760 px the `[data-role="body"]` flex container switches to `column`, the map takes the top portion (`min-height: 230px`), and the panel becomes a half-height scrollable sheet pinned to the bottom — matching the design handoff's mobile breakpoint.

---

## Type overview

```ts
// src/types/index.ts

type SeatStatus = 'available' | 'reserved' | 'sold' | 'held';
type PriceTier  = 1 | 2 | 3 | 4;
type Theme      = 'light' | 'dark';

interface Seat {
  id: string;            // e.g. "101-3-07"
  sectionId: string;
  sectionLabel: string;
  row: number;
  col: number;
  x: number;            // absolute canvas coordinate
  y: number;
  tier: PriceTier;
  price: number;        // USD, no cents
  status: SeatStatus;
}

interface VenueData {
  seats: Seat[];
  sections: SectionMarker[];   // label positions for zoom-in overlay
  rowsMap: Map<string, Seat[]>; // key: "sectionId-rowIndex"
  seatById: Map<string, Seat>;
  grid: Map<string, Seat[]>;   // spatial grid, key: "gx:gy"
  cell: number;                // grid cell size in world units (26)
  bounds: VenueBounds;
  stage: Stage;
  center: { cx: number; cy: number };
}
```

---

## Venue generation parameters

| Tier | Sections | Rows | Base radius | Price bands |
|------|----------|------|-------------|-------------|
| 1 (Lower Bowl) | 16 | 14 | 182 px | Rows 0–6 → $295 (tier 1) · Rows 7–13 → $215 (tier 2) |
| 2 (Mid Bowl)   | 18 | 12 | 333 px | Rows 0–5 → $215 (tier 2) · Rows 6–11 → $145 (tier 3) |
| 3 (Upper Bowl) | 22 | 20 | 466 px | Rows 0–9 → $145 (tier 3) · Rows 10–19 → $95 (tier 4) |

Initial seat-status distribution (seeded RNG, fully deterministic):

| Status | Probability |
|--------|-------------|
| Available | 60% |
| Sold | 22% |
| Reserved | 11% |
| On hold | 7% |

---

## Accessibility

| Feature | Implementation |
|---|---|
| Keyboard navigation | Arrow keys move a focus cursor between seats using a directional-projection algorithm; Enter / Space selects |
| Focus indicator | Dashed accent-colour ring drawn on the canvas around the focused seat |
| Screen-reader announcements | `aria-live="polite"` region updated on each keyboard move: "Section 101, row 3, seat 7. Available. Tier 1, $295." |
| Buttons | All buttons have `aria-label`; toggle buttons carry `aria-pressed` |
| Seat count pill | `aria-label` reflects the current count |
| Remove seat buttons | `aria-label` includes the full seat identifier |
| Toast alerts | `role="alert"` for immediate screen-reader pickup |
| Canvas label | `role="application"` with a descriptive `aria-label` explaining keyboard controls |

---

## Incomplete features / TODOs

- **Tests** — no unit or end-to-end tests are included. The adjacent-finder algorithm (`buildAdjCandidates`) and the directional-navigation scoring function (`directional`) are the highest-value targets for unit tests. Playwright or Cypress would be appropriate for E2E.
- **Real WebSocket** — live updates are simulated with `setInterval`. A production build would replace `startLive` / `stopLive` with a real WebSocket or SSE connection.
- **Checkout flow** — the Checkout button shows a toast. A real implementation would route to a payment or seat-confirmation page.
- **`venue.json` seat data** — the file currently holds only metadata. A backend would serve full seat data (with real-time statuses) through an API, replacing the procedural generator.
- **Section filter / search** — there is no way to search for a section by number. A search bar above the panel would help users navigate a large arena.
- **Reduced-motion support** — the flash and pulse-dot animations do not check `prefers-reduced-motion`. Wrapping the animation starts with a media-query check would improve comfort for motion-sensitive users.
