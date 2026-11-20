/**
 * Every "how big is too big" in one place. Change a number here and the whole site follows.
 *
 * Each value is given per device tier (see device.ts):
 *   low  = phones and devices with ≤ 2 GB memory
 *   mid  = tablets, big Android phones, computers with ≤ 4 GB memory
 *   high = computers
 * Sizes are in bytes (MB = 1024 × 1024).
 */
import { device, type Tier } from './device';

const MB = 1024 * 1024;
type PerTier<T> = Record<Tier, T>;

export const LIMITS = {
  /** Files up to this size always open the normal way, as before (fast path). */
  small: { low: 5 * MB, mid: 5 * MB, high: 5 * MB },

  /** Text, logs, CSV, JSON, code: above this size the start is shown first, at once. */
  textPreview: { low: 4 * MB, mid: 16 * MB, high: 64 * MB },
  /** …and how much of it is read for that first view. */
  textPreviewPart: { low: 2 * MB, mid: 8 * MB, high: 32 * MB },
  /** The most text read even when "Load the whole file" is pressed (browsers cap one text at ~500 M characters). */
  textMax: { low: 64 * MB, mid: 128 * MB, high: 256 * MB },

  /** Editing is offered up to this size. */
  edit: { low: 5 * MB, mid: 10 * MB, high: 20 * MB },
  /** Syntax colours for code up to this size (bigger code is shown plain, faster). */
  highlight: { low: 150 * 1024, mid: 300 * 1024, high: 400 * 1024 },

  /** Excel workbooks above this size: only the first rows of each sheet are read at first. */
  sheetPreview: { low: 10 * MB, mid: 30 * MB, high: Infinity },
  /** …how many rows that is. */
  sheetPreviewRows: { low: 5000, mid: 20000, high: 0 },

  /** Parquet tables: rows read at first, and each time "Load more" is pressed. */
  parquetRows: { low: 2000, mid: 10000, high: 50000 },

  /** Files up to this size stay open in a background tab; bigger ones are closed and reopened when their tab is chosen again. */
  keepTab: { low: 2 * MB, mid: 25 * MB, high: 150 * MB },

  /** Each viewer names the size where its files get heavy (on a computer); scaled per tier. */
  heavyScale: { low: 0.25, mid: 0.5, high: 1 },
} satisfies Record<string, PerTier<number>>;

export type LimitName = keyof typeof LIMITS;

/** The value of one limit for this device. */
export function limit(name: LimitName): number {
  return LIMITS[name][device().tier];
}
