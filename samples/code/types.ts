// TypeScript sample
interface Reading {
  tag: string;
  value: number;
  quality: 'good' | 'bad';
}

export function average(rows: Reading[]): number {
  const good = rows.filter((r) => r.quality === 'good');
  return good.reduce((s, r) => s + r.value, 0) / Math.max(1, good.length);
}
