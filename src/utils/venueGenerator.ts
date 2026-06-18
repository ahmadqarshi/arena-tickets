import type { Seat, SectionMarker, VenueData, SeatStatus, PriceTier } from '../types';

export function generateVenue(): VenueData {
  // Deterministic RNG (closure-based, not class field)
  let seed = 0x1f2e3d4c;

  function rng(): number {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randStatus(): SeatStatus {
    const r = rng();
    if (r < 0.6) return 'available';
    if (r < 0.82) return 'sold';
    if (r < 0.93) return 'reserved';
    return 'held';
  }

  const cx = 700;
  const cy = 520;
  const oval = 0.78;

  const center = { cx, cy };
  const stage = { cx, cy, rx: 152, ry: 94 };

  const tiers = [
    {
      prefix: 1,
      base: 182,
      rowGap: 9,
      rows: 14,
      sections: 16,
      spacing: 8.6,
      bands: [
        [0, 6, 1, 295],
        [7, 13, 2, 215],
      ],
    },
    {
      prefix: 2,
      base: 333,
      rowGap: 9,
      rows: 12,
      sections: 18,
      spacing: 8.8,
      bands: [
        [0, 5, 2, 215],
        [6, 11, 3, 145],
      ],
    },
    {
      prefix: 3,
      base: 466,
      rowGap: 9.2,
      rows: 20,
      sections: 22,
      spacing: 9.2,
      bands: [
        [0, 9, 3, 145],
        [10, 19, 4, 95],
      ],
    },
  ];

  const seats: Seat[] = [];
  const sections: SectionMarker[] = [];
  const rowsMap = new Map<string, Seat[]>();

  for (const t of tiers) {
    const secAng = (Math.PI * 2) / t.sections;
    const pad = secAng * 0.12;
    for (let s = 0; s < t.sections; s++) {
      const a0 = s * secAng - Math.PI / 2 + pad / 2;
      const a1 = (s + 1) * secAng - Math.PI / 2 - pad / 2;
      const label = String(t.prefix * 100 + (s + 1));
      const midA = (a0 + a1) / 2;
      const midR = t.base + (t.rows * t.rowGap) / 2;
      sections.push({
        id: label,
        label,
        x: cx + midR * Math.cos(midA),
        y: cy + midR * Math.sin(midA) * oval,
      });

      for (let r = 0; r < t.rows; r++) {
        const radius = t.base + r * t.rowGap;
        const arcLen = (a1 - a0) * radius;
        const n = Math.max(3, Math.round(arcLen / t.spacing));

        let pt: PriceTier = 2;
        let price = 200;
        for (const b of t.bands) {
          if (r >= b[0] && r <= b[1]) {
            pt = b[2] as PriceTier;
            price = b[3];
          }
        }

        const rowArr: Seat[] = [];
        for (let c = 0; c < n; c++) {
          const frac = n === 1 ? 0.5 : c / (n - 1);
          const theta = a0 + frac * (a1 - a0);
          const x = cx + radius * Math.cos(theta);
          const y = cy + radius * Math.sin(theta) * oval;
          const seat: Seat = {
            id: `${label}-${r + 1}-${String(c + 1).padStart(2, '0')}`,
            sectionId: label,
            sectionLabel: label,
            row: r + 1,
            col: c + 1,
            x,
            y,
            tier: pt,
            price,
            status: randStatus(),
          };
          seats.push(seat);
          rowArr.push(seat);
        }
        rowsMap.set(`${label}-${r + 1}`, rowArr);
      }
    }
  }

  // Build seatById map
  const seatById = new Map<string, Seat>();
  for (const s of seats) {
    seatById.set(s.id, s);
  }

  // Build spatial grid (cell=26)
  const cell = 26;
  const grid = new Map<string, Seat[]>();
  for (const s of seats) {
    const gx = Math.floor(s.x / cell);
    const gy = Math.floor(s.y / cell);
    const key = `${gx}:${gy}`;
    let arr = grid.get(key);
    if (!arr) {
      arr = [];
      grid.set(key, arr);
    }
    arr.push(s);
  }

  // Compute bounds with 30px margin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of seats) {
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
  }
  const margin = 30;
  const bounds = {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  };

  return { seats, sections, rowsMap, seatById, grid, cell, bounds, stage, center };
}
