/** Starts the drawing worker (website only: the portable file never loads this module). */
export function startDrawingWorker(): Worker {
  return new Worker(new URL('./drawing-worker.ts', import.meta.url), { type: 'module' });
}
