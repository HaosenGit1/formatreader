/**
 * Animated GIF / APNG / WebP / AVIF with controls: play/pause, step frame by frame, speed,
 * and the frame count — using the browser's own image decoder (ImageDecoder, part of
 * WebCodecs). Browsers without it keep showing the picture as a normal (auto-playing) image.
 */

interface Frame {
  image: CanvasImageSource & { displayWidth?: number; close?(): void };
  duration: number | null;
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { animated: boolean; frameCount: number; repetitionCount: number } | null };
  completed: Promise<void>;
  decode(o: { frameIndex: number }): Promise<{ image: Frame['image'] & { duration: number | null } }>;
  close(): void;
}

const TYPES: Record<string, string> = { gif: 'image/gif', png: 'image/png', apng: 'image/png', webp: 'image/webp', avif: 'image/avif' };

export interface AnimatedPlayer {
  canvas: HTMLCanvasElement;
  frameCount: number;
  /** Seconds for one loop. */
  duration: number;
  playing(): boolean;
  play(): void;
  pause(): void;
  step(delta: number): Promise<void>;
  setSpeed(v: number): void;
  onFrame(cb: (index: number) => void): void;
  destroy(): void;
}

export async function animatedPlayer(file: Blob, formatId: string): Promise<AnimatedPlayer | null> {
  const Decoder = (globalThis as { ImageDecoder?: { new (o: object): ImageDecoderLike; isTypeSupported(t: string): Promise<boolean> } }).ImageDecoder;
  const type = TYPES[formatId];
  if (!Decoder || !type || !(await Decoder.isTypeSupported(type).catch(() => false))) return null;
  const decoder = new Decoder({ data: await file.arrayBuffer(), type });
  try {
    await decoder.tracks.ready;
    await decoder.completed; // the whole file is in memory: the frame count is final
  } catch {
    decoder.close();
    return null;
  }
  const track = decoder.tracks.selectedTrack;
  if (!track?.animated || track.frameCount < 2) {
    decoder.close();
    return null;
  }
  const frameCount = track.frameCount;
  const first = await decoder.decode({ frameIndex: 0 });
  const w = (first.image as { displayWidth?: number }).displayWidth ?? 1;
  const hgt = (first.image as { displayHeight?: number }).displayHeight ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const g = canvas.getContext('2d')!;
  // Frame durations (µs) give the loop length; GIFs without timing play at 10 fps like browsers do.
  const durations: number[] = [];
  let index = 0;
  let playing = true;
  let speed = 1;
  let timer = 0;
  let listener: (i: number) => void = () => {};
  let destroyed = false;
  const draw = async (i: number) => {
    const { image } = await decoder.decode({ frameIndex: i });
    if (destroyed) return image.close?.();
    g.clearRect(0, 0, w, hgt);
    g.drawImage(image, 0, 0, w, hgt);
    const d = image.duration && image.duration > 0 ? image.duration / 1000 : 100;
    durations[i] = Math.max(20, d);
    image.close?.();
    index = i;
    listener(i);
  };
  const tick = async () => {
    if (!playing || destroyed) return;
    const next = (index + 1) % frameCount;
    const started = performance.now();
    await draw(next);
    const wait = (durations[next] ?? 100) / speed - (performance.now() - started);
    timer = window.setTimeout(tick, Math.max(0, wait));
  };
  g.drawImage(first.image, 0, 0, w, hgt);
  durations[0] = first.image.duration && first.image.duration > 0 ? first.image.duration / 1000 : 100;
  first.image.close?.();
  timer = window.setTimeout(tick, durations[0]);

  // Loop length from all frame durations (decoded once in the background).
  let total = 0;
  void (async () => {
    for (let i = 0; i < frameCount && !destroyed; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      total += image.duration && image.duration > 0 ? image.duration / 1e6 : 0.1;
      image.close?.();
    }
  })();

  const player: AnimatedPlayer = {
    canvas,
    frameCount,
    get duration() {
      return total;
    },
    playing: () => playing,
    play() {
      if (playing) return;
      playing = true;
      void tick();
    },
    pause() {
      playing = false;
      clearTimeout(timer);
    },
    async step(delta) {
      player.pause();
      await draw((index + delta + frameCount) % frameCount);
    },
    setSpeed(v) {
      speed = v;
    },
    onFrame(cb) {
      listener = cb;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      decoder.close();
    },
  };
  return player;
}
