export const formatMoney = (n: number): string =>
  '$' + Math.round(n).toLocaleString('en-US');

export const countAvailable = (seats: Array<{ status: string }>): number =>
  seats.filter((s) => s.status === 'available').length;

export const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  reserved: 'Reserved',
  sold: 'Sold',
  held: 'On hold',
};
