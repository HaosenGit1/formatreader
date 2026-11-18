/**
 * AVI playback without any extra download. Browsers can't play the AVI container, but most
 * AVI files from cameras, CCTV recorders and dashcams hold either
 *  - MJPEG: every frame is an ordinary JPEG picture, which the browser draws itself, or
 *  - H.264: decoded by the browser's own video decoder (WebCodecs).
 * The sound (PCM, μ-law/A-law, IMA ADPCM, MP3, AAC) is rebuilt as a stream the browser plays,
 * and the pictures follow it. DivX/Xvid and Windows Media codecs are not handled here.
 *
 * Interrupted recordings (no index at the end, wrong sizes) are read by scanning the file.
 */

export interface AviChunk {
  /** Offset of the chunk's data in the file. */
  off: number;
  size: number;
  key: boolean;
}

interface Stream {
  type: 'vids' | 'auds' | string;
  handler: string;
  scale: number;
  rate: number;
  /** BITMAPINFOHEADER compression (video) or WAVEFORMATEX format tag (audio). */
  compression: string;
  format: number;
  channels: number;
  sampleRate: number;
  bits: number;
  blockAlign: number;
  width: number;
  height: number;
  extra: Uint8Array;
  chunks: AviChunk[];
}

export interface AviInfo {
  width: number;
  height: number;
  fps: number;
  video?: Stream;
  audio?: Stream;
}

const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** Reads byte ranges through a 1 MB window, so walking chunk headers in order is cheap. */
class Reader {
  private start = 0;
  private buf = new Uint8Array(0);
  constructor(private file: Blob) {}
  get size() {
    return this.file.size;
  }
  async bytes(pos: number, len: number): Promise<Uint8Array> {
    if (pos >= this.start && pos + len <= this.start + this.buf.length) return this.buf.subarray(pos - this.start, pos - this.start + len);
    this.start = pos;
    this.buf = new Uint8Array(await this.file.slice(pos, Math.min(this.file.size, pos + Math.max(len, 1 << 20))).arrayBuffer());
    return this.buf.subarray(0, Math.min(len, this.buf.length));
  }
}

const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const i32 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);

function parseHeaders(hdrl: Uint8Array): Stream[] {
  const streams: Stream[] = [];
  const walk = (b: Uint8Array, start: number, end: number) => {
    let p = start;
    while (p + 8 <= end) {
      const id = fourcc(b, p);
      const size = u32(b, p + 4);
      const body = p + 8;
      if (id === 'LIST') {
        const kind = fourcc(b, body);
        if (kind === 'strl') {
          streams.push({ type: '', handler: '', scale: 1, rate: 0, compression: '', format: 0, channels: 0, sampleRate: 0, bits: 0, blockAlign: 0, width: 0, height: 0, extra: new Uint8Array(0), chunks: [] });
        }
        walk(b, body + 4, Math.min(end, body + size));
      } else if (id === 'strh' && streams.length) {
        const s = streams[streams.length - 1];
        s.type = fourcc(b, body);
        s.handler = fourcc(b, body + 4).replace(/\0/g, '');
        s.scale = u32(b, body + 20) || 1;
        s.rate = u32(b, body + 24);
      } else if (id === 'strf' && streams.length) {
        const s = streams[streams.length - 1];
        if (s.type === 'vids' && size >= 40) {
          s.width = i32(b, body + 4);
          s.height = Math.abs(i32(b, body + 8));
          s.compression = fourcc(b, body + 16).replace(/\0/g, '');
          s.extra = b.slice(body + 40, body + size);
        } else if (s.type === 'auds' && size >= 14) {
          s.format = u16(b, body);
          s.channels = u16(b, body + 2);
          s.sampleRate = u32(b, body + 4);
          s.blockAlign = u16(b, body + 12);
          s.bits = size >= 16 ? u16(b, body + 14) : 0;
          s.extra = size > 18 ? b.slice(body + 18, body + size) : new Uint8Array(0);
        }
      }
      p = body + size + (size & 1);
    }
  };
  walk(hdrl, 0, hdrl.length);
  return streams;
}

