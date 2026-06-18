export type SeatStatus = 'available' | 'reserved' | 'sold' | 'held';
export type PriceTier = 1 | 2 | 3 | 4;
export type Theme = 'light' | 'dark';

export interface Seat {
  id: string;
  sectionId: string;
  sectionLabel: string;
  row: number;
  col: number;
  x: number;
  y: number;
  tier: PriceTier;
  price: number;
  status: SeatStatus;
}

export interface SectionMarker {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface VenueBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Stage {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface VenueData {
  seats: Seat[];
  sections: SectionMarker[];
  rowsMap: Map<string, Seat[]>;
  seatById: Map<string, Seat>;
  grid: Map<string, Seat[]>;
  cell: number;
  bounds: VenueBounds;
  stage: Stage;
  center: { cx: number; cy: number };
}

export interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

/** Exposed imperative handle from SeatingMap */
export interface SeatingMapHandle {
  zoomToSeats: (xs: number[], ys: number[], targetScale: number) => void;
  flashSeats: (ids: string[]) => void;
}
