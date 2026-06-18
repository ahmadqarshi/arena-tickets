import type { Theme, SeatStatus, PriceTier } from '../types';

export interface Palette {
  dark: boolean;
  stage: string;
  stageTx: string;
  label: string;
  accent: string;
  status: Record<SeatStatus, string>;
  tier: Record<PriceTier, string>;
}

export function getPalette(theme: Theme): Palette {
  const dark = theme === 'dark';
  return {
    dark,
    stage: dark ? '#1b2230' : '#dde2ea',
    stageTx: dark ? '#566381' : '#9aa3b2',
    label: dark ? 'rgba(220,228,240,.5)' : 'rgba(21,23,28,.5)',
    accent: dark ? '#5b8cff' : '#2f6bf3',
    status: {
      available: '#19a463',
      reserved: '#7b8794',
      held: '#e8a200',
      sold: dark ? '#37404e' : '#cfd4dc',
    },
    tier: dark
      ? { 1: '#3b82f6', 2: '#5b8cff', 3: '#86a9ff', 4: '#b3caff' }
      : { 1: '#1d4ed8', 2: '#3b82f6', 3: '#6aa0fb', 4: '#a6c6fc' },
  };
}

export function getSeatColor(
  seat: { status: SeatStatus; tier: PriceTier },
  palette: Palette,
  heatmap: boolean,
): string {
  if (heatmap && seat.status === 'available') return palette.tier[seat.tier];
  return palette.status[seat.status];
}
