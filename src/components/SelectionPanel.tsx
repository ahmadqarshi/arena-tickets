import { useState, useRef, useCallback } from 'react';
import type { VenueData, Theme, SeatingMapHandle } from '../types';
import { getPalette } from '../utils/colors';
import { formatMoney, STATUS_LABELS } from '../utils/format';

interface SelectionPanelProps {
  venueData: VenueData;
  selectedIds: ReadonlyArray<string>;
  theme: Theme;
  seatingMapRef: React.RefObject<SeatingMapHandle | null>;
  onSelectionChange: (ids: string[]) => void;
  onSeatRemove: (id: string) => void;
  onClearAll: () => void;
  onToast: (msg: string) => void;
}

/**
 * Right-hand selection panel.
 *
 * Contains the "Find N adjacent seats" helper, the list of chosen seats,
 * and the order summary with checkout action.
 */
export default function SelectionPanel({
  venueData,
  selectedIds,
  theme,
  seatingMapRef,
  onSelectionChange,
  onSeatRemove,
  onClearAll,
  onToast,
}: SelectionPanelProps) {
  const [adjN, setAdjN] = useState(2);
  const [adjTier, setAdjTier] = useState<'any' | 1 | 2 | 3 | 4>('any');
  const [adjActive, setAdjActive] = useState(false);

  // Candidate list and cycling index (reset when N or tier changes)
  const adjKeyRef = useRef<string | null>(null);
  const adjCandsRef = useRef<Array<Array<typeof venueData.seats[0]>>>([]);
  const adjIdxRef = useRef(-1);

  const p = getPalette(theme);

  const subtotal = selectedIds.reduce((acc, id) => {
    const s = venueData.seatById.get(id);
    return acc + (s ? s.price : 0);
  }, 0);
  const fees = Math.round(subtotal * 0.13);
  const total = subtotal + fees;
  const has = selectedIds.length > 0;

  // ── Adjacent finder ────────────────────────────────────────────────────────

  const resetAdj = useCallback(() => {
    adjKeyRef.current = null;
  }, []);

  const buildAdjCandidates = useCallback(
    (n: number, tier: 'any' | number) => {
      const cands: Array<Array<typeof venueData.seats[0]>> = [];
      for (const [, arr] of venueData.rowsMap) {
        if (arr.length && tier !== 'any' && arr[0].tier !== tier) continue;
        let i = 0;
        while (i + n <= arr.length) {
          let ok = true;
          for (let k = 0; k < n; k++) {
            const a = arr[i + k];
            if (
              a.status !== 'available' ||
              (k > 0 && a.col !== arr[i + k - 1].col + 1)
            ) {
              ok = false;
              break;
            }
          }
          if (ok) { cands.push(arr.slice(i, i + n)); i += n; }
          else { i++; }
        }
      }
      cands.sort((A, B) => {
        const sa =
          (tier === 'any' ? A[0].tier * 1000 : 0) +
          A[0].row * 10 +
          parseInt(A[0].sectionId, 10) / 100;
        const sb =
          (tier === 'any' ? B[0].tier * 1000 : 0) +
          B[0].row * 10 +
          parseInt(B[0].sectionId, 10) / 100;
        return sa - sb;
      });
      return cands;
    },
    [venueData.rowsMap],
  );

  const handleFindAdjacent = () => {
    const n = Math.min(adjN, 8);
    const tier = adjTier;
    const key = `${n}:${tier}`;
    if (key !== adjKeyRef.current) {
      adjCandsRef.current = buildAdjCandidates(n, tier);
      adjIdxRef.current = -1;
      adjKeyRef.current = key;
    }
    const cands = adjCandsRef.current;
    if (!cands.length) {
      onToast(
        tier === 'any'
          ? `No ${n} adjacent seats found`
          : `No ${n} adjacent seats in Tier ${tier}`,
      );
      setAdjActive(false);
      return;
    }
    adjIdxRef.current = (adjIdxRef.current + 1) % cands.length;
    const run = cands[adjIdxRef.current];
    const ids = run.map((s) => s.id);
    onSelectionChange(ids);
    const xs = run.map((s) => s.x);
    const ys = run.map((s) => s.y);
    seatingMapRef.current?.zoomToSeats(xs, ys, 3.4);
    seatingMapRef.current?.flashSeats(ids);
    setAdjActive(true);
    onToast(
      `Option ${adjIdxRef.current + 1} of ${cands.length} · Section ${run[0].sectionLabel}, Row ${run[0].row}`,
    );
  };

  const incAdj = () => {
    resetAdj();
    setAdjN((n) => Math.min(8, n + 1));
    setAdjActive(false);
  };

  const decAdj = () => {
    resetAdj();
    setAdjN((n) => Math.max(2, n - 1));
    setAdjActive(false);
  };

  const handleTierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    resetAdj();
    const v = e.target.value;
    setAdjTier(v === 'any' ? 'any' : (parseInt(v, 10) as 1 | 2 | 3 | 4));
    setAdjActive(false);
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const checkoutStyle: React.CSSProperties = {
    width: '100%',
    height: 46,
    borderRadius: 11,
    border: 'none',
    background: has ? 'var(--accent)' : 'var(--chip)',
    color: has ? '#fff' : 'var(--dim)',
    fontWeight: 700,
    fontSize: 14.5,
    cursor: has ? 'pointer' : 'not-allowed',
  };

  return (
    <aside
      data-role="aside"
      style={{
        width: 368,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel)',
        borderLeft: '1px solid var(--border)',
        overflowY: 'hidden',
      }}
    >
      {/* ── Panel header + adjacent finder ── */}
      <div style={{ padding: '18px 20px 15px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Your selection</div>
          <div style={{ fontSize: 13, color: 'var(--dim)', fontWeight: 600 }}>
            {selectedIds.length} of 8
          </div>
        </div>

        {/* Adjacent finder controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13 }}>
          {/* N stepper */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--chip)',
              borderRadius: 9,
              overflow: 'hidden',
              flex: 'none',
            }}
          >
            <button
              onClick={decAdj}
              aria-label="Fewer adjacent seats"
              style={{
                width: 32, height: 34, border: 'none', background: 'transparent',
                color: 'var(--text)', fontSize: 18, cursor: 'pointer',
              }}
            >
              −
            </button>
            <div
              style={{
                minWidth: 18, textAlign: 'center', fontWeight: 700, fontSize: 14,
              }}
              aria-label={`${adjN} adjacent seats`}
            >
              {adjN}
            </div>
            <button
              onClick={incAdj}
              aria-label="More adjacent seats"
              style={{
                width: 32, height: 34, border: 'none', background: 'transparent',
                color: 'var(--text)', fontSize: 17, cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>

          {/* Price tier select */}
          <div style={{ position: 'relative', flex: 1 }}>
            <select
              onChange={handleTierChange}
              value={String(adjTier)}
              aria-label="Price tier for adjacent seats"
              style={{
                width: '100%',
                height: 34,
                borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
                padding: '0 26px 0 11px',
                cursor: 'pointer',
              }}
            >
              <option value="any">Any price tier</option>
              <option value="1">Tier 1 · $295</option>
              <option value="2">Tier 2 · $215</option>
              <option value="3">Tier 3 · $145</option>
              <option value="4">Tier 4 · $95</option>
            </select>
            <span
              style={{
                position: 'absolute', right: 10, top: '50%',
                transform: 'translateY(-50%)', pointerEvents: 'none',
                fontSize: 10, color: 'var(--dim)',
              }}
              aria-hidden="true"
            >
              ▾
            </span>
          </div>
        </div>

        <button
          onClick={handleFindAdjacent}
          style={{
            width: '100%',
            height: 36,
            marginTop: 8,
            borderRadius: 9,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {adjActive ? 'Try another spot' : `Find ${adjN} seats together`}
        </button>
      </div>

      {/* ── Seat list ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}>
        {has ? (
          selectedIds.map((id) => {
            const s = venueData.seatById.get(id);
            if (!s) return null;
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '11px 10px',
                  borderRadius: 11,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: p.tier[s.tier],
                    flex: 'none',
                    display: 'block',
                  }}
                  aria-hidden="true"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.2 }}>
                    Section {s.sectionLabel} · Row {s.row} · Seat {s.col}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.3 }}>
                    Tier {s.tier} · {STATUS_LABELS[s.status]}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{formatMoney(s.price)}</div>
                <button
                  onClick={() => onSeatRemove(id)}
                  aria-label={`Remove Section ${s.sectionLabel} Row ${s.row} Seat ${s.col}`}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--dim)',
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: 'pointer',
                    flex: 'none',
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              height: '100%',
              padding: '40px 24px',
              color: 'var(--dim)',
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 13,
                border: '2px dashed var(--border)',
                marginBottom: 14,
              }}
              aria-hidden="true"
            />
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              No seats selected
            </div>
            <div style={{ fontSize: 13, marginTop: 5, maxWidth: 210, lineHeight: 1.45 }}>
              Click a green seat on the map, or focus the map and use arrow keys + Enter.
              Up to 8 seats.
            </div>
          </div>
        )}
      </div>

      {/* ── Order summary + checkout ── */}
      <div style={{ flex: 'none', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13.5,
            color: 'var(--dim)',
            marginBottom: 7,
          }}
        >
          <span>Subtotal</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatMoney(subtotal)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13.5,
            color: 'var(--dim)',
            marginBottom: 7,
          }}
        >
          <span>Service fees</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatMoney(fees)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 16,
            fontWeight: 800,
            margin: '11px 0 14px',
          }}
        >
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>

        <button
          onClick={() => {
            if (has) onToast('Seats reserved — proceeding to checkout');
          }}
          disabled={!has}
          aria-label={has ? `Checkout · ${formatMoney(total)}` : 'Select seats to continue'}
          style={checkoutStyle}
        >
          {has ? `Checkout · ${formatMoney(total)}` : 'Select seats to continue'}
        </button>

        {has && (
          <button
            onClick={() => {
              resetAdj();
              onClearAll();
              setAdjActive(false);
            }}
            style={{
              width: '100%',
              marginTop: 8,
              height: 38,
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: 'var(--dim)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Clear all
          </button>
        )}
      </div>
    </aside>
  );
}
