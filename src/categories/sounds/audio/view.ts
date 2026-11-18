/**
 * Sound player: the browser plays the file (MP3, AAC/M4A, WAV, FLAC, OGG/Opus,
 * WebM audio; AIFF in Safari). Shows cover art and tags (music-metadata, loaded
 * on demand), a waveform you can click to jump, speed, and keyboard control.
 */
import './audio.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';

const s = strings({
  play: { en: 'Play (space)', zh: '播放（空格）' },
  pause: { en: 'Pause (space)', zh: '暂停（空格）' },
  speed: { en: 'Speed', zh: '速度' },
  details: { en: 'Details', zh: '详情' },
  cannot: {
    en: 'This browser can’t play this audio{codec}. Its details are shown below.',
    zh: '这个浏览器无法播放此音频{codec}。下面显示它的详细信息。',
  },
  midi: { en: 'MIDI files are notes for a synthesizer, not recorded sound; playing them is not supported yet.', zh: 'MIDI 文件是给合成器的音符，不是录音；暂不支持播放。' },
  duration: { en: 'Duration', zh: '时长' },
  format: { en: 'Format', zh: '格式' },
  bitrate: { en: 'Bitrate', zh: '码率' },
  sampleRate: { en: 'Sample rate', zh: '采样率' },
  channels: { en: 'Channels', zh: '声道' },
  title: { en: 'Title', zh: '标题' },
  artist: { en: 'Artist', zh: '艺术家' },
  album: { en: 'Album', zh: '专辑' },
  year: { en: 'Year', zh: '年份' },
  genre: { en: 'Genre', zh: '流派' },
  track: { en: 'Track', zh: '曲目' },
  lossless: { en: 'lossless', zh: '无损' },
  mono: { en: 'mono', zh: '单声道' },
  stereo: { en: 'stereo', zh: '立体声' },
});

