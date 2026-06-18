import { getPalette } from '../utils/colors';
import type { Theme } from '../types';

interface LegendProps {
  heatmap: boolean;
  theme: Theme;
}

/** Color legend positioned at bottom-left of the map. */
export default function Legend({ heatmap, theme }: LegendProps) {
  const p = getPalette(theme);

  const items = heatmap
    ? [
        { label: 'Tier 1 · $295', color: p.tier[1] },
        { label: 'Tier 2 · $215', color: p.tier[2] },
        { label: 'Tier 3 · $145', color: p.tier[3] },
        { label: 'Tier 4 · $95',  color: p.tier[4] },
        { label: 'Unavailable',   color: p.status.sold },
      ]
    : [
        { label: 'Available', color: p.status.available, ring: 'none' },
        { label: 'Selected',  color: p.accent, ring: `0 0 0 1.5px ${p.dark ? '#0a0d12' : '#fff'} inset` },
        { label: 'On hold',   color: p.status.held },
        { label: 'Reserved',  color: p.status.reserved },
        { label: 'Sold',      color: p.status.sold },
      ];

  return (
    <div
      data-role="legend"
      style={{
        position: 'absolute',
        left: 14,
        bottom: 14,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '9px 16px',
        maxWidth: '58%',
        padding: '11px 14px',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 2px 12px rgba(10,15,25,.07)',
        zIndex: 6,
      }}
      aria-label="Map color legend"
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--dim)', fontWeight: 500 }}
        >
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: item.color,
              boxShadow: 'ring' in item ? item.ring : 'none',
              display: 'block',
              flex: 'none',
            }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}
