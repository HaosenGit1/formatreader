/**
 * "Open in a new browser tab": the file goes from this tab to a new FormatReader tab inside
 * the browser (BroadcastChannel, same site only). Nothing is uploaded or saved anywhere.
 * Loaded only when used.
 */
const CHANNEL = 'formatreader-handoff';

type Payload = File[] | string;
interface Message {
  type: 'ready' | 'file';
  id: string;
  files?: File[];
  text?: string;
}

function newId(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => (b % 36).toString(36)).join('');
}

/** Opens one new browser tab (from a click) and hands it the file when it says it is ready. */
export function sendToNewTab(what: Payload): void {
  const id = newId();
  let ch: BroadcastChannel;
  try {
    ch = new BroadcastChannel(CHANNEL);
  } catch {
    return;
  }
  const done = setTimeout(() => ch.close(), 60_000);
  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type !== 'ready' || e.data.id !== id) return;
    ch.postMessage(typeof what === 'string' ? { type: 'file', id, text: what } : { type: 'file', id, files: what });
    clearTimeout(done);
    setTimeout(() => ch.close(), 1000);
  };
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('from-tab', id);
  window.open(url.href, '_blank', 'noopener');
}

/** In the new tab: ask for the file and open it when it arrives. */
export function receiveFromTab(id: string, onFiles: (files: File[]) => void, onText: (text: string) => void): void {
  let ch: BroadcastChannel;
  try {
    ch = new BroadcastChannel(CHANNEL);
  } catch {
    return;
  }
  const done = setTimeout(() => ch.close(), 15_000);
  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type !== 'file' || e.data.id !== id) return;
    clearTimeout(done);
    ch.close();
    if (Array.isArray(e.data.files) && e.data.files.every((f) => f instanceof File)) onFiles(e.data.files);
    else if (typeof e.data.text === 'string') onText(e.data.text);
  };
  ch.postMessage({ type: 'ready', id } satisfies Message);
}
