/** Starts the CAD worker (website only: the portable file never loads this module). */
export function startCadWorker(): Worker {
  return new Worker(new URL('./cad-worker.ts', import.meta.url), { type: 'module' });
}