/** Is an H.264 access unit (Annex B) a keyframe? (IDR slice or parameter sets) */
function h264Key(b: Uint8Array): boolean {
  for (let i = 0; i + 3 < b.length; i++) {
    if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) {
      const t = b[i + 3] & 0x1f;
      if (t === 5 || t === 7) return true;
      if (t === 1) return false;
    }
  }
  return false;
}

export async function parseAvi(file: Blob): Promise<AviInfo> {
  const r = new Reader(file);
  const head = await r.bytes(0, 12);
  if (fourcc(head, 0) !== 'RIFF' || fourcc(head, 8) !== 'AVI ') throw new Error('not an AVI file');

  // Top level: RIFF 'AVI ' (hdrl, movi, idx1), then OpenDML 'AVIX' parts with more movi lists.
  let streams: Stream[] = [];
  const movis: Array<[number, number]> = [];
  let idx1: [number, number] | null = null;
  let riff = 0;
  while (riff + 12 <= r.size) {
    const h = await r.bytes(riff, 12);
    if (fourcc(h, 0) !== 'RIFF') break;
    const riffSize = u32(h, 4);
    const riffEnd = riffSize ? Math.min(r.size, riff + 8 + riffSize) : r.size;
    let p = riff + 12;
    while (p + 8 <= riffEnd) {
      const c = await r.bytes(p, 12);
      const id = fourcc(c, 0);
      let size = u32(c, 4);
      if (id === 'LIST' && fourcc(c, 8) === 'movi') {
        // A recording cut short has a wrong (often zero) size: read to the end of the file.
        const end = size && p + 8 + size <= r.size ? p + 8 + size : r.size;
        movis.push([p + 8, end]);
        size = end - p - 8;
      } else if (id === 'LIST' && fourcc(c, 8) === 'hdrl') {
        streams = parseHeaders(new Uint8Array(await file.slice(p + 12, p + 8 + size).arrayBuffer()));
      } else if (id === 'idx1') {
        idx1 = [p + 8, Math.min(r.size, p + 8 + size)];
      }
      if (!size && id !== 'JUNK') break;
      p += 8 + size + (size & 1);
    }
    riff = riffEnd + (riffEnd & 1);
    if (riffEnd >= r.size) break;
  }

  const videoN = streams.findIndex((s) => s.type === 'vids');
  const audioN = streams.findIndex((s) => s.type === 'auds');
  const video = streams[videoN];
  const audio = streams[audioN];
  const isH264 = video && /^(h264|x264|avc1|davc|vssh|uh264)$/i.test(video.compression || video.handler);

  const add = (n: number, off: number, size: number, key: boolean) => {
    if (n === videoN && video) video.chunks.push({ off, size, key });
    else if (n === audioN && audio && size) audio.chunks.push({ off, size, key: true });
  };
  const streamOf = (id: string) => (/^\d\d/.test(id) ? Number(id.slice(0, 2)) : -1);

  if (idx1 && movis.length === 1) {
    const ix = new Uint8Array(await file.slice(idx1[0], idx1[1]).arrayBuffer());
    // Offsets count from the 'movi' word, or (some writers) from the start of the file.
    const moviWord = movis[0][0];
    const firstOff = ix.length >= 16 ? u32(ix, 8) : 0;
    const base = firstOff < moviWord ? moviWord : 0;
    for (let i = 0; i + 16 <= ix.length; i += 16) {
      const id = fourcc(ix, i);
      const off = base + u32(ix, i + 8) + 8;
      add(streamOf(id), off, u32(ix, i + 12), (u32(ix, i + 4) & 0x10) !== 0);
    }
  }
  if (!video?.chunks.length) {
    // No usable index: walk the chunks (descending into 'rec ' groups).
    for (const [start, end] of movis) {
      let p = start + 4;
      while (p + 8 <= end) {
        const c = await r.bytes(p, 12);
        if (c.length < 8) break;
        const id = fourcc(c, 0);
        const size = u32(c, 4);
        if (id === 'LIST') {
          p += 12; // enter the group
          continue;
        }
        if (!/^[\w ]{4}$/.test(id) || p + 8 + size > r.size + 1) {
          // Damaged data: look for the next chunk header nearby.
          p += 2;
          continue;
        }
        const n = streamOf(id);
        let key = true;
        if (n === videoN && isH264 && size) key = h264Key(await r.bytes(p + 8, Math.min(size, 64)));
        add(n, p + 8, Math.min(size, r.size - p - 8), key);
        p += 8 + size + (size & 1);
      }
    }
  }

  const fps = video && video.rate ? video.rate / video.scale : 25;
  return { width: video?.width ?? 0, height: video?.height ?? 0, fps: fps > 0 && fps < 1000 ? fps : 25, video, audio };
}

