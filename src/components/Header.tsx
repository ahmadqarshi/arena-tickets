import type { Theme } from '../types';

interface HeaderProps {
  selectedCount: number;
  availableCount: number;
  theme: Theme;
}

/** Top navigation bar with venue name, event info, and selection summary. */
export default function Header({ selectedCount, availableCount }: HeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '0 20px',
        height: 60,
        flex: 'none',
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        zIndex: 5,
      }}
    >
      {/* Left: logo + venue / event details */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 15,
            flex: 'none',
          }}
          aria-hidden="true"
        >
          M
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Metropolis Arena
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--dim)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Aurora — Live in Concert · Sat Aug 15, 8:00 PM
          </div>
        </div>
      </div>

      {/* Right: available count + selection pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
        <div
          style={{ fontSize: 12.5, color: 'var(--dim)', whiteSpace: 'nowrap' }}
          aria-label={`${availableCount.toLocaleString('en-US')} seats available`}
        >
          {availableCount.toLocaleString('en-US')} seats available
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'var(--chip)',
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
          aria-label={`${selectedCount} seats selected`}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'block',
            }}
          />
          {selectedCount} seats
        </div>
      </div>
    </header>
  );
}
