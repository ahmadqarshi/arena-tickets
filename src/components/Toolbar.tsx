import React from 'react';
import type { Theme } from '../types';

interface ToolbarProps {
  heatmap: boolean;
  live: boolean;
  theme: Theme;
  onHeatmapChange: (v: boolean) => void;
  onLiveChange: (v: boolean) => void;
  onThemeToggle: () => void;
}

/** Map mode controls: Status/Price toggle, Live indicator, and dark-mode switch. */
export default function Toolbar({ heatmap, live, theme, onHeatmapChange, onLiveChange, onThemeToggle }: ToolbarProps) {
  const segStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    border: 'none',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--dim)',
  });

  const liveColor = '#19a463';

  return (
    <div
      data-role="toolbar"
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        zIndex: 6,
      }}
    >
      {/* Status / Price segmented control */}
      <div
        style={{
          display: 'flex',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 11,
          padding: 3,
          boxShadow: '0 2px 12px rgba(10,15,25,.07)',
        }}
      >
        <button
          onClick={() => onHeatmapChange(false)}
          aria-pressed={!heatmap}
          style={segStyle(!heatmap)}
        >
          Status
        </button>
        <button
          onClick={() => onHeatmapChange(true)}
          aria-pressed={heatmap}
          style={segStyle(heatmap)}
        >
          Price
        </button>
      </div>

      {/* Live toggle */}
      <button
        onClick={() => onLiveChange(!live)}
        aria-pressed={live}
        title="Live status updates"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          height: 38,
          padding: '0 14px',
          borderRadius: 11,
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(10,15,25,.07)',
          background: 'var(--panel)',
          border: `1px solid ${live ? liveColor : 'var(--border)'}`,
          color: live ? liveColor : 'var(--text)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: live ? liveColor : '#bcc3cf',
            animation: live ? 'pulseDot 1.6s infinite' : 'none',
          }}
        />
        Live
      </button>

      {/* Dark-mode toggle */}
      <button
        onClick={onThemeToggle}
        aria-label="Toggle dark mode"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          borderRadius: 11,
          border: '1px solid var(--border)',
          background: 'var(--panel)',
          color: 'var(--text)',
          cursor: 'pointer',
          fontSize: 16,
          boxShadow: '0 2px 12px rgba(10,15,25,.07)',
        }}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
}