// --- Pictures -------------------------------------------------------------------------------

/** The standard JPEG Huffman tables (ITU T.81 Annex K), left out of MJPEG frames by many cameras. */
const STD_DHT_HEX =
  '0000010501010101010100000000000000000102030405060708090a0b100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa' +
  '0100030101010101010101010000000000000102030405060708090a0b1100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9fa';
let stdDht: Uint8Array | null = null;
function dhtSegment(): Uint8Array {
  if (stdDht) return stdDht;
  const body = STD_DHT_HEX.match(/../g)!.map((x) => parseInt(x, 16));
  stdDht = new Uint8Array([0xff, 0xc4, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]);
  return stdDht;
}

/** Adds the standard Huffman tables to a JPEG frame that has none (else browsers can't decode it). */
export function withHuffmanTables(jpg: Uint8Array): Uint8Array {
  let p = 0;
  while (p < 16 && !(jpg[p] === 0xff && jpg[p + 1] === 0xd8)) p++;
  if (p >= 16) return jpg;
  p += 2;
  while (p + 4 <= jpg.length && jpg[p] === 0xff) {
    const m = jpg[p + 1];
    if (m === 0xc4) return jpg; // has its own tables
    if (m === 0xda) {
      const out = new Uint8Array(jpg.length + dhtSegment().length);
      out.set(jpg.subarray(0, p));
      out.set(dhtSegment(), p);
      out.set(jpg.subarray(p), p + dhtSegment().length);
      return out;
    }
    if (m === 0xff) {
      p++;
      continue;
    }
    p += 2 + ((jpg[p + 2] << 8) | jpg[p + 3]);
  }
  return jpg;
}

export interface Picture {
  image: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

export interface FrameSource {
  /** Picture number i (of the non-empty video chunks). */
  get(i: number): Promise<Picture>;
  close(): void;
}

class MjpegSource implements FrameSource {
  private cache = new Map<number, Promise<ImageBitmap>>();
  constructor(private file: Blob, private frames: AviChunk[]) {}
  private load(i: number) {
    let p = this.cache.get(i);
    if (!p) {
      const c = this.frames[i];
      p = this.file
        .slice(c.off, c.off + c.size)
        .arrayBuffer()
        .then((b) => createImageBitmap(new Blob([withHuffmanTables(new Uint8Array(b)) as BlobPart], { type: 'image/jpeg' })));
      this.cache.set(i, p);
      p.catch(() => this.cache.delete(i));
    }
    return p;
  }
  async get(i: number): Promise<Picture> {
    const bmp = await this.load(i);
    // Keep a few pictures around and decode the next ones ahead.
    for (const [k, v] of this.cache) if (k < i - 2 || k > i + 6) { this.cache.delete(k); v.then((b) => b.close(), () => {}); }
    for (let k = i + 1; k <= Math.min(this.frames.length - 1, i + 3); k++) void this.load(k).catch(() => {});
    return { image: bmp, width: bmp.width, height: bmp.height, release: () => {} };
  }
  close() {
    for (const v of this.cache.values()) v.then((b) => b.close(), () => {});
    this.cache.clear();
  }
}

/** avc1.PPCCLL from the stream's sequence parameter set. */
function avcCodec(b: Uint8Array): string | null {
  for (let i = 0; i + 7 < b.length; i++) {
    if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1 && (b[i + 3] & 0x1f) === 7) {
      return 'avc1.' + [b[i + 4], b[i + 5], b[i + 6]].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
  }
  return null;
}

const hasStartCode = (b: Uint8Array) => (b[0] === 0 && b[1] === 0 && (b[2] === 1 || (b[2] === 0 && b[3] === 1)));

class H264Source implements FrameSource {
  private dec: VideoDecoder | null = null;
  private ready = new Map<number, VideoFrame>();
  private fed = 0;
  private out = 0;
  private start = 0;
  private gen = 0;
  private wake: (() => void) | null = null;
  private failed: unknown = null;
  private lock: Promise<unknown> = Promise.resolve();