const time = (t: number) => {
  if (!Number.isFinite(t)) return '–:––';
  t = Math.round(t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = Math.floor(t % 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
};

interface Meta {
  common: { title?: string; artist?: string; album?: string; year?: number; genre?: string[]; track?: { no: number | null }; picture?: Array<{ data: Uint8Array; format: string }> };
  format: { container?: string; codec?: string; duration?: number; bitrate?: number; sampleRate?: number; numberOfChannels?: number; lossless?: boolean };
}

async function readMeta(file: File): Promise<Meta | null> {
  try {
    const { parseBlob } = await import('music-metadata');
    return (await parseBlob(file, { duration: false })) as unknown as Meta;
  } catch {
    return null;
  }
}

/** Peak (max |sample|) per column, from the decoded audio. Skipped for very long recordings. */
async function peaks(data: ArrayBuffer, columns: number): Promise<Float32Array | null> {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(data);
    void ctx.close();
    const out = new Float32Array(columns);
    const per = Math.max(1, Math.floor(audio.length / columns));
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let col = 0; col < columns; col++) {
        let max = 0;
        const end = Math.min(ch.length, (col + 1) * per);
        for (let i = col * per; i < end; i += 4) {
          const v = Math.abs(ch[i]);
          if (v > max) max = v;
        }
        if (max > out[col]) out[col] = max;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * AIFF (Mac) plays only in Safari, but it is plain PCM: rewrap it as WAV so every
 * browser can play it. Uncompressed AIFF and AIFF-C 'NONE' / 'sowt' / 'fl32'.
 */
export function aiffToWav(b: Uint8Array): Uint8Array | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== 'FORM' || !['AIFF', 'AIFC'].includes(tag(8))) return null;
  let channels = 0, bits = 0, rate = 0, compression = 'NONE';
  let data: Uint8Array | null = null;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = tag(o);
    const size = dv.getUint32(o + 4);
    const body = o + 8;
    if (id === 'COMM') {
      channels = dv.getInt16(body);
      bits = dv.getInt16(body + 6);
      // 80-bit extended float sample rate.
      const exp = (dv.getUint16(body + 8) & 0x7fff) - 16383;
      const hi = dv.getUint32(body + 10);
      const lo = dv.getUint32(body + 14);
      rate = (hi * 2 ** 32 + lo) * 2 ** (exp - 63);
      if (tag(8) === 'AIFC') compression = tag(body + 18);
    } else if (id === 'SSND') {
      const offset = dv.getUint32(body);
      data = b.subarray(body + 8 + offset, Math.min(b.length, body + size));
    }
    o = body + size + (size & 1);
  }
  if (!data || !channels || !rate || !['NONE', 'sowt', 'fl32', 'FL32'].includes(compression)) return null;
  const float = compression.toLowerCase() === 'fl32';
  const bytes = float ? 4 : Math.ceil(bits / 8);
  const out = new Uint8Array(44 + data.length);
  const ov = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, 'RIFF'); ov.setUint32(4, 36 + data.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  ov.setUint32(16, 16, true); ov.setUint16(20, float ? 3 : 1, true); ov.setUint16(22, channels, true);
  ov.setUint32(24, Math.round(rate), true); ov.setUint32(28, Math.round(rate) * channels * bytes, true);
  ov.setUint16(32, channels * bytes, true); ov.setUint16(34, bytes * 8, true); w(36, 'data'); ov.setUint32(40, data.length, true);
  if (compression === 'sowt') out.set(data, 44); // already little-endian
  else if (bytes === 1) for (let i = 0; i < data.length; i++) out[44 + i] = (data[i] + 128) & 255; // signed → unsigned
  else for (let i = 0; i + bytes <= data.length; i += bytes) for (let k = 0; k < bytes; k++) out[44 + i + k] = data[i + bytes - 1 - k];
  return out;
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const isMidi = ctx.format?.id === 'mid';
  const meta = await readMeta(file);
  let playable: Blob = file;
  if (ctx.format?.id === 'aiff' && !document.createElement('audio').canPlayType('audio/aiff')) {
    const wav = aiffToWav(new Uint8Array(await file.arrayBuffer()));
    if (wav) playable = new Blob([wav as BlobPart], { type: 'audio/wav' });
  }
  const url = URL.createObjectURL(playable);
  const audio = h('audio', { src: url, preload: 'metadata' }) as HTMLAudioElement;
  const cover = meta?.common.picture?.[0];
  const coverUrl = cover ? URL.createObjectURL(new Blob([cover.data as BlobPart], { type: cover.format })) : '';

  const playBtn = h('button', { type: 'button', class: 'au-play', 'aria-label': s('play'), title: s('play') }, '▶');
  const timeLabel = h('span', { class: 'au-time' }, '0:00 / –:––');
  const canvas = h('canvas', { class: 'au-wave' }) as HTMLCanvasElement;
  const message = h('div', { class: 'au-message', hidden: true });
  const details = h('dl', { class: 'au-details' });

  const c = meta?.common;
  const title = c?.title || file.name.replace(/\.[^.]+$/, '');
  const subtitle = [c?.artist, c?.album].filter(Boolean).join(' — ');
  ctx.mount.replaceChildren(
    h(
      'div',
      { class: 'view view-audio' },
      h(
        'div',
        { class: 'au-head' },
        coverUrl ? h('img', { class: 'au-cover', src: coverUrl, alt: '' }) : h('div', { class: 'au-cover au-cover-blank', 'aria-hidden': 'true' }, '♪'),
        h('div', { class: 'au-titles' }, h('div', { class: 'au-title' }, title), subtitle ? h('div', { class: 'au-sub' }, subtitle) : null),
      ),
      h('div', { class: 'au-player' }, playBtn, h('div', { class: 'au-track' }, canvas), timeLabel),
      message,
      details,
      audio,
    ),
  );

  // ---- details
  const f = meta?.format;
  const rows: Array<[string, string]> = [];
  const add = (k: string, v?: string | number | false | null) => v && rows.push([k, String(v)]);
  add(s('title'), c?.title);
  add(s('artist'), c?.artist);
  add(s('album'), c?.album);
  add(s('year'), c?.year);
  add(s('genre'), c?.genre?.join(', '));
  add(s('track'), c?.track?.no);
  add(s('format'), [...new Set([f?.container, f?.codec].filter(Boolean))].concat(f?.lossless ? [s('lossless')] : []).join(' · '));
  add(s('bitrate'), f?.bitrate ? `${Math.round(f.bitrate / 1000)} kbps` : '');
  add(s('sampleRate'), f?.sampleRate ? `${(f.sampleRate / 1000).toFixed(1)} kHz` : '');
  add(s('channels'), f?.numberOfChannels ? (f.numberOfChannels === 1 ? s('mono') : f.numberOfChannels === 2 ? s('stereo') : String(f.numberOfChannels)) : '');
  const fillDetails = () => {
    const dur = Number.isFinite(audio.duration) ? audio.duration : f?.duration;
    const all = dur ? [[s('duration'), time(dur)] as [string, string], ...rows] : rows;
    details.replaceChildren(...all.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  };
  fillDetails();

  // ---- waveform
  let wave: Float32Array | null = null;
  const draw = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const g = canvas.getContext('2d')!;
    const css = getComputedStyle(canvas);
    const played = css.getPropertyValue('--au-played').trim() || '#2f5bea';
    const rest = css.getPropertyValue('--au-rest').trim() || '#c9cdd6';
    const progress = audio.duration ? audio.currentTime / audio.duration : 0;
    const w = canvas.width;
    const hgt = canvas.height;
    g.clearRect(0, 0, w, hgt);
    if (!wave) {
      // No waveform (very long, or undecodable): a plain progress bar.
      g.fillStyle = rest;
      g.fillRect(0, hgt / 2 - 2 * dpr, w, 4 * dpr);
      g.fillStyle = played;
      g.fillRect(0, hgt / 2 - 2 * dpr, w * progress, 4 * dpr);
      return;
    }
    const bar = 3 * dpr;
    const n = Math.floor(w / bar);
    for (let i = 0; i < n; i++) {
      const v = wave[Math.floor((i / n) * wave.length)] ?? 0;
      const bh = Math.max(2 * dpr, v * hgt * 0.95);
      g.fillStyle = i / n < progress ? played : rest;
      g.fillRect(i * bar, (hgt - bh) / 2, bar - dpr, bh);
    }
  };
  const ro = new ResizeObserver(draw);
  ro.observe(canvas);
  // Waveform for recordings up to ~40 minutes / 150 MB (decoding needs the whole sound in memory).
  if (!isMidi && file.size < 150 * 1024 * 1024) {
    void playable.arrayBuffer().then(async (buf) => {
      const est = meta?.format.duration ?? 0;
      if (est > 40 * 60) return;
      wave = await peaks(buf, 1600);
      draw();
    });
  }

  // ---- playback
  const sync = () => {
    playBtn.textContent = audio.paused ? '▶' : '❚❚';
    playBtn.setAttribute('aria-label', audio.paused ? s('play') : s('pause'));
    playBtn.title = audio.paused ? s('play') : s('pause');
    timeLabel.textContent = `${time(audio.currentTime)} / ${time(audio.duration)}`;
    draw();
  };
  const toggle = () => (audio.paused ? audio.play().catch(() => {}) : audio.pause());
  playBtn.addEventListener('click', toggle);
  for (const ev of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended', 'ratechange']) audio.addEventListener(ev, sync);
  audio.addEventListener('loadedmetadata', fillDetails);
  const seekTo = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (audio.duration) audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    seekTo(e);
  });
  canvas.addEventListener('pointermove', (e) => e.buttons && seekTo(e));
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) return;
    if (e.key === ' ') toggle();
    else if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  const showCannot = () => {
    message.hidden = false;
    message.textContent = isMidi ? s('midi') : s('cannot').replace('{codec}', f?.codec ? ` (${f.codec})` : '');
    playBtn.disabled = true;
  };
  audio.addEventListener('error', showCannot);
  if (isMidi) showCannot();

  // Speed
  const speeds = [0.75, 1, 1.25, 1.5, 2];
  const speedGroup = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': s('speed') },
    ...speeds.map((v) => h('button', { type: 'button', class: v === 1 ? 'active' : '', onclick: (e: Event) => { audio.playbackRate = v; for (const b of speedGroup.children) b.classList.toggle('active', b === e.currentTarget); } }, `${v}×`)),
  );

  return {
    meta: () => [f?.codec ?? (ctx.format?.name ?? 'Audio'), ...(Number.isFinite(audio.duration) ? [time(audio.duration)] : f?.duration ? [time(f.duration)] : []), ...(f?.bitrate ? [`${Math.round(f.bitrate / 1000)} kbps`] : [])],
    tools: () => [speedGroup],
    destroy: () => {
      audio.pause();
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      URL.revokeObjectURL(url);
      if (coverUrl) URL.revokeObjectURL(coverUrl);
    },
  };
}
