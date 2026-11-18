/**
 * Portable build only (vite.config.ts aliases the worker hosts here): the single
 * file runs the CAD/DWG engines on the page, so the worker versions are left out
 * instead of being packed in a second time.
 */
const unavailable = (): never => {
  throw new Error('Workers are not used in the portable file.');
};
export const startDwgWorker = unavailable;
export const startCadWorker = unavailable;
