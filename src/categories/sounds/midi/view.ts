/**
 * MIDI music: a piano roll of every note (one colour per track), the tracks with their
 * instruments, and playback through a small built-in synthesizer (no download needed).
 */
import './midi.css';
import { h } from '../../../core/dom';
import { lang, strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { GM_FAMILY, GM_FAMILY_ZH, parseMidi, type Note, type Song } from './parse';

const s = strings({
  play: { en: '▶ Play', zh: '▶ 播放' },
  pause: { en: '❚❚ Pause', zh: '❚❚ 暂停' },
  tracks: { en: 'tracks', zh: '个音轨' },
  notes: { en: 'notes', zh: '个音符' },
  drums: { en: 'Drums', zh: '鼓' },
  track: { en: 'Track', zh: '音轨' },
  synthNote: { en: 'Played with a simple built-in synthesizer: instruments sound approximate.', zh: '用简单的内置合成器播放：乐器音色是近似的。' },
  empty: { en: 'This MIDI file has no notes.', zh: '这个 MIDI 文件没有音符。' },
});

// Fixed, ordered categorical hues (never cycled by rank): tracks beyond 8 reuse by track number.
const HUES = ['#2a6fdb', '#e8590c', '#2b8a3e', '#ae3ec9', '#c92a2a', '#0c8599', '#e67700', '#5c7cfa'];
const colorOf = (track: number) => HUES[track % HUES.length];
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function instrument(song: Song, i: number): string {
  const t = song.tracks[i];
  if (t.channels.has(9) && t.channels.size === 1) return s('drums');
  if (t.program === null) return '';
  return (lang() === 'zh' ? GM_FAMILY_ZH : GM_FAMILY)[t.program >> 3];
}

/** A tiny synthesizer: one oscillator per note, shaped by the instrument family; drums are noise bursts. */
class Synth {
  ctx = new AudioContext();
  out = this.ctx.createDynamicsCompressor();
  noise: AudioBuffer;
  constructor() {
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    this.out.connect(g).connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  note(n: Note, at: number, program: number | null) {
    const c = this.ctx;
    const vel = (n.velocity / 127) * 0.22;
    const env = c.createGain();
    env.connect(this.out);
    if (n.channel === 9) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = n.pitch < 40 ? 120 : n.pitch < 50 ? 900 : 6000;
      env.gain.setValueAtTime(vel * 1.6, at);
      env.gain.exponentialRampToValueAtTime(0.001, at + (n.pitch < 40 ? 0.25 : 0.12));
      src.connect(f).connect(env);
      src.start(at);
      src.stop(at + 0.3);
      return;
    }
    const family = program === null ? 0 : program >> 3;
    const osc = c.createOscillator();
    osc.type = family === 9 ? 'sine' : [5, 6, 7, 8, 10, 11].includes(family) ? 'sawtooth' : family === 2 ? 'square' : 'triangle';
    osc.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = osc.type === 'triangle' || osc.type === 'sine' ? 8000 : 2200;
    const len = Math.max(0.05, n.end - n.start);
    const sustained = [2, 5, 6, 7, 8, 9, 10, 11].includes(family);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vel, at + 0.01);
    env.gain.setTargetAtTime(sustained ? vel * 0.7 : vel * 0.25, at + 0.01, sustained ? 0.1 : 0.35);
    env.gain.setTargetAtTime(0, at + len, 0.08);
    osc.connect(lp).connect(env);
    osc.start(at);
    osc.stop(at + len + 0.5);
  }
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const song = parseMidi(new Uint8Array(await file.arrayBuffer()));
  if (!song.notes.length) throw new Error(s('empty'));
  const notes = [...song.notes].sort((a, b) => a.start - b.start);
  let lo = 127;
  let hi = 0;
  for (const n of notes) (lo = Math.min(lo, n.pitch)), (hi = Math.max(hi, n.pitch));
  lo = Math.max(0, lo - 2);
  hi = Math.min(127, hi + 2);

  const canvas = h('canvas', { class: 'mi-roll' }) as HTMLCanvasElement;
  const head = h('div', { class: 'mi-head' });
  const scroller = h('div', { class: 'mi-scroll' }, canvas, head);
  const playBtn = h('button', { type: 'button', class: 'btn btn-primary mi-play' }, s('play')) as HTMLButtonElement;
  const clock = h('span', { class: 'mi-clock' }, `0:00 / ${fmt(song.duration)}`);
  const legend = h(
    'ul',
    { class: 'mi-tracks' },
    ...song.tracks
      .map((t, i) => [t, i] as const)
      .filter(([t]) => t.notes > 0)
      .map(([t, i]) => h('li', {}, h('span', { class: 'mi-swatch', style: `background:${colorOf(i)}` }), h('strong', {}, t.name || `${s('track')} ${i + 1}`), ' ', h('span', { class: 'mi-muted' }, [instrument(song, i), `${t.notes} ${s('notes')}`].filter((x) => x && x.toLowerCase() !== (t.name || '').toLowerCase()).join(' · ')))),
  );
  ctx.mount.replaceChildren(
    h('div', { class: 'view view-midi' }, h('div', { class: 'mi-bar' }, playBtn, clock), scroller, legend, ...(song.texts.length ? [h('p', { class: 'mi-texts' }, song.texts.join(' · '))] : []), h('p', { class: 'mi-muted mi-note' }, s('synthNote'))),
  );

  // Piano roll: about 80 px per second (at least the width of the view), one row per semitone.
  const PX = 80;
  const draw = () => {
    const w = Math.max(scroller.clientWidth, Math.ceil(song.duration * PX) + 20);
    const rowH = Math.max(3, Math.min(8, Math.floor(300 / (hi - lo + 1))));
    const height = (hi - lo + 1) * rowH;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    const css = getComputedStyle(scroller);
    // Recessive guides: a faint band on every C.
    g.fillStyle = css.getPropertyValue('--mi-guide') || 'rgba(127,127,127,.08)';
    for (let p = lo; p <= hi; p++) if (p % 12 === 0) g.fillRect(0, (hi - p) * rowH, w, rowH);
    const sx = (w - 20) / Math.max(song.duration, 0.001);
    for (const n of notes) {
      g.fillStyle = colorOf(n.track);
      g.globalAlpha = 0.45 + (n.velocity / 127) * 0.55;
      g.fillRect(n.start * sx, (hi - n.pitch) * rowH + 0.5, Math.max(2, (n.end - n.start) * sx - 1), rowH - 1);
    }
    g.globalAlpha = 1;
    head.style.height = `${height}px`;
    return sx;
  };
  let sx = draw();

  // Playback: notes are scheduled a little ahead of time, so the sound never stutters.
  let synth: Synth | null = null;
  let playing = false;
  let from = 0; // song time where playback (re)started
  let startedAt = 0; // audio clock at that moment
  let next = 0; // index of the next note to schedule
  let timer = 0;
  let raf = 0;
  const songTime = () => (playing && synth ? from + synth.ctx.currentTime - startedAt : from);
  const programOf = (n: Note) => song.tracks[n.track]?.program ?? null;
  const pump = () => {
    if (!synth) return;
    const until = songTime() + 0.4;
    while (next < notes.length && notes[next].start < until) {
      const n = notes[next++];
      if (n.start >= from) synth.note(n, startedAt + (n.start - from), programOf(n));
    }
    if (songTime() > song.duration + 0.5) stop(true);
  };
  const paint = () => {
    const t = songTime();
    head.style.transform = `translateX(${t * sx}px)`;
    clock.textContent = `${fmt(t)} / ${fmt(song.duration)}`;
    const x = t * sx;
    if (playing && (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 60)) scroller.scrollLeft = x - 60;
    if (playing) raf = requestAnimationFrame(paint);
  };
  const play = async () => {
    synth ??= new Synth();
    await synth.ctx.resume();
    playing = true;
    startedAt = synth.ctx.currentTime + 0.05;
    next = notes.findIndex((n) => n.start >= from);
    if (next < 0) next = notes.length;
    timer = window.setInterval(pump, 100);
    pump();
    playBtn.textContent = s('pause');
    raf = requestAnimationFrame(paint);
  };
  function stop(toStart = false) {
    if (!playing && !toStart) return;
    from = toStart ? 0 : songTime();
    playing = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    // Silence what was already scheduled.
    if (synth) {
      void synth.ctx.close();
      synth = null;
    }
    playBtn.textContent = s('play');
    paint();
  }
  playBtn.addEventListener('click', () => (playing ? stop() : void play()));
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const t = Math.max(0, Math.min(song.duration, (e.clientX - r.left) / sx));
    const was = playing;
    stop();
    from = t;
    paint();
    if (was) void play();
  });
  const ro = new ResizeObserver(() => ((sx = draw()), paint()));
  ro.observe(scroller);

  const playable = song.tracks.filter((t) => t.notes > 0).length;
  return {
    meta: () => ['MIDI', fmt(song.duration), `${playable} ${s('tracks')}`, ...(song.bpm ? [`${song.bpm} BPM`] : []), ...(song.timeSignature ? [song.timeSignature] : [])],
    onHide: () => stop(),
    destroy: () => {
      stop();
      ro.disconnect();
    },
    onLangChange: () => undefined,
  };
}
