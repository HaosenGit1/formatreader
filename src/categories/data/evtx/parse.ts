/**
 * Windows event logs (.evtx): Event Viewer's files (System, Application, Security, and the
 * logs of HMI / SCADA servers). Each record is "binary XML" built from templates shared
 * within a 64 KB chunk; this expands them back into elements, then picks out the usual
 * columns (time, level, event ID, source, computer) and the event's data.
 */
export interface XEl {
  name: string;
  attrs: Array<[string, string]>;
  children: Array<XEl | string>;
}

export interface EventRecord {
  id: number;
  time: Date | null;
  level: number; // 1 critical, 2 error, 3 warning, 4 information, 5 verbose (0 → information)
  eventId: number;
  provider: string;
  computer: string;
  channel: string;
  data: Array<[string, string]>; // EventData / UserData values
  xml: XEl | null;
}

export interface EventLog {
  records: EventRecord[];
  truncated: boolean;
  damagedChunks: number;
}

type Sub = { sub: number; opt: boolean };
type TNode = TEl | string | Sub;
interface TEl {
  name: string;
  attrs: Array<[string, TNode[]]>;
  children: TNode[];
}

const MAX_RECORDS = 300_000;
const FILETIME_EPOCH = 11644473600000; // ms between 1601 and 1970

export const isEvtx = (b: Uint8Array) => b.length >= 8 && String.fromCharCode(...b.subarray(0, 7)) === 'ElfFile';

