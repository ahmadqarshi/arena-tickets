import React from 'react';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

const btnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 11,
  border: '1px solid var(--border)',
  background: 'var(--panel)',
  color: 'var(--text)',
  cursor: 'pointer',
  boxShadow: '0 2px 12px rgba(10,15,25,.07)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** Zoom in / out / fit-to-view buttons positioned at bottom-right of the map. */
export default function ZoomControls({ onZoomIn, onZoomOut, onResetView }: ZoomControlsProps) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        bottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: 6,
      }}
    >
      <button onClick={onZoomIn} aria-label="Zoom in" style={{ ...btnStyle, fontSize: 20 }}>
        +
      </button>
      <button onClick={onZoomOut} aria-label="Zoom out" style={{ ...btnStyle, fontSize: 22, lineHeight: 1 }}>
        −
      </button>
      <button onClick={onResetView} aria-label="Fit map to view" style={{ ...btnStyle, fontSize: 15 }}>
        ⤢
      </button>
    </div>
  );
}
