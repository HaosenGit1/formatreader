/** Starts the DWG worker (website only: the portable file never loads this module). */
export function startDwgWorker(): Worker {
  return new Worker(new URL('./dwg-worker.ts', import.meta.url), { type: 'module' });
}
