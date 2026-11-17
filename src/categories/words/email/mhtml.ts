/**
 * MHTML (saved web page) → one self-contained HTML document: every resource
 * referenced by the page (stylesheets, pictures, fonts) is inlined as a data:
 * URL, using the Content-Location / Content-ID of each MIME part.
 */

interface Part {
  headers: Map<string, string>;
  body: Uint8Array;
}

/** Bytes → string with one char per byte (exact, unlike TextDecoder('latin1')). */
export const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
};
const toBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function parseHeaders(block: string): Map<string, string> {
  const map = new Map<string, string>();
  // Unfold continuation lines first.
  for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (m) map.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  return map;
}

function decodeQuotedPrintable(s: string): Uint8Array {
  const clean = s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(clean.substr(i + 1, 2))) {
      out.push(parseInt(clean.substr(i + 1, 2), 16));
      i += 2;
    } else out.push(clean.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}

function decodeBody(raw: string, encoding: string | undefined): Uint8Array {
  const enc = (encoding ?? '').toLowerCase();
  if (enc === 'base64') {
    const bin = atob(raw.replace(/[^A-Za-z0-9+/=]/g, ''));
    return toBytes(bin);
  }
  if (enc === 'quoted-printable') return decodeQuotedPrintable(raw);
  return toBytes(raw);
}

const param = (header: string | undefined, name: string) => {
  const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(header ?? '');
  return m ? m[1] ?? m[2] : undefined;
};

export function parseMhtmlParts(bytes: Uint8Array): Part[] {
  const text = latin1(bytes);
  const headerEnd = text.search(/\r?\n\r?\n/);
  const top = parseHeaders(text.slice(0, headerEnd));
  const boundary = param(top.get('content-type'), 'boundary');
  if (!boundary) {
    // Single-part MHTML: the whole body is the page.
    const body = text.slice(headerEnd).replace(/^\r?\n\r?\n/, '');
    return [{ headers: top, body: decodeBody(body, top.get('content-transfer-encoding')) }];
  }
  const parts: Part[] = [];
  for (const chunk of text.split(`--${boundary}`).slice(1)) {
    if (chunk.startsWith('--')) break;
    const idx = chunk.search(/\r?\n\r?\n/);
    if (idx < 0) continue;
    const headers = parseHeaders(chunk.slice(0, idx).replace(/^\r?\n/, ''));
    const body = chunk.slice(idx).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '');
    parts.push({ headers, body: decodeBody(body, headers.get('content-transfer-encoding')) });
  }
  return parts;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(latin1(bytes));
}

export interface MhtmlPage {
  html: string;
  title?: string;
  location?: string;
  resources: number;
}

export function mhtmlToHtml(bytes: Uint8Array): MhtmlPage {
  const parts = parseMhtmlParts(bytes);
  const htmlPart = parts.find((p) => /text\/html/i.test(p.headers.get('content-type') ?? '')) ?? parts[0];
  if (!htmlPart) throw new Error('No page found in this MHTML file');
  const charset = param(htmlPart.headers.get('content-type'), 'charset') ?? 'utf-8';
  const decodeText = (p: Part) => {
    try {
      return new TextDecoder(param(p.headers.get('content-type'), 'charset') ?? 'utf-8').decode(p.body);
    } catch {
      return new TextDecoder('utf-8').decode(p.body);
    }
  };

  // Every resource by its URL and by cid:
  const urls = new Map<string, string>();
  const others = parts.filter((p) => p !== htmlPart);
  const cssParts: Array<{ part: Part; keys: string[] }> = [];
  for (const p of others) {
    const type = (p.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim();
    const keys: string[] = [];
    const loc = p.headers.get('content-location');
    if (loc) keys.push(loc);
    const cid = p.headers.get('content-id')?.replace(/^<|>$/g, '');
    if (cid) keys.push(`cid:${cid}`);
    if (type === 'text/css') cssParts.push({ part: p, keys });
    else for (const k of keys) urls.set(k, `data:${type};base64,${bytesToBase64(p.body)}`);
  }
  const replaceUrls = (text: string) => {
    let out = text;
    for (const [key, data] of urls) out = out.split(key).join(data);
    return out;
  };
  // Stylesheets may reference pictures/fonts too: inline those first.
  for (const { part, keys } of cssParts) {
    const css = replaceUrls(decodeText(part));
    for (const k of keys) urls.set(k, `data:text/css;base64,${bytesToBase64(new TextEncoder().encode(css))}`);
  }

  let html: string;
  try {
    html = new TextDecoder(charset).decode(htmlPart.body);
  } catch {
    html = new TextDecoder('utf-8').decode(htmlPart.body);
  }
  html = replaceUrls(html);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  return { html, title, location: htmlPart.headers.get('content-location'), resources: others.length };
}