  private constructor(private file: Blob, private frames: AviChunk[], private config: VideoDecoderConfig, private prefix: Uint8Array | null) {}

  static async create(file: Blob, frames: AviChunk[], extra: Uint8Array): Promise<H264Source | null> {
    if (typeof VideoDecoder === 'undefined' || !frames.length) return null;
    const first = frames.find((f) => f.key) ?? frames[0];
    const sample = new Uint8Array(await file.slice(first.off, first.off + Math.min(first.size, 4096)).arrayBuffer());
    let config: VideoDecoderConfig;
    let prefix: Uint8Array | null = null;
    if (hasStartCode(sample) || !extra.length || extra[0] !== 1) {
      // Annex B (start codes), the usual case; parameter sets may sit in the header instead of the frames.
      if (extra.length && hasStartCode(extra)) prefix = extra;
      const codec = avcCodec(sample) ?? (prefix && avcCodec(prefix)) ?? 'avc1.42E01E';
      config = { codec, optimizeForLatency: true };
    } else {
      // Length-prefixed frames with an avcC description in the header.
      config = { codec: 'avc1.' + [extra[1], extra[2], extra[3]].map((x) => x.toString(16).padStart(2, '0')).join(''), description: extra, optimizeForLatency: true };
    }
    try {
      if (!(await VideoDecoder.isConfigSupported(config)).supported) return null;
    } catch {
      return null;
    }
    return new H264Source(file, frames, config, prefix);
  }

  private reset(start: number) {
    for (const f of this.ready.values()) f.close();
    this.ready.clear();
    this.dec?.close();
    const gen = ++this.gen;
    this.failed = null;
    this.dec = new VideoDecoder({
      output: (f) => {
        if (gen !== this.gen) return f.close();
        // Pictures come out in display order: number them in that order.
        this.ready.set(this.out++, f);
        this.wake?.();
      },
      error: (e) => {
        this.failed = e;
        this.wake?.();
      },
    });
    this.dec.configure(this.config);
    this.fed = start;
    this.out = start;
    this.start = start;
  }

  private verified = new Map<number, boolean>();

  /** The nearest real keyframe at or before i. The index's keyframe marks are checked against the data (some writers mark every frame). */
  private async keyBefore(i: number): Promise<number> {
    for (let j = i; j > 0; j--) {
      if (!this.frames[j].key) continue;
      let ok = this.verified.get(j);
      if (ok === undefined) {
        const c = this.frames[j];
        const head = new Uint8Array(await this.file.slice(c.off, c.off + Math.min(c.size, 512)).arrayBuffer());
        ok = h264Key(head) || (!hasStartCode(head) && this.frames[j].key); // length-prefixed: trust the index
        this.verified.set(j, ok);
      }
      if (ok) return j;
    }
    return 0;
  }