function filetime(v: DataView, o: number): Date | null {
  const t = Number(v.getBigUint64(o, true));
  if (!t) return null;
  const d = new Date(t / 10000 - FILETIME_EPOCH);
  return Number.isNaN(+d) ? null : d;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

class Chunk {
  private templates = new Map<number, TEl[]>();
  private utf16 = new TextDecoder('utf-16le');
  private b: Uint8Array;
  private v: DataView;
  private base: number;
  constructor(b: Uint8Array, v: DataView, base: number) {
    this.b = b;
    this.v = v;
    this.base = base;
  }

  private u16(o: number) {
    return this.v.getUint16(o, true);
  }
  private u32(o: number) {
    return this.v.getUint32(o, true);
  }

  /** A name (element / attribute) stored at a chunk offset: [text, bytes it occupies]. */
  private name(off: number): [string, number] {
    const at = this.base + off;
    const n = this.u16(at + 6);
    return [this.utf16.decode(this.b.subarray(at + 8, at + 8 + n * 2)), 8 + n * 2 + 2];
  }

  /** Reads a name reference at `pos`, skipping the name itself when it is stored right there. */
  private nameRef(pos: number): [string, number] {
    const off = this.u32(pos);
    pos += 4;
    const [text, size] = this.name(off);
    if (off === pos - this.base) pos += size;
    return [text, pos];
  }

  /** Parses BinXML from pos to end into template nodes (substitutions left as placeholders). */
  parse(pos: number, end: number, values: Uint8Array[] | null, types: number[] | null): TNode[] {
    const root: TEl = { name: '', attrs: [], children: [] };
    const stack: TEl[] = [root];
    let target: TNode[] = root.children;
    let guard = 0;
    while (pos < end && guard++ < 1_000_000) {
      const tok = this.b[pos];
      const base = tok & 0x0f;
      const more = (tok & 0x40) !== 0;
      if (tok === 0x00) break;
      switch (base) {
        case 0x0f: // fragment header
          pos += 4;
          break;
        case 0x01: {
          pos += 1 + 2 + 4; // token, dependency id, data size
          const [name, p] = this.nameRef(pos);
          pos = p + (more ? 4 : 0);
          const el: TEl = { name, attrs: [], children: [] };
          stack[stack.length - 1].children.push(el);
          stack.push(el);
          target = el.children;
          break;
        }
        case 0x06: {
          const [name, p] = this.nameRef(pos + 1);
          pos = p;
          const vals: TNode[] = [];
          stack[stack.length - 1].attrs.push([name, vals]);
          target = vals;
          break;
        }
        case 0x02:
          pos++;
          target = stack[stack.length - 1].children;
          break;
        case 0x03:
        case 0x04:
          pos++;
          if (stack.length > 1) stack.pop();
          target = stack[stack.length - 1].children;
          break;
        case 0x05: {
          const type = this.b[pos + 1];
          pos += 2;
          if (type === 0x01) {
            const n = this.u16(pos);
            target.push(this.utf16.decode(this.b.subarray(pos + 2, pos + 2 + n * 2)));
            pos += 2 + n * 2;
          } else return root.children; // other inline value types don't occur in practice
          break;
        }
        case 0x0d:
        case 0x0e:
          target.push({ sub: this.u16(pos + 1), opt: base === 0x0e });
          pos += 4;
          break;
        case 0x07: {
          const n = this.u16(pos + 1);
          target.push(this.utf16.decode(this.b.subarray(pos + 3, pos + 3 + n * 2)));
          pos += 3 + n * 2;
          break;
        }
        case 0x08:
          target.push(String.fromCharCode(this.u16(pos + 1)));
          pos += 3;
          break;
        case 0x09: {
          const [name, p] = this.nameRef(pos + 1);
          target.push(`&${name};`);
          pos = p;
          break;
        }
        case 0x0a: {
          pos = this.nameRef(pos + 1)[1];
          break;
        }
        case 0x0b: {
          pos += 3 + this.u16(pos + 1) * 2;
          break;
        }
        case 0x0c: {
          const r = this.instance(pos);
          pos = r.pos;
          target.push(...r.nodes);
          break;
        }
        default:
          return root.children; // unknown token: stop here, keep what was read
      }
    }
    void values;
    void types;
    return root.children;
  }

  /** A template instance at pos: the template (stored here or earlier in the chunk) filled with its values. */
  private instance(pos: number): { nodes: TNode[]; pos: number } {
    const defOff = this.u32(pos + 6);
    pos += 10;
    let tpl = this.templates.get(defOff);
    const at = this.base + defOff;
    const size = this.u32(at + 20);
    if (defOff === pos - this.base) pos = at + 24 + size; // the definition is right here: skip it
    if (!tpl) {
      tpl = this.parse(at + 24, at + 24 + size, null, null) as TEl[];
      this.templates.set(defOff, tpl);
    }
    const count = this.u32(pos);
    pos += 4;
    const sizes: number[] = [];
    const types: number[] = [];
    for (let i = 0; i < count; i++) {
      sizes.push(this.u16(pos));
      types.push(this.b[pos + 2]);
      pos += 4;
    }
    const values: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      values.push(this.b.subarray(pos, pos + sizes[i]));
      pos += sizes[i];
    }
    return { nodes: tpl.map((n) => this.fill(n, values, types)).flat(), pos };
  }

  /** Replaces placeholders with their values (nested BinXML values become elements). */
  private fill(n: TNode, values: Uint8Array[], types: number[]): TNode[] {
    if (typeof n === 'string') return [n];
    if ('sub' in n) {
      const type = types[n.sub];
      const raw = values[n.sub];
      if (raw === undefined || type === 0x00 || (n.opt && !raw.length)) return [];
      if (type === 0x21) {
        const start = raw.byteOffset - this.b.byteOffset;
        return this.parse(start, start + raw.length, null, null);
      }
      return [this.value(type, raw)];
    }
    const attrs: Array<[string, TNode[]]> = [];
    for (const [k, vals] of n.attrs) {
      const filled = vals.flatMap((x) => this.fill(x, values, types));
      if (filled.length || !vals.some((x) => typeof x === 'object' && 'opt' in x && x.opt)) attrs.push([k, filled]);
    }
    return [{ name: n.name, attrs, children: n.children.flatMap((c) => this.fill(c, values, types)) }];
  }

  value(type: number, raw: Uint8Array): string {
    const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const n = raw.length;
    const need = (k: number) => n >= k;
    switch (type) {
      case 0x01:
        return this.utf16.decode(raw).replace(/\0+$/, '');
      case 0x02:
        return new TextDecoder('latin1').decode(raw).replace(/\0+$/, '');
      case 0x03: return need(1) ? String(v.getInt8(0)) : ''; // prettier-ignore
      case 0x04: return need(1) ? String(v.getUint8(0)) : ''; // prettier-ignore
      case 0x05: return need(2) ? String(v.getInt16(0, true)) : ''; // prettier-ignore
      case 0x06: return need(2) ? String(v.getUint16(0, true)) : ''; // prettier-ignore
      case 0x07: return need(4) ? String(v.getInt32(0, true)) : ''; // prettier-ignore
      case 0x08: return need(4) ? String(v.getUint32(0, true)) : ''; // prettier-ignore
      case 0x09: return need(8) ? String(v.getBigInt64(0, true)) : ''; // prettier-ignore
      case 0x0a: return need(8) ? String(v.getBigUint64(0, true)) : ''; // prettier-ignore
      case 0x0b: return need(4) ? String(v.getFloat32(0, true)) : ''; // prettier-ignore
      case 0x0c: return need(8) ? String(v.getFloat64(0, true)) : ''; // prettier-ignore
      case 0x0d: return need(4) ? (v.getUint32(0, true) ? 'true' : 'false') : need(1) ? (raw[0] ? 'true' : 'false') : ''; // prettier-ignore
      case 0x0e:
        return hex(raw);
      case 0x0f:
        if (!need(16)) return hex(raw);
        return `{${v.getUint32(0, true).toString(16).padStart(8, '0')}-${v.getUint16(4, true).toString(16).padStart(4, '0')}-${v.getUint16(6, true).toString(16).padStart(4, '0')}-${hex(raw.subarray(8, 10))}-${hex(raw.subarray(10, 16))}}`.toUpperCase();
      case 0x10:
        return n === 8 ? `0x${v.getBigUint64(0, true).toString(16).padStart(16, '0')}` : need(4) ? `0x${v.getUint32(0, true).toString(16).padStart(8, '0')}` : '';
      case 0x11: {
        const d = need(8) ? filetime(v, 0) : null;
        return d ? d.toISOString() : '';
      }
      case 0x12: {
        if (!need(16)) return '';
        const [y, mo, , d, hh, mi, ss, ms] = Array.from({ length: 8 }, (_, i) => v.getUint16(i * 2, true));
        return new Date(Date.UTC(y, mo - 1, d, hh, mi, ss, ms)).toISOString();
      }
      case 0x13: {
        if (!need(8)) return hex(raw);
        const count = raw[1];
        let auth = 0;
        for (let i = 2; i < 8; i++) auth = auth * 256 + raw[i];
        const parts = [`S-${raw[0]}-${auth}`];
        for (let i = 0; i < count && 8 + i * 4 + 4 <= n; i++) parts.push(String(v.getUint32(8 + i * 4, true)));
        return parts.join('-');
      }
      case 0x14: return need(4) ? `0x${v.getUint32(0, true).toString(16).padStart(8, '0')}` : ''; // prettier-ignore
      case 0x15: return need(8) ? `0x${v.getBigUint64(0, true).toString(16).padStart(16, '0')}` : ''; // prettier-ignore
      case 0x81:
        return this.utf16.decode(raw).split('\0').filter(Boolean).join(', ');
      default:
        if (type & 0x80) {
          const each = { 0x04: 1, 0x06: 2, 0x08: 4, 0x0a: 8, 0x14: 4, 0x15: 8 }[type & 0x7f] ?? 0;
          if (each) {
            const out: string[] = [];
            for (let i = 0; i + each <= n; i += each) out.push(this.value(type & 0x7f, raw.subarray(i, i + each)));
            return out.join(', ');
          }
        }
        return hex(raw);
    }
  }
}

