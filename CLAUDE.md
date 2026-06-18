# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start dev server (http://localhost:5173)
pnpm build        # tsc -b then vite build — must pass before committing
pnpm lint         # ESLint across all .ts/.tsx
pnpm format       # Prettier (write)
pnpm preview      # serve the dist/ build locally
```

There are no tests. `pnpm build` is the primary correctness gate — it runs `tsc -b` in strict mode before bundling, so type errors surface here.

## Architecture

**Data flow** — `App.tsx` is the single source of truth for all React state (`selectedIds`, `theme`, `heatmap`, `live`, `toast`, `avail`). It generates `venueData` once via `useMemo(() => generateVenue(), [])` and passes it by reference to both children. `venueData` is intentionally mutable: the live-update ticker mutates `seat.status` directly on the shared array (mimicking a WebSocket push) without going through React state.

**Canvas engine** — `SeatingMap.tsx` is almost entirely imperative. The canvas setup lives in a single `useEffect(..., [venueData])` closure that owns all render-critical mutable state: `view` (scale/tx/ty), `hoverId`, `focusId`, pointer map, flash timers. These never touch React state, so interactions produce zero re-renders. To expose methods to the parent, two function refs (`zoomToSeatsRef`, `flashSeatsRef`) are set inside the closure and forwarded out via `useImperativeHandle`.

**Bridging React state → canvas** — a `scheduleDrawRef` (`useRef<() => void>`) is also set inside the canvas closure. A secondary `useEffect(..., [selectedIds, heatmap, theme])` calls it whenever React state changes, triggering a rAF-coalesced redraw without re-registering any event listeners.

**Cross-component imperative calls** — `SelectionPanel` needs to zoom and flash the canvas after the adjacent-seat finder selects a run. `App.tsx` holds `seatingMapRef = useRef<SeatingMapHandle>()` and passes it to `SelectionPanel` as a prop. `SeatingMapHandle` exposes `zoomToSeats` and `flashSeats`.

**Styling** — all visual tokens (`--bg`, `--panel`, `--border`, `--text`, `--dim`, `--chip`, `--accent`) are CSS custom properties declared in `index.css` for `[data-theme="light"]` and `[data-theme="dark"]`. The `data-theme` attribute sits on the root `<div>` in `App.tsx`. Every component uses `var(--token)` inline styles — there are no CSS modules or external style sheets beyond `index.css`. The canvas palette (`getPalette` in `colors.ts`) mirrors the same colour values so canvas and DOM colours always agree.

**Mobile layout** — `index.css` targets `[data-role="body"]`, `[data-role="map"]`, `[data-role="aside"]`, `[data-role="toolbar"]`, and `[data-role="legend"]` with a 760 px breakpoint. These `data-role` attributes are set directly on the relevant DOM elements.

## Key constraints

- **TypeScript strict** — `strict: true`, `noUnusedLocals`, `noUnusedParameters` are all on. Use `import type` for type-only imports (`verbatimModuleSyntax` enforces this).
- **No CSS modules / Tailwind** — all component styles are inline `React.CSSProperties` objects or `var(--token)` strings. Keep it that way.
- **Canvas rendering performance** — the draw loop batches seats by fill colour (`Map<color, Seat[]>`) so there is one `beginPath/fill` per distinct colour, not per seat. Do not add per-seat draw calls. Hit testing uses the 26 px spatial grid in `venueData.grid`; do not fall back to linear seat scans on pointer events.
- **`venueData` is stable and mutable** — treat it like a server-owned data store. Never copy or clone the seats array; read from `seatById` for O(1) lookups. Direct status mutations during live updates are intentional.
- **localStorage key** — `arena01:selection:v2`. Changing it breaks persisted selections for existing users.
