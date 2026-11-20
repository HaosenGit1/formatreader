/**
 * The player for AVI files (see avi.ts): a picture drawn on a canvas, following the sound
 * when there is sound, with play/pause, a seek bar, speed and the time.
 */
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import { frameSource, parseAvi, soundTrack, videoCodecName, type FrameSource } from './avi';

const s = strings({
  play: { en: 'Play', zh: '播放' },
  pause: { en: 'Pause', zh: '暂停' },
  seek: { en: 'Position', zh: '进度' },
  speed: { en: 'Speed', zh: '速度' },
  noSound: { en: 'The sound in this file can’t be played here; the picture plays without it.', zh: '这个文件的声音无法在这里播放，画面会无声播放。' },
  broken: { en: 'Some frames of this recording are damaged and are skipped.', zh: '这段录像有部分画面损坏，已跳过。' },
});

const time = (t: number) => {
  t = Math.max(0, Math.floor(t));
  const hh = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return `${hh ? `${hh}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
};

export interface AviPlayer {
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
  tools: HTMLElement[];
  destroy(): void;
}

/** Plays the AVI in `mount`, or returns the codec name when it can't be played here. */
export async function openAviPlayer(file: File, mount: HTMLElement): Promise<AviPlayer | { unsupported: string }> {
  const info = await parseAvi(file);
  const codec = videoCodecName(info.video);
  const chunks = info.video?.chunks ?? [];
  // Empty chunks mean "same picture again": map every time slot to the last real picture.
  const frames = chunks.filter((c) => c.size > 0);
  const slotToFrame = new Int32Array(chunks.length);
  for (let i = 0, f = -1; i < chunks.length; i++) slotToFrame[i] = chunks[i].size > 0 ? ++f : Math.max(0, f);
  if (!frames.length) return { unsupported: codec };
  const source: FrameSource | null = await frameSource(file, info, frames);
  if (!source) return { unsupported: codec };

  const fps = info.fps;
  const duration = chunks.length / fps;

  const canvas = h('canvas', { class: 'vd-canvas', width: info.width || 640, height: info.height || 360 }) as HTMLCanvasElement;
  const g = canvas.getContext('2d')!;
  const playBtn = h('button', { type: 'button', class: 'vd-play', 'aria-label': s('play') }, '▶') as HTMLButtonElement;
  const seek = h('input', { type: 'range', class: 'vd-seek', min: '0', max: String(duration), step: 'any', value: '0', 'aria-label': s('seek') }) as HTMLInputElement;
  const clock = h('span', { class: 'vd-time' }, `0:00 / ${time(duration)}`);
  const note = h('p', { class: 'vd-note', hidden: true });
  const bar = h('div', { class: 'vd-bar' }, playBtn, seek, clock);
  mount.replaceChildren(h('div', { class: 'view view-video view-avi' }, h('div', { class: 'vd-stage' }, canvas), note, bar));

  // Sound: the clock follows it while it plays.
  let audio: HTMLAudioElement | null = null;
  let audioUrl = '';
  const sound = await soundTrack(file, info.audio).catch(() => null);
  if (sound) {
    audioUrl = URL.createObjectURL(sound);
    audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audio.addEventListener('error', () => {
      audio = null;
      note.hidden = false;
      note.textContent = s('noSound');
    });
  } else if (info.audio?.chunks.length) {
    note.hidden = false;
    note.textContent = s('noSound');
  }

  let playing = false;
  let rate = 1;
  let base = 0; // media time at baseNow
  let baseNow = performance.now();
  const now = () => (playing ? base + ((performance.now() - baseNow) / 1000) * rate : base);
  const setTime = (t: number) => {
    base = Math.max(0, Math.min(duration, t));
    baseNow = performance.now();
    if (audio && Number.isFinite(audio.duration)) audio.currentTime = Math.min(base, audio.duration);
  };

  let shown = -1;
  let busy = false;
  let damaged = false;
  const draw = (frame: number) => {
    if (busy || frame === shown) return;
    busy = true;
    source
      .get(frame)
      .then((p) => {
        if (canvas.width !== p.width || canvas.height !== p.height) {
          canvas.width = p.width;
          canvas.height = p.height;
        }
        g.drawImage(p.image, 0, 0, p.width, p.height);
        p.release();
        shown = frame;
      })
      .catch((e) => {
        console.warn('AVI frame', frame, e);
        // A damaged frame: skip it rather than stop.
        shown = frame;
        if (!damaged) {
          damaged = true;
          note.hidden = false;
          note.textContent = s('broken');
        }
      })
      .finally(() => (busy = false));
  };

  const frameAt = (t: number) => slotToFrame[Math.max(0, Math.min(chunks.length - 1, Math.floor(t * fps + 1e-6)))];

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    let t = now();
    if (playing && audio && !audio.paused && !audio.ended) {
      // Follow the sound if the two drift apart.
      const at = audio.currentTime;
      if (Math.abs(at - t) > 0.15) {
        base = at;
        baseNow = performance.now();
        t = at;
      }
    }
    if (t >= duration) {
      t = duration;
      if (playing) pause();
    }
    if (document.activeElement !== seek || !seeking) seek.value = String(t);
    clock.textContent = `${time(t)} / ${time(duration)}`;
    draw(frameAt(Math.min(t, duration - 1e-3)));
  };

  const play = () => {
    if (now() >= duration - 1e-3) setTime(0);
    base = now();
    baseNow = performance.now();
    playing = true;
    playBtn.textContent = '❚❚';
    playBtn.setAttribute('aria-label', s('pause'));
    if (audio) {
      audio.playbackRate = rate;
      audio.currentTime = Math.min(base, Number.isFinite(audio.duration) ? audio.duration : base);
      audio.play().catch(() => {});
    }
  };
  function pause() {
    base = now();
    playing = false;
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', s('play'));
    audio?.pause();
  }
  playBtn.addEventListener('click', () => (playing ? pause() : play()));
  canvas.addEventListener('click', () => (playing ? pause() : play()));

  let seeking = false;
  seek.addEventListener('input', () => {
    seeking = true;
    setTime(Number(seek.value));
  });
  seek.addEventListener('change', () => (seeking = false));

  const onKey = (e: KeyboardEvent) => {
    if (!seek.isConnected) return; // this file's tab is in the background
    if (e.target instanceof HTMLInputElement && e.target !== seek) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      if (playing) pause();
      else play();
    } else if (e.key === 'ArrowRight' && e.target !== seek) setTime(now() + 5);
    else if (e.key === 'ArrowLeft' && e.target !== seek) setTime(now() - 5);
  };
  document.addEventListener('keydown', onKey);

  const speeds = [0.25, 0.5, 1, 2, 4];
  const speedGroup = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': s('speed') },
    ...speeds.map((v) =>
      h('button', {
        type: 'button',
        class: v === 1 ? 'active' : '',
        onclick: (e: Event) => {
          base = now();
          baseNow = performance.now();
          rate = v;
          if (audio) audio.playbackRate = v;
          for (const b of speedGroup.children) b.classList.toggle('active', b === e.currentTarget);
        },
      }, `${v}×`),
    ),
  );

  raf = requestAnimationFrame(tick);
  // Show the first picture straight away and learn the real picture size.
  const first = await source.get(0).catch(() => null);
  if (first) {
    canvas.width = first.width;
    canvas.height = first.height;
    g.drawImage(first.image, 0, 0, first.width, first.height);
    first.release();
    shown = 0;
  }

  return {
    width: canvas.width,
    height: canvas.height,
    duration,
    fps,
    codec,
    tools: [speedGroup],
    destroy: () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      playing = false;
      audio?.pause();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      source.close();
    },
  };
}