function concrete(nodes: TNode[]): Array<XEl | string> {
  return nodes.filter((n): n is TEl | string => typeof n === 'string' || !('sub' in n)).map((n) => (typeof n === 'string' ? n : { name: n.name, attrs: n.attrs.map(([k, vs]) => [k, vs.filter((x) => typeof x === 'string').join('')] as [string, string]), children: concrete(n.children) }));
}

const text = (e: XEl | undefined): string => (e ? e.children.map((c) => (typeof c === 'string' ? c : text(c))).join('') : '');
const child = (e: XEl | undefined, name: string) => e?.children.find((c): c is XEl => typeof c !== 'string' && c.name === name);
const attr = (e: XEl | undefined, name: string) => e?.attrs.find(([k]) => k === name)?.[1] ?? '';

function summarize(id: number, fallback: Date | null, ev: XEl | null): EventRecord {
  const sys = child(ev ?? undefined, 'System');
  const tc = attr(child(sys, 'TimeCreated'), 'SystemTime');
  const time = tc ? new Date(tc) : fallback;
  const data: Array<[string, string]> = [];
  const ed = child(ev ?? undefined, 'EventData');
  if (ed) {
    let i = 0;
    for (const c of ed.children) if (typeof c !== 'string') data.push([attr(c, 'Name') || (c.name === 'Data' ? `${++i}` : c.name), text(c)]);
  }
  const ud = child(ev ?? undefined, 'UserData');
  const inner = ud?.children.find((c): c is XEl => typeof c !== 'string');
  if (inner) for (const c of inner.children) if (typeof c !== 'string') data.push([c.name, text(c)]);
  const provider = child(sys, 'Provider');
  return {
    id,
    time: time && !Number.isNaN(+time) ? time : fallback,
    level: Number(text(child(sys, 'Level'))) || 0,
    eventId: Number(text(child(sys, 'EventID'))) || 0,
    provider: attr(provider, 'Name') || attr(provider, 'EventSourceName'),
    computer: text(child(sys, 'Computer')),
    channel: text(child(sys, 'Channel')),
    data,
    xml: ev,
  };
}

