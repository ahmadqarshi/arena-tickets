import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { VenueData, Theme, SeatingMapHandle } from '../types';
import { getPalette, getSeatColor } from '../utils/colors';
import { STATUS_LABELS } from '../utils/format';
import Toolbar from './Toolbar';
import Legend from './Legend';
import ZoomControls from './ZoomControls';

const SEAT_R = 3.4;
const MAX_SEATS = 8;

interface SeatingMapProps {
  venueData: VenueData;
  selectedIds: ReadonlyArray<string>;
  heatmap: boolean;
  theme: Theme;
  live: boolean;
  toast: string | null;
  onSeatToggle: (id: string) => void;
  onToast: (msg: string) => void;
  onHeatmapChange: (v: boolean) => void;
  onLiveChange: (v: boolean) => void;
  onThemeToggle: () => void;
  onAvailChange: (n: number) => void;
}

/**
 * Canvas-based interactive seating map.
 *
 * Rendering strategy: seats are batched by fill color into a single path per
 * color, giving O(colors) draw calls instead of O(seats). For ~13k seats this
 * keeps frame time well under 16ms even on mid-range devices.
 *
 * Hit testing uses a spatial grid (cell=26px) so pointer moves stay O(1).
 */
const SeatingMap = forwardRef<SeatingMapHandle, SeatingMapProps>(
  function SeatingMap(props, ref) {
    const {
      venueData,
      selectedIds,
      heatmap,
      theme,
      live,
      toast,
      onSeatToggle,
      onToast,
      onHeatmapChange,
      onLiveChange,
      onThemeToggle,
      onAvailChange,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const liveRegionRef = useRef<HTMLDivElement>(null);

    // These refs allow the canvas engine (inside useEffect) to always read
    // the latest React state without needing to re-register event listeners.
    const selectedIdsRef = useRef(selectedIds);
    const selSetRef = useRef<Set<string>>(new Set(selectedIds));
    const heatmapRef = useRef(heatmap);
    const themeRef = useRef(theme);
    const liveRef = useRef(live);
    const onSeatToggleRef = useRef(onSeatToggle);
    const onToastRef = useRef(onToast);
    const onAvailChangeRef = useRef(onAvailChange);

    // Keep all refs current on every render (runs synchronously before effects)
    selectedIdsRef.current = selectedIds;
    selSetRef.current = new Set(selectedIds);
    heatmapRef.current = heatmap;
    themeRef.current = theme;
    liveRef.current = live;
    onSeatToggleRef.current = onSeatToggle;
    onToastRef.current = onToast;
    onAvailChangeRef.current = onAvailChange;

    // scheduleDrawRef is set inside the canvas setup effect so that
    // secondary effects (which watch React state) can trigger redraws.
    const scheduleDrawRef = useRef<() => void>(() => {});
    const zoomToSeatsRef = useRef<(xs: number[], ys: number[], s: number) => void>(() => {});
    const flashSeatsRef = useRef<(ids: string[]) => void>(() => {});

    // Expose imperative handle to parent (for adjacent-seat finder zoom + flash)
    useImperativeHandle(ref, () => ({
      zoomToSeats: (xs, ys, s) => zoomToSeatsRef.current(xs, ys, s),
      flashSeats: (ids) => flashSeatsRef.current(ids),
    }));

    // Trigger canvas redraw whenever selection, palette, or heatmap changes.
    useEffect(() => {
      scheduleDrawRef.current();
    }, [selectedIds, heatmap, theme]);

    // Start/stop live updates when `live` prop changes.
    const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const flashesExternalRef = useRef<Map<string, number>>(new Map());
    const ensureAnimRef = useRef<() => void>(() => {});

    useEffect(() => {
      if (live) {
        if (liveIntervalRef.current) return;
        liveIntervalRef.current = setInterval(() => {
          const sel = selSetRef.current;
          const flashes = flashesExternalRef.current;
          const ensureAnim = ensureAnimRef.current;
          const seats = venueData.seats;
          const flips = 4 + Math.floor(Math.random() * 4);
          for (let i = 0; i < flips; i++) {
            const s = seats[Math.floor(Math.random() * seats.length)];
            if (sel.has(s.id)) continue;
            if (s.status === 'available') {
              s.status = Math.random() < 0.6 ? 'sold' : Math.random() < 0.5 ? 'reserved' : 'held';
            } else if (Math.random() < 0.45) {
              s.status = 'available';
            } else {
              continue;
            }
            flashes.set(s.id, performance.now());
          }
          const avail = seats.filter((s) => s.status === 'available').length;
          onAvailChangeRef.current(avail);
          ensureAnim();
          scheduleDrawRef.current();
        }, 2600);
      } else {
        if (liveIntervalRef.current) {
          clearInterval(liveIntervalRef.current);
          liveIntervalRef.current = null;
        }
      }
      return () => {
        if (liveIntervalRef.current) {
          clearInterval(liveIntervalRef.current);
          liveIntervalRef.current = null;
        }
      };
    }, [live, venueData.seats]);

    // ── Main canvas engine ────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const tooltip = tooltipRef.current;
      const liveEl = liveRegionRef.current;
      if (!canvas || !wrap) return;

      const ctx = canvas.getContext('2d')!;
      const { seats, seatById, grid, cell, bounds, stage, sections, center } = venueData;

      // ── Mutable engine state (not React state) ──────────────────────────
      let cssW = 1, cssH = 1, dpr = 1;
      const view = { scale: 1, tx: 0, ty: 0 };
      let hoverId: string | null = null;
      let focusId: string | null = null;
      const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean }>();
      let panStart: { tx: number; ty: number; x: number; y: number } | null = null;
      let pinchStart: { dist: number; midX: number; midY: number; scale: number; tx: number; ty: number } | null = null;
      const flashes = flashesExternalRef.current;
      let drawScheduled = false;
      let animRunning = false;
      let rafId: number | null = null;

      // ── Draw ───────────────────────────────────────────────────────────────
      const draw = () => {
        const p = getPalette(themeRef.current);
        const sel = selSetRef.current;
        const hmMode = heatmapRef.current;
        const { scale, tx, ty } = view;
        const r = SEAT_R;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);

        // Stage ellipse
        ctx.fillStyle = p.stage;
        ctx.beginPath();
        ctx.ellipse(stage.cx, stage.cy, stage.rx, stage.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.stageTx;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${28 / scale}px 'Hanken Grotesk', sans-serif`;
        ctx.fillText('STAGE', stage.cx, stage.cy);

        // Batch non-selected seats by color (key performance path)
        const groups = new Map<string, typeof seats>();
        for (const s of seats) {
          if (sel.has(s.id)) continue;
          const col = getSeatColor(s, p, hmMode);
          let arr = groups.get(col);
          if (!arr) { arr = []; groups.set(col, arr); }
          arr.push(s);
        }
        for (const [col, arr] of groups) {
          ctx.fillStyle = col;
          ctx.beginPath();
          for (const s of arr) {
            ctx.moveTo(s.x + r, s.y);
            ctx.arc(s.x, s.y, r, 0, 6.2832);
          }
          ctx.fill();
        }

        // Selected seats with accent fill + outline
        if (sel.size) {
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          for (const id of sel) {
            const s = seatById.get(id);
            if (!s) continue;
            ctx.moveTo(s.x + r, s.y);
            ctx.arc(s.x, s.y, r, 0, 6.2832);
          }
          ctx.fill();
          ctx.lineWidth = Math.max(0.6, 1.6 / scale);
          ctx.strokeStyle = p.dark ? '#0a0d12' : '#ffffff';
          ctx.beginPath();
          for (const id of sel) {
            const s = seatById.get(id);
            if (!s) continue;
            ctx.moveTo(s.x + r, s.y);
            ctx.arc(s.x, s.y, r, 0, 6.2832);
          }
          ctx.stroke();
        }

        // Section labels (visible when zoomed in)
        if (scale > 1.25) {
          ctx.fillStyle = p.label;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `700 ${Math.min(13, 12 / scale)}px 'Hanken Grotesk', sans-serif`;
          for (const sec of sections) ctx.fillText(sec.label, sec.x, sec.y);
        }

        // Hover ring
        if (hoverId) {
          const s = seatById.get(hoverId);
          if (s) {
            ctx.lineWidth = Math.max(0.8, 1.8 / scale);
            ctx.strokeStyle = p.dark ? '#eef1f6' : '#11151c';
            ctx.beginPath();
            ctx.arc(s.x, s.y, r + 1.8, 0, 6.2832);
            ctx.stroke();
          }
        }

        // Focus ring (dashed accent for keyboard nav)
        if (focusId) {
          const s = seatById.get(focusId);
          if (s) {
            ctx.lineWidth = Math.max(1, 2 / scale);
            ctx.strokeStyle = p.accent;
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.beginPath();
            ctx.arc(s.x, s.y, r + 2.6, 0, 6.2832);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Flash animations (live seat-status changes)
        if (flashes.size) {
          const now = performance.now();
          for (const [id, start] of flashes) {
            const t = (now - start) / 800;
            if (t >= 1) { flashes.delete(id); continue; }
            const s = seatById.get(id);
            if (!s) continue;
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.lineWidth = Math.max(0.8, 1.8 / scale);
            const p2 = getPalette(themeRef.current);
            ctx.strokeStyle = sel.has(id) ? p2.accent : getSeatColor(s, p2, heatmapRef.current);
            ctx.beginPath();
            ctx.arc(s.x, s.y, r + t * 9, 0, 6.2832);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      };

      const scheduleDraw = () => {
        if (drawScheduled) return;
        drawScheduled = true;
        requestAnimationFrame(() => {
          drawScheduled = false;
          draw();
        });
      };

      const ensureAnim = () => {
        if (animRunning) return;
        animRunning = true;
        const loop = () => {
          draw();
          if (flashes.size) {
            rafId = requestAnimationFrame(loop);
          } else {
            animRunning = false;
          }
        };
        rafId = requestAnimationFrame(loop);
      };

      // Expose to live-update effect and imperative handle
      scheduleDrawRef.current = scheduleDraw;
      ensureAnimRef.current = ensureAnim;

      // ── Resize + fit ───────────────────────────────────────────────────────
      const resize = () => {
        const rect = wrap.getBoundingClientRect();
        cssW = Math.max(1, rect.width);
        cssH = Math.max(1, rect.height);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        scheduleDraw();
      };

      const fit = () => {
        const pad = 46;
        const sc = Math.min(
          (cssW - pad * 2) / (bounds.maxX - bounds.minX),
          (cssH - pad * 2) / (bounds.maxY - bounds.minY),
        );
        view.scale = sc;
        view.tx = cssW / 2 - ((bounds.minX + bounds.maxX) / 2) * sc;
        view.ty = cssH / 2 - ((bounds.minY + bounds.maxY) / 2) * sc;
      };

      const clampScale = (s: number) => Math.max(0.4, Math.min(7, s));

      const zoomAt = (cx: number, cy: number, factor: number) => {
        const ns = clampScale(view.scale * factor);
        const wx = (cx - view.tx) / view.scale;
        const wy = (cy - view.ty) / view.scale;
        view.scale = ns;
        view.tx = cx - wx * ns;
        view.ty = cy - wy * ns;
        scheduleDraw();
      };

      const zoomBtn = (f: number) => zoomAt(cssW / 2, cssH / 2, f);

      // Expose zoom methods for parent use
      zoomToSeatsRef.current = (xs, ys, targetScale) => {
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const ns = clampScale(targetScale);
        view.scale = ns;
        view.tx = cssW / 2 - cx * ns;
        view.ty = cssH / 2 - cy * ns;
        scheduleDraw();
      };

      flashSeatsRef.current = (ids) => {
        ids.forEach((id) => flashes.set(id, performance.now()));
        ensureAnim();
        scheduleDraw();
      };

      // Store on wrap element so ZoomControls can call them
      (wrap as unknown as Record<string, () => void>)._zoomIn = () => zoomBtn(1.3);
      (wrap as unknown as Record<string, () => void>)._zoomOut = () => zoomBtn(1 / 1.3);
      (wrap as unknown as Record<string, () => void>)._resetView = () => { fit(); scheduleDraw(); };

      // ── Hit testing ────────────────────────────────────────────────────────
      const evXY = (e: PointerEvent | WheelEvent): [number, number] => {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
      };

      const seatAt = (cssX: number, cssY: number) => {
        const wx = (cssX - view.tx) / view.scale;
        const wy = (cssY - view.ty) / view.scale;
        const maxW = Math.max(SEAT_R * 2.2, 9 / view.scale);
        const c = cell;
        const x0 = Math.floor((wx - maxW) / c);
        const x1 = Math.floor((wx + maxW) / c);
        const y0 = Math.floor((wy - maxW) / c);
        const y1 = Math.floor((wy + maxW) / c);
        let best: typeof seats[0] | null = null;
        let bd = maxW * maxW;
        for (let gx = x0; gx <= x1; gx++) {
          for (let gy = y0; gy <= y1; gy++) {
            const arr = grid.get(`${gx}:${gy}`);
            if (!arr) continue;
            for (const s of arr) {
              const dx = s.x - wx;
              const dy = s.y - wy;
              const d = dx * dx + dy * dy;
              if (d < bd) { bd = d; best = s; }
            }
          }
        }
        return best;
      };

      // ── Tooltip ────────────────────────────────────────────────────────────
      const showTooltip = (cssX: number, cssY: number, s: typeof seats[0]) => {
        if (!tooltip) return;
        const p = getPalette(themeRef.current);
        const col = p.status[s.status];
        tooltip.innerHTML = `<div style="font-weight:700;margin-bottom:2px">Section ${s.sectionLabel} · Row ${s.row} · Seat ${s.col}</div><div style="opacity:.85;display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${col};display:inline-block;flex:none"></span>${STATUS_LABELS[s.status]} · Tier ${s.tier} · $${s.price}</div>`;
        tooltip.style.display = 'block';
        tooltip.style.left = cssX + 'px';
        tooltip.style.top = cssY + 'px';
      };

      const showTooltipForSeat = (s: typeof seats[0]) => {
        showTooltip(s.x * view.scale + view.tx, s.y * view.scale + view.ty, s);
      };

      const hideTooltip = () => {
        if (tooltip) tooltip.style.display = 'none';
      };

      // ── Announcement (a11y) ────────────────────────────────────────────────
      const announce = (s: typeof seats[0]) => {
        if (liveEl) liveEl.textContent = `Section ${s.sectionLabel}, row ${s.row}, seat ${s.col}. ${STATUS_LABELS[s.status]}. Tier ${s.tier}, $${s.price}.`;
      };

      // ── Selection helpers ──────────────────────────────────────────────────
      const handleSeatClick = (s: typeof seats[0]) => {
        if (s.status !== 'available') {
          onToastRef.current(`That seat is ${STATUS_LABELS[s.status].toLowerCase()}`);
          return;
        }
        const cur = selectedIdsRef.current;
        if (cur.includes(s.id)) {
          onSeatToggleRef.current(s.id);
          return;
        }
        if (cur.length >= MAX_SEATS) {
          onToastRef.current('Maximum of 8 seats');
          return;
        }
        onSeatToggleRef.current(s.id);
      };

      // ── Keyboard navigation ────────────────────────────────────────────────
      const centerSeat = () => {
        const { cx, cy } = center;
        let best = seats[0];
        let bd = 1e18;
        for (const s of seats) {
          if (s.status !== 'available') continue;
          const d = (s.x - cx) ** 2 + (s.y - cy) ** 2;
          if (d < bd) { bd = d; best = s; }
        }
        return best;
      };

      const directional = (seat: typeof seats[0], [dx, dy]: [number, number]) => {
        let best: typeof seats[0] | null = null;
        let bs = 1e18;
        for (const s of seats) {
          if (s === seat) continue;
          const vx = s.x - seat.x;
          const vy = s.y - seat.y;
          const proj = vx * dx + vy * dy;
          if (proj <= 0.5) continue;
          const lat = Math.abs(vx * dy - vy * dx);
          if (lat > proj * 1.7) continue;
          const score = proj + lat * 1.8;
          if (score < bs) { bs = score; best = s; }
        }
        return best;
      };

      const ensureVisible = (s: typeof seats[0]) => {
        const pad = 80;
        const sx = s.x * view.scale + view.tx;
        const sy = s.y * view.scale + view.ty;
        if (sx < pad || sx > cssW - pad || sy < pad || sy > cssH - 380) {
          if (view.scale < 1.6) view.scale = 1.8;
          view.tx = cssW / 2 - s.x * view.scale;
          view.ty = cssH / 2 - s.y * view.scale;
        }
      };

      // ── Event handlers ─────────────────────────────────────────────────────
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const [x, y] = evXY(e);
        zoomAt(x, y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      };

      const onPointerDown = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        const [x, y] = evXY(e);
        pointers.set(e.pointerId, { x, y, sx: x, sy: y, moved: false });
        if (pointers.size === 1) {
          panStart = { tx: view.tx, ty: view.ty, x, y };
        } else if (pointers.size === 2) {
          pinchStart = pinchSnapshot();
        }
        hideTooltip();
        hoverId = null;
      };

      const pinchSnapshot = () => {
        const pts = [...pointers.values()];
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        return {
          dist: Math.hypot(dx, dy) || 1,
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2,
          scale: view.scale,
          tx: view.tx,
          ty: view.ty,
        };
      };

      const onPointerMove = (e: PointerEvent) => {
        const [x, y] = evXY(e);
        const pt = pointers.get(e.pointerId);
        if (pt) {
          pt.x = x; pt.y = y;
          if (Math.hypot(x - pt.sx, y - pt.sy) > 4) pt.moved = true;
        }

        // Pinch zoom
        if (pointers.size >= 2 && pinchStart) {
          const ps = pinchStart;
          const cur = pinchSnapshot();
          const ns = clampScale(ps.scale * (cur.dist / ps.dist));
          const wx = (ps.midX - ps.tx) / ps.scale;
          const wy = (ps.midY - ps.ty) / ps.scale;
          view.scale = ns;
          view.tx = cur.midX - wx * ns;
          view.ty = cur.midY - wy * ns;
          scheduleDraw();
          return;
        }

        // Pan
        if (pointers.size === 1 && panStart && pt) {
          canvas.style.cursor = 'grabbing';
          view.tx = panStart.tx + (x - panStart.x);
          view.ty = panStart.ty + (y - panStart.y);
          scheduleDraw();
          return;
        }

        // Hover
        const s = seatAt(x, y);
        const id = s ? s.id : null;
        canvas.style.cursor = s && s.status === 'available' ? 'pointer' : 'default';
        if (id !== hoverId) { hoverId = id; scheduleDraw(); }
        if (s) showTooltip(x, y, s); else hideTooltip();
      };

      const onPointerUp = (e: PointerEvent) => {
        const pt = pointers.get(e.pointerId);
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = null;
        canvas.style.cursor = 'default';
        if (pt && !pt.moved && e.button === 0 && pointers.size === 0) {
          const s = seatAt(pt.x, pt.y);
          if (s) handleSeatClick(s);
        }
      };

      const onPointerLeave = () => {
        if (pointers.size === 0) { hoverId = null; hideTooltip(); scheduleDraw(); }
      };

      const DIRS: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (DIRS[e.key]) {
          e.preventDefault();
          if (!focusId) {
            focusId = centerSeat().id;
          } else {
            const nx = directional(seatById.get(focusId)!, DIRS[e.key]);
            if (nx) focusId = nx.id;
          }
          const s = seatById.get(focusId)!;
          ensureVisible(s); scheduleDraw(); showTooltipForSeat(s); announce(s);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!focusId) {
            focusId = centerSeat().id;
            const s = seatById.get(focusId)!;
            ensureVisible(s); scheduleDraw(); showTooltipForSeat(s); announce(s);
            return;
          }
          handleSeatClick(seatById.get(focusId)!);
          return;
        }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBtn(1.2); }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBtn(1 / 1.2); }
        if (e.key === 'Escape') { focusId = null; hideTooltip(); scheduleDraw(); }
      };

      // ── Setup ──────────────────────────────────────────────────────────────
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('keydown', onKeyDown);

      const ro = new ResizeObserver(() => resize());
      ro.observe(wrap);
      window.addEventListener('resize', resize);

      resize();
      fit();
      draw();

      return () => {
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('keydown', onKeyDown);
        ro.disconnect();
        window.removeEventListener('resize', resize);
        if (rafId) cancelAnimationFrame(rafId);
      };
    }, [venueData]); // venueData is stable (generated once via useMemo)

    // Zoom button handlers that delegate to the engine via wrap element
    const handleZoomIn = () => {
      const w = wrapRef.current as unknown as Record<string, (() => void) | undefined>;
      w?._zoomIn?.();
    };
    const handleZoomOut = () => {
      const w = wrapRef.current as unknown as Record<string, (() => void) | undefined>;
      w?._zoomOut?.();
    };
    const handleResetView = () => {
      const w = wrapRef.current as unknown as Record<string, (() => void) | undefined>;
      w?._resetView?.();
    };

    return (
      <div
        data-role="map"
        ref={wrapRef}
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          background: 'var(--map)',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Arena seating map. Use arrow keys to move between seats, Enter or Space to select a seat, plus and minus to zoom."
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            outline: 'none',
            touchAction: 'none',
            cursor: 'default',
          }}
        />

        <Toolbar
          heatmap={heatmap}
          live={live}
          theme={theme}
          onHeatmapChange={onHeatmapChange}
          onLiveChange={onLiveChange}
          onThemeToggle={onThemeToggle}
        />

        <Legend heatmap={heatmap} theme={theme} />

        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
        />

        {/* Hover / click tooltip */}
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            display: 'none',
            pointerEvents: 'none',
            transform: 'translate(-50%, calc(-100% - 14px))',
            padding: '8px 11px',
            borderRadius: 9,
            background: '#11151c',
            color: '#fff',
            fontSize: 12.5,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 22px rgba(0,0,0,.3)',
            zIndex: 8,
          }}
        />

        {/* Toast notification */}
        {toast && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 18,
              transform: 'translateX(-50%)',
              padding: '10px 16px',
              borderRadius: 10,
              background: '#11151c',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 6px 22px rgba(0,0,0,.28)',
              zIndex: 9,
              whiteSpace: 'nowrap',
            }}
          >
            {toast}
          </div>
        )}

        {/* ARIA live region for keyboard nav announcements */}
        <div
          ref={liveRegionRef}
          aria-live="polite"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        />
      </div>
    );
  },
);

export default SeatingMap;
