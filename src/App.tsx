import { useMemo, useState, useRef, useEffect } from 'react';
import type { Theme, SeatingMapHandle } from './types';
import { generateVenue } from './utils/venueGenerator';
import { countAvailable } from './utils/format';
import Header from './components/Header';
import SeatingMap from './components/SeatingMap';
import SelectionPanel from './components/SelectionPanel';

const STATUS_LABELS: Record<string, string> = {
  available: 'Available', reserved: 'Reserved', sold: 'Sold', held: 'On hold',
};

const STORAGE_KEY = 'arena01:selection:v2';

export default function App() {
  // Generate venue once — deterministic, memoized
  const venueData = useMemo(() => generateVenue(), []);

  // Restore selection from localStorage on mount
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        return ids
          .filter((id) => {
            const s = venueData.seatById.get(id);
            return s && s.status === 'available';
          })
          .slice(0, 8);
      }
    } catch (_) {}
    return [];
  });

  const [heatmap, setHeatmap] = useState(false);
  const [live, setLive] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [toast, setToast] = useState<string | null>(null);
  const [avail, setAvail] = useState(() => countAvailable(venueData.seats));

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seatingMapRef = useRef<SeatingMapHandle>(null);

  // Persist selection to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
    } catch (_) {}
  }, [selectedIds]);

  const handleToast = (msg: string) => {
    setToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2400);
  };

  const handleSeatToggle = (id: string) => {
    const seat = venueData.seatById.get(id);
    if (!seat) return;
    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      return;
    }
    if (seat.status !== 'available') {
      handleToast(`That seat is ${STATUS_LABELS[seat.status].toLowerCase()}`);
      return;
    }
    if (selectedIds.length >= 8) {
      handleToast('Maximum of 8 seats');
      return;
    }
    setSelectedIds((prev) => [...prev, id]);
  };

  return (
    <div
      data-theme={theme}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        background: 'var(--bg)',
        color: 'var(--text)',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <Header
        selectedCount={selectedIds.length}
        availableCount={avail}
        theme={theme}
      />

      <div
        data-role="body"
        style={{ display: 'flex', flex: 1, minHeight: 0 }}
      >
        <SeatingMap
          ref={seatingMapRef}
          venueData={venueData}
          selectedIds={selectedIds}
          heatmap={heatmap}
          theme={theme}
          live={live}
          toast={toast}
          onSeatToggle={handleSeatToggle}
          onToast={handleToast}
          onHeatmapChange={setHeatmap}
          onLiveChange={setLive}
          onThemeToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onAvailChange={setAvail}
        />

        <SelectionPanel
          venueData={venueData}
          selectedIds={selectedIds}
          theme={theme}
          seatingMapRef={seatingMapRef}
          onSelectionChange={setSelectedIds}
          onSeatRemove={(id) => setSelectedIds((prev) => prev.filter((x) => x !== id))}
          onClearAll={() => setSelectedIds([])}
          onToast={handleToast}
        />
      </div>
    </div>
  );
}