  private async feed() {
    const j = this.fed++;
    const c = this.frames[j];
    const gen = this.gen;
    let data = new Uint8Array(await this.file.slice(c.off, c.off + c.size).arrayBuffer());
    if (gen !== this.gen || !this.dec) return;
    const first = j === this.start;
    if (this.prefix && (c.key || first) && !avcCodec(data.subarray(0, 256))) {
      const joined = new Uint8Array(this.prefix.length + data.length);
      joined.set(this.prefix);
      joined.set(data, this.prefix.length);
      data = joined;
    }
    const key = first || (c.key && h264Key(data.subarray(0, 512)));
    this.dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: j * 1000, data }));
  }

  private waitOutput() {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => ((this.wake = null), resolve()), 30);
      this.wake = () => {
        clearTimeout(t);
        this.wake = null;
        resolve();
      };
    });
  }

  private async fill(i: number) {
    if (!this.dec || this.dec.state !== 'configured') this.reset(await this.keyBefore(i));
    else if (this.ready.has(i)) return i;
    else if (i < this.out) this.reset(await this.keyBefore(i)); // going back: start again from a keyframe
    else if (i > this.fed + 30) {
      const k = await this.keyBefore(i);
      if (k > this.fed) this.reset(k); // far ahead: jump to the keyframe
    }
    while (!this.ready.has(i)) {
      if (this.failed) throw this.failed;
      if (this.fed < this.frames.length && this.dec!.decodeQueueSize < 4 && this.fed - this.out < 16) await this.feed();
      else if (this.fed >= this.frames.length) {
        await this.dec!.flush().catch(() => {});
        this.fed = Infinity; // a flushed decoder needs a keyframe: any later request starts again
        if (!this.ready.has(i)) {
          // The decoder gave fewer pictures than chunks: use the last one it gave.
          const last = Math.max(-1, ...this.ready.keys());
          if (last < 0) throw new Error('no picture');
          return last;
        }
      } else await this.waitOutput();
    }
    return i;
  }

  get(i: number): Promise<Picture> {
    const run = this.lock.then(async () => {
      const k = await this.fill(i);
      for (const [n, f] of this.ready) if (n < k) { f.close(); this.ready.delete(n); }
      const f = this.ready.get(k)!;
      this.ready.delete(k);
      // Keep decoding a little ahead while the picture is shown.
      while (this.fed < this.frames.length && this.fed - this.out < 6 && this.dec!.decodeQueueSize < 4) await this.feed();
      return { image: f as CanvasImageSource, width: f.displayWidth, height: f.displayHeight, release: () => f.close() };
    });
    this.lock = run.catch(() => {});
    return run;
  }

  close() {
    this.gen++;
    for (const f of this.ready.values()) f.close();
    this.ready.clear();
    if (this.dec && this.dec.state !== 'closed') this.dec.close();
  }
}

export function videoCodecName(s: Stream | undefined): string {
  const c = (s?.compression || s?.handler || '').toLowerCase();
  if (/^(mjpg|avrn|ljpg|jpgl|dmb1|mjpa|jpeg)$/.test(c)) return 'MJPEG';
  if (/^(h264|x264|avc1|davc|vssh|uh264)$/.test(c)) return 'H.264';
  if (/^(hevc|h265|x265|hvc1)$/.test(c)) return 'HEVC (H.265)';
  if (/^(xvid|divx|dx50|div3|div4|fmp4|mp4v|mp42|mp43|3iv2)$/.test(c)) return 'MPEG-4 (DivX/Xvid)';
  if (/^(wmv\d|wvc1)$/.test(c)) return 'Windows Media Video';
  if (/^(mpg2|mpeg|mpg1)$/.test(c)) return 'MPEG';
  if (/^(dvsd|dv25|dv50|cdvc)$/.test(c)) return 'DV';
  if (c === '' || c === 'dib' || c === 'raw' || c === 'rgb') return 'Uncompressed';
  return c.toUpperCase();
}

export async function frameSource(file: Blob, info: AviInfo, frames: AviChunk[]): Promise<FrameSource | null> {
  const name = videoCodecName(info.video);
  if (name === 'MJPEG') return new MjpegSource(file, frames);
  if (name === 'H.264') return H264Source.create(file, frames, info.video!.extra);
  return null;
}

// --- Sound ----------------------------------------------------------------------------------

function wavHeader(dataBytes: number, channels: number, rate: number, bits: number, format = 1): Uint8Array {
  const b = new Uint8Array(44);
  const v = new DataView(b.buffer);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => (b[o + i] = ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, format, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, (rate * channels * bits) / 8, true);
  v.setUint16(32, (channels * bits) / 8, true);
  v.setUint16(34, bits, true);
  w(36, 'data');
  v.setUint32(40, dataBytes, true);
  return b;
}

function mulaw(u: number) {
  u = ~u & 0xff;
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
  return u & 0x80 ? 0x84 - t : t - 0x84;
}
function alaw(a: number) {
  a ^= 0x55;
  let t = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) t += 8;
  else if (seg === 1) t += 0x108;
  else t = (t + 0x108) << (seg - 1);
  return a & 0x80 ? t : -t;
}

const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];

