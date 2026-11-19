/** Standard MIDI files (.mid, .midi, .kar): tracks, notes with times in seconds, tempo map. */
export interface Note {
  start: number; // seconds
  end: number;
  pitch: number; // 0–127
  velocity: number;
  channel: number;
  track: number;
}

export interface Track {
  name: string;
  program: number | null; // General MIDI instrument (0–127), first one set
  channels: Set<number>;
  notes: number;
}

export interface Song {
  format: number;
  tracks: Track[];
  notes: Note[];
  duration: number;
  bpm: number | null;
  timeSignature: string | null;
  texts: string[]; // copyright, lyrics, markers (first few)
}

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

export function parseMidi(b: Uint8Array): Song {
  if (ascii(b, 0, 4) !== 'MThd') throw new Error('This is not a MIDI file.');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const hlen = v.getUint32(4);
  const format = v.getUint16(8);
  const ntrks = v.getUint16(10);
  const division = v.getUint16(12);
  const smpte = (division & 0x8000) !== 0;
  const ticksPerSecondSmpte = smpte ? (256 - (division >> 8)) * (division & 0xff) : 0;

  // 1. Raw events per track with absolute ticks.
  interface Ev { tick: number; track: number; type: number; a: number; b: number; meta?: number; data?: Uint8Array }
  const events: Ev[] = [];
  const tracks: Track[] = [];
  let o = 8 + hlen;
  for (let t = 0; t < ntrks && o + 8 <= b.length; t++) {
    const id = ascii(b, o, 4);
    const len = v.getUint32(o + 4);
    const end = Math.min(b.length, o + 8 + len);
    o += 8;
    if (id !== 'MTrk') {
      o = end;
      t--;
      continue;
    }
    tracks.push({ name: '', program: null, channels: new Set(), notes: 0 });
    let tick = 0;
    let status = 0;
    const vlq = () => {
      let x = 0;
      for (let i = 0; i < 4 && o < end; i++) {
        const c = b[o++];
        x = (x << 7) | (c & 0x7f);
        if (!(c & 0x80)) break;
      }
      return x;
    };
    while (o < end) {
      tick += vlq();
      let s = b[o];
      if (s & 0x80) o++;
      else s = status; // running status
      if (s === 0xff) {
        const meta = b[o++];
        const l = vlq();
        events.push({ tick, track: t, type: 0xff, a: 0, b: 0, meta, data: b.subarray(o, o + l) });
        o += l;
      } else if (s === 0xf0 || s === 0xf7) {
        o += vlq();
      } else {
        status = s;
        const kind = s & 0xf0;
        const a = b[o++];
        const two = kind !== 0xc0 && kind !== 0xd0;
        const c = two ? b[o++] : 0;
        events.push({ tick, track: t, type: s, a, b: c });
      }
    }
    o = end;
  }
  events.sort((x, y) => x.tick - y.tick);

  // 2. Ticks → seconds with the tempo map; pair note-ons with note-offs.
  let usPerQuarter = 500000;
  let lastTick = 0;
  let seconds = 0;
  let bpm: number | null = null;
  let timeSignature: string | null = null;
  const texts: string[] = [];
  const notes: Note[] = [];
  const open = new Map<number, Note[]>();
  const time = (tick: number) => {
    seconds += smpte ? (tick - lastTick) / ticksPerSecondSmpte : ((tick - lastTick) * usPerQuarter) / 1e6 / (division || 480);
    lastTick = tick;
    return seconds;
  };
  for (const e of events) {
    const now = time(e.tick);
    if (e.type === 0xff) {
      const d = e.data!;
      if (e.meta === 0x51 && d.length >= 3) {
        usPerQuarter = (d[0] << 16) | (d[1] << 8) | d[2];
        bpm ??= Math.round(60e6 / usPerQuarter);
      } else if (e.meta === 0x58 && d.length >= 2) timeSignature ??= `${d[0]}/${2 ** d[1]}`;
      else if (e.meta === 0x03 && !tracks[e.track].name) tracks[e.track].name = new TextDecoder('latin1').decode(d).trim();
      else if ((e.meta === 0x01 || e.meta === 0x02 || e.meta === 0x06) && texts.length < 12) {
        const text = new TextDecoder().decode(d).trim();
        if (text && !texts.includes(text)) texts.push(text);
      }
      continue;
    }
    const kind = e.type & 0xf0;
    const ch = e.type & 0x0f;
    const key = (e.track << 12) | (ch << 8) | e.a;
    if (kind === 0xc0) tracks[e.track].program ??= e.a;
    if (kind === 0x90 && e.b > 0) {
      const n: Note = { start: now, end: now, pitch: e.a, velocity: e.b, channel: ch, track: e.track };
      notes.push(n);
      (open.get(key) ?? open.set(key, []).get(key)!).push(n);
      tracks[e.track].channels.add(ch);
      tracks[e.track].notes++;
    } else if (kind === 0x80 || (kind === 0x90 && e.b === 0)) {
      const n = open.get(key)?.shift();
      if (n) n.end = now;
    }
  }
  for (const n of notes) if (n.end <= n.start) n.end = n.start + 0.25;
  const duration = notes.reduce((m, n) => Math.max(m, n.end), 0);
  return { format, tracks, notes, duration, bpm, timeSignature, texts };
}

/** General MIDI instrument families (program / 8). */
export const GM_FAMILY = ['Piano', 'Chromatic percussion', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass', 'Reed', 'Pipe', 'Synth lead', 'Synth pad', 'Synth effects', 'Ethnic', 'Percussive', 'Sound effects'];
export const GM_FAMILY_ZH = ['钢琴', '色彩打击乐', '风琴', '吉他', '贝斯', '弦乐', '合奏', '铜管', '簧管', '笛', '合成主音', '合成铺底', '合成音效', '民族乐器', '打击乐', '音效'];
