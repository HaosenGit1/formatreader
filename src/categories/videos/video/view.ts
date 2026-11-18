/**
 * Video player: the browser plays the file (MP4, WebM, MOV, MKV and OGV where
 * the codecs are supported). Speed, picture-in-picture, resolution and codec.
 * Formats browsers can't play (AVI, WMV, FLV, RMVB…) show their details instead.
 */
import './video.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';

const s = strings({
  speed: { en: 'Speed', zh: '速度' },
  pip: { en: 'Picture in picture', zh: '画中画' },
  cannot: {
    en: 'This browser can’t play this video{codec}. Safari, or a player such as VLC, may play it.',
    zh: '这个浏览器无法播放此视频{codec}。可以试试 Safari，或 VLC 等播放器。',
  },
  noBrowser: {
    en: 'No web browser can play {format} videos{codec}. A player such as VLC can.',
    zh: '所有网页浏览器都无法播放 {format} 视频{codec}。可以用 VLC 等播放器。',
  },
  audioOnly: { en: 'This file has sound only, no picture.', zh: '这个文件只有声音，没有画面。' },
});

const time = (t: number) => {
  if (!Number.isFinite(t)) return '';
  t = Math.round(t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = Math.floor(t % 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
};

const VIDEO_CODECS: Array<[RegExp, string]> = [
  [/avc|h\.?264|V_MPEG4\/ISO\/AVC/i, 'H.264'],
  [/hvc|hev|h\.?265|HEVC/i, 'HEVC (H.265)'],
  [/av01|V_AV1|^AV1$/i, 'AV1'],
  [/vp0?9/i, 'VP9'],
  [/vp0?8/i, 'VP8'],
  [/mp4v|V_MPEG4\/ISO\/(SP|ASP)|xvid|divx/i, 'MPEG-4 Part 2'],
  [/theora/i, 'Theora'],
  [/wmv|vc-?1/i, 'Windows Media Video'],
  [/apcn|apch|apcs|apco|ap4h|prores/i, 'ProRes'],
];
const CONTAINERS: Array<[RegExp, string]> = [
  [/qt/i, 'MOV'],
  [/webm/i, 'WebM'],
  [/matroska/i, 'MKV'],
  [/isom|mp4|avc1|iso\d/i, 'MP4'],
  [/asf/i, 'ASF'],
  [/avi/i, 'AVI'],
];

/** Video codec and container names from the file (music-metadata reads MP4/MKV/WebM/AVI/ASF headers). */
async function codecInfo(file: File): Promise<{ container?: string; codec?: string; fps?: number } | null> {
  try {
    const { parseBlob } = await import('music-metadata');
    const m = await parseBlob(file, { duration: false, skipCovers: true });
    const track = m.format.trackInfo?.find((t) => t.type === 1 || t.video);
    const raw = track?.codecName?.replace(/[<>]/g, '') ?? '';
    const codec = VIDEO_CODECS.find(([re]) => re.test(raw))?.[1] ?? (raw || undefined);
    const container = CONTAINERS.find(([re]) => re.test(m.format.container ?? ''))?.[1] ?? m.format.container;
    return { container, codec, fps: track?.video?.frameRate };
  } catch {
    return null;
  }
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const url = URL.createObjectURL(file);
  const video = h('video', { class: 'vd-video', src: url, controls: true, playsinline: true, preload: 'metadata' }) as HTMLVideoElement;
  const message = h('div', { class: 'vd-message', hidden: true });
  ctx.mount.replaceChildren(h('div', { class: 'view view-video' }, video, message));
  const info = codecInfo(file);

  // Wait until the browser knows whether it can play the file.
  const playable = await new Promise<boolean>((resolve) => {
    video.addEventListener('loadedmetadata', () => resolve(true), { once: true });
    video.addEventListener('error', () => resolve(false), { once: true });
  });
  const ci = await info;
  const codec = ci?.codec;
  if (!playable) {
    video.hidden = true;
    message.hidden = false;
    // Formats no browser plays at all (Windows Media, AVI, Flash, RealMedia): don't suggest Safari.
    const legacy = ({ wmv: 'Windows Media (WMV)', avi: 'AVI', flv: 'Flash (FLV)', rmvb: 'RealMedia', asf: 'Windows Media' } as Record<string, string>)[ctx.format?.id ?? ''] ?? (ci?.container === 'ASF' ? 'Windows Media' : ci?.container === 'AVI' ? 'AVI' : '');
    message.textContent = (legacy ? s('noBrowser').replace('{format}', legacy) : s('cannot')).replace('{codec}', codec ? ` (${codec})` : '');
  } else if (!video.videoWidth) {
    message.hidden = false;
    message.textContent = s('audioOnly');
    message.classList.add('subtle');
  }

  const speeds = [0.5, 1, 1.25, 1.5, 2];
  const speedGroup = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': s('speed') },
    ...speeds.map((v) =>
      h('button', { type: 'button', class: v === 1 ? 'active' : '', onclick: (e: Event) => { video.playbackRate = v; for (const b of speedGroup.children) b.classList.toggle('active', b === e.currentTarget); } }, `${v}×`),
    ),
  );
  const tools: HTMLElement[] = playable ? [speedGroup] : [];
  if (playable && video.videoWidth && document.pictureInPictureEnabled) {
    tools.push(h('button', { type: 'button', class: 'btn', onclick: () => (document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture()).catch(() => {}) }, s('pip')));
  }

  return {
    meta: () => [
      ...(video.videoWidth ? [`${video.videoWidth} × ${video.videoHeight}`] : []),
      ...(Number.isFinite(video.duration) ? [time(video.duration)] : []),
      ...[ci?.container, codec].filter(Boolean).length ? [[ci?.container, codec].filter(Boolean).join(' · ')] : [ctx.format?.name ?? 'Video'],
      ...(ci?.fps ? [`${Math.round(ci.fps)} fps`] : []),
    ],
    tools: () => tools,
    destroy: () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}