/** IMA ADPCM (WAV format 0x11) blocks → 16-bit samples, interleaved. */
export function decodeImaAdpcm(data: Uint8Array, channels: number, blockAlign: number): Int16Array {
  const perBlock = ((blockAlign / channels - 4) * 2) + 1;
  const blocks = Math.floor(data.length / blockAlign);
  const out = new Int16Array(blocks * perBlock * channels);
  let o = 0;
  for (let k = 0; k < blocks; k++) {
    const base = k * blockAlign;
    const pred: number[] = [];
    const index: number[] = [];
    for (let c = 0; c < channels; c++) {
      pred[c] = (data[base + c * 4] | (data[base + c * 4 + 1] << 8)) << 16 >> 16;
      index[c] = Math.min(88, data[base + c * 4 + 2]);
      out[o + c] = pred[c];
    }
    const step = (c: number, code: number) => {
      const st = IMA_STEP[index[c]];
      let d = st >> 3;
      if (code & 4) d += st;
      if (code & 2) d += st >> 1;
      if (code & 1) d += st >> 2;
      pred[c] = Math.max(-32768, Math.min(32767, code & 8 ? pred[c] - d : pred[c] + d));
      index[c] = Math.max(0, Math.min(88, index[c] + IMA_INDEX[code & 7]));
      return pred[c];
    };
    // After the headers: groups of 4 bytes (8 samples) per channel, channels taking turns.
    let p = base + 4 * channels;
    let n = 1;
    while (n < perBlock && p < base + blockAlign) {
      for (let c = 0; c < channels; c++) {
        for (let b = 0; b < 4; b++) {
          const byte = data[p++];
          out[o + (n + b * 2) * channels + c] = step(c, byte & 0x0f);
          out[o + (n + b * 2 + 1) * channels + c] = step(c, byte >> 4);
        }
      }
      n += 8;
    }
    o += perBlock * channels;
  }
  return out;
}

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** The sound track as something the browser's audio player can play, or null. */
export async function soundTrack(file: Blob, a: Stream | undefined): Promise<Blob | null> {
  if (!a?.chunks.length) return null;
  const parts = a.chunks.map((c) => file.slice(c.off, c.off + c.size));
  const total = a.chunks.reduce((n, c) => n + c.size, 0);
  const ch = a.channels || 1;
  if (a.format === 1 && (a.bits === 8 || a.bits === 16 || a.bits === 24)) {
    // PCM: the file's own bytes, behind a WAV header (nothing is copied into memory).
    return new Blob([wavHeader(total, ch, a.sampleRate, a.bits) as BlobPart, ...parts], { type: 'audio/wav' });
  }
  if (a.format === 0x55 || a.format === 0x50) return new Blob(parts, { type: 'audio/mpeg' });
  if (a.format === 6 || a.format === 7 || a.format === 0x11) {
    const data = new Uint8Array(await new Blob(parts).arrayBuffer());
    let pcm: Int16Array;
    if (a.format === 0x11) pcm = decodeImaAdpcm(data, ch, a.blockAlign || 256 * ch);
    else {
      pcm = new Int16Array(data.length);
      const f = a.format === 7 ? mulaw : alaw;
      for (let i = 0; i < data.length; i++) pcm[i] = f(data[i]);
    }
    return new Blob([wavHeader(pcm.byteLength, ch, a.sampleRate, 16) as BlobPart, pcm as BlobPart], { type: 'audio/wav' });
  }
  if (a.format === 0xff || a.format === 0x1610) {
    // Raw AAC frames: give each an ADTS header so the browser can play them as an .aac stream.
    let profile = 1;
    let rateIdx = AAC_RATES.indexOf(a.sampleRate);
    let chans = ch;
    if (a.extra.length >= 2 && a.format === 0xff) {
      profile = (a.extra[0] >> 3) - 1;
      rateIdx = ((a.extra[0] & 7) << 1) | (a.extra[1] >> 7);
      chans = (a.extra[1] >> 3) & 0x0f;
    }
    if (a.format === 0x1610) return new Blob(parts, { type: 'audio/aac' }); // already ADTS
    if (rateIdx < 0) return null;
    const out: BlobPart[] = [];
    for (const [i, c] of a.chunks.entries()) {
      const len = c.size + 7;
      out.push(new Uint8Array([0xff, 0xf1, ((profile & 3) << 6) | (rateIdx << 2) | (chans >> 2), ((chans & 3) << 6) | (len >> 11), (len >> 3) & 0xff, ((len & 7) << 5) | 0x1f, 0xfc]), parts[i]);
    }
    return new Blob(out, { type: 'audio/aac' });
  }
  return null;
}
