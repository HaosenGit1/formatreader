/** Reads a workbook off the page (see sheet-job.ts). */
import { readSheets } from './sheet-job';

const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);

self.onmessage = async (e: MessageEvent<{ data: ArrayBuffer; ext: string; password?: string }>) => {
  try {
    await readSheets(
      e.data.data,
      e.data.ext,
      (step, fraction) => post({ progress: [step, fraction] }),
      (sheets) => post({ sheets }),
      (chunk) => post({ chunk }, [chunk.flags.buffer]),
      e.data.password,
    );
    post({ ok: true, result: null });
  } catch (err) {
    post({ ok: false, error: String((err as Error)?.message ?? err) });
  }
};