export async function parseEvtx(buf: ArrayBuffer, progress?: (f: number) => void): Promise<EventLog> {
  const b = new Uint8Array(buf);
  if (!isEvtx(b)) throw new Error('This is not a Windows event log (.evtx).');
  const v = new DataView(buf);
  const headerSize = v.getUint16(40, true) || 4096;
  const records: EventRecord[] = [];
  let damaged = 0;
  let truncated = false;
  const chunks = Math.floor((b.length - headerSize) / 65536);
  for (let c = 0; c < chunks && !truncated; c++) {
    const base = headerSize + c * 65536;
    if (String.fromCharCode(...b.subarray(base, base + 7)) !== 'ElfChnk') {
      if (b.subarray(base, base + 8).some((x) => x)) damaged++;
      continue;
    }
    const chunk = new Chunk(b, v, base);
    const free = Math.min(65536, v.getUint32(base + 48, true) || 65536);
    let pos = base + 512;
    while (pos + 24 < base + free) {
      if (v.getUint32(pos, true) !== 0x00002a2a) break;
      const size = v.getUint32(pos + 4, true);
      if (size < 28 || pos + size > base + 65536) break;
      const id = Number(v.getBigUint64(pos + 8, true));
      const when = filetime(v, pos + 16);
      let ev: XEl | null = null;
      try {
        const nodes = concrete(chunk.parse(pos + 24, pos + size - 4, null, null));
        ev = (nodes.find((n): n is XEl => typeof n !== 'string') as XEl | undefined) ?? null;
      } catch {
        damaged++;
      }
      records.push(summarize(id, when, ev));
      if (records.length >= MAX_RECORDS) {
        truncated = true;
        break;
      }
      pos += size;
    }
    if (c % 32 === 31) {
      progress?.(c / chunks);
      await new Promise((r) => setTimeout(r, 0)); // let the page breathe on big logs
    }
  }
  return { records, truncated, damagedChunks: damaged };
}

/** The record as indented XML text (for the detail pane). */
export function toXml(e: XEl, depth = 0): string {
  const pad = '  '.repeat(depth);
  const esc = (s: string) => s.replace(/&(?![a-z]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attrs = e.attrs.map(([k, v]) => ` ${k}="${esc(v).replace(/"/g, '&quot;')}"`).join('');
  if (!e.children.length) return `${pad}<${e.name}${attrs} />`;
  if (e.children.every((c) => typeof c === 'string')) return `${pad}<${e.name}${attrs}>${esc(e.children.join(''))}</${e.name}>`;
  return [`${pad}<${e.name}${attrs}>`, ...e.children.map((c) => (typeof c === 'string' ? `${pad}  ${esc(c)}` : toXml(c, depth + 1))), `${pad}</${e.name}>`].join('\n');
}
