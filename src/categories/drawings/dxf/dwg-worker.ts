/** Runs LibreDWG off the page (see dwg-engine.ts for why). */
import { readDwg } from './dwg-engine';

self.onmessage = async (e: MessageEvent<Uint8Array>) => {
  try {
    (self as unknown as Worker).postMessage({ ok: true, db: await readDwg(e.data) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String((err as Error)?.message ?? err) });
  }
};
