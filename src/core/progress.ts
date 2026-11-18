/**
 * Progress while a file opens: real percentages where they can be measured (reading the
 * file, building a drawing, preparing rows…), otherwise the step's name and a timer.
 */

export type Progress = (step: string, fraction?: number) => void;

/** Reads a Blob, reporting how much has been read (0…1). */
export async function readWithProgress(blob: Blob, report: (fraction: number) => void): Promise<ArrayBuffer> {
  const total = blob.size;
  if (!total || typeof blob.stream !== 'function') return Blob.prototype.arrayBuffer.call(blob);
  const out = new Uint8Array(total);
  const reader = Blob.prototype.stream.call(blob).getReader();
  let at = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, at);
    at += value.length;
    if (at - last > total / 100 || at === total) {
      last = at;
      report(at / total);
    }
  }
  return at === total ? out.buffer : out.slice(0, at).buffer;
}

/**
 * The same File, but reading it all (file.arrayBuffer()) reports progress — so every viewer
 * shows a real percentage while a big file is read, without changing each viewer.
 */
export function withReadProgress(file: File, report: (fraction: number) => void): File {
  if (file.size < 8 * 1024 * 1024) return file;
  try {
    Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: () => readWithProgress(file, report) });
  } catch {
    /* not extensible: no percentage, still works */
  }
  return file;
}

/** Lets the page paint (progress text, timer) before a long step starts. */
export const nextPaint = () => new Promise<void>((r) => setTimeout(r, 0));

/** Protocol between a viewer and its background worker. */
export type WorkerMessage<T> = { progress: [string, number | undefined] } | { ok: true; result: T } | { ok: false; error: string };

/**
 * Runs a job in a worker: progress messages are passed on, Stop (the signal) ends the
 * worker at once.
 */
export function runWorker<T>(worker: Worker, input: unknown, transfer: Transferable[], onProgress: Progress | undefined, signal?: AbortSignal, onMessage?: (msg: unknown) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      reject(new DOMException('Stopped', 'AbortError'));
    };
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    worker.onmessage = (e: MessageEvent<WorkerMessage<T>>) => {
      const m = e.data;
      if ('progress' in m) onProgress?.(m.progress[0], m.progress[1]);
      else if ('ok' in m) {
        signal?.removeEventListener('abort', stop);
        worker.terminate();
        if (m.ok) resolve(m.result);
        else reject(new Error(m.error));
      } else onMessage?.(m);
    };
    worker.onerror = (e) => {
      signal?.removeEventListener('abort', stop);
      worker.terminate();
      reject(new Error(e.message || 'The background worker could not start.'));
    };
    worker.postMessage(input, transfer);
  });
}
