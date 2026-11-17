import type { AcceptContext, ViewerEntry } from './viewer';

/**
 * Picks the first viewer that accepts the file. Order matters: specific
 * viewers come before general ones (e.g. Sheets claims .csv before Text).
 * A viewer whose accepts() throws is skipped, so one faulty rule can't block others.
 */
export function pickViewer(viewers: ViewerEntry[], ctx: AcceptContext): ViewerEntry | null {
  const ordered = viewers
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (b.v.priority ?? 50) - (a.v.priority ?? 50) || a.i - b.i)
    .map((x) => x.v);
  for (const v of ordered) {
    try {
      if (v.accepts(ctx)) return v;
    } catch (err) {
      console.error(`Viewer ${v.id} failed in accepts()`, err);
    }
  }
  return null;
}

/** Duplicate ids are a programming error; catch them early. */
export function assertUniqueIds(viewers: ViewerEntry[]): void {
  const seen = new Set<string>();
  for (const v of viewers) {
    if (seen.has(v.id)) throw new Error(`Duplicate viewer id: ${v.id}`);
    seen.add(v.id);
  }
}

/**
 * Applies ?try=<id>,<id>: experimental viewers are dropped unless listed, and
 * listed ones jump ahead of the stable viewers for the same files.
 */
export function withTrials(viewers: ViewerEntry[], search: string): ViewerEntry[] {
  const tried = new Set((new URLSearchParams(search).get('try') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  return viewers
    .filter((v) => !v.experimental || tried.has(v.id))
    .map((v) => (v.experimental ? { ...v, priority: (v.priority ?? 50) + 100 } : v));
}
