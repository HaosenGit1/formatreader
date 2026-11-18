/** Starts the spreadsheet worker (website only: the portable file never loads this module). */
export function startSheetWorker(): Worker {
  return new Worker(new URL('./sheet-worker.ts', import.meta.url), { type: 'module' });
}
