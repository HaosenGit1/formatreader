/**
 * Video player: the browser plays the file (MP4, WebM, MOV, MKV and OGV where
 * the codecs are supported). Speed, picture-in-picture, resolution and codec.
 * AVI with MJPEG or H.264 is played by avi-player.ts; FLV/TS are repackaged (mpegts.js).
 * Formats nothing here can play (WMV, DivX AVI, RMVB…) show their details instead.
 */
import './video.css';
import { h } from '../../../core/dom';
import { lang, strings } from '../../../core/i18n';
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
  appOnly: { en: 'This is the encrypted download format of the {app} app: no browser or other player can open it. Play it in the {app} app, or use the app’s export / convert function to save it as MP4.', zh: '这是{app}客户端的加密下载格式，浏览器和其他播放器都打不开。请在{app}客户端里播放，或用客户端的“导出/转码”功能另存为 MP4。' },
  exoOnly: { en: 'This is an offline download saved inside an Android app (YouTube and other apps built on ExoPlayer). It is encrypted for that app and phone: no browser or other player can open it. Play it in the app that downloaded it.', zh: '这是安卓 App 内保存的离线下载（YouTube 等基于 ExoPlayer 的 App）。它为该 App 和手机加密，浏览器和其他播放器都打不开，请在下载它的 App 里播放。' },
  amrSound: { en: 'The sound is AMR (old-phone / voice-recorder audio), which browsers can’t play, so the video is silent here. VLC plays it with sound.', zh: '声音是 AMR 格式（旧手机/录音常用），浏览器无法播放，所以这里没有声音。用 VLC 播放可以听到声音。' },
  companion: { en: 'Playing with its sound from {name} (saved separately, as Bilibili does).', zh: '同时播放单独保存的声音 {name}（B站缓存就是这样分开保存的）。' },
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
  [/s263|h\.?263/i, 'H.263'],
  [/apcn|apch|apcs|apco|ap4h|prores/i, 'ProRes'],
];
const CONTAINERS: Array<[RegExp, string]> = [
  [/3gp|3g2|3ge|3gg/i, '3GP'],
  [/qt/i, 'MOV'],
  [/webm/i, 'WebM'],
  [/matroska/i, 'MKV'],
  [/isom|mp4|avc1|iso\d/i, 'MP4'],
  [/asf/i, 'ASF'],
  [/avi/i, 'AVI'],
];

/** Video codec and container names from the file (music-metadata reads MP4/MKV/WebM/AVI/ASF headers). */
async function codecInfo(file: File): Promise<{ container?: string; codec?: string; fps?: number; audio?: string } | null> {
  try {
    const { parseBlob } = await import('music-metadata');
    // 3GP is the MP4 container under another name; the reader only accepts the MP4 type.
    const blob = /3gpp/.test(file.type) || /\.3g[p2]$/i.test(file.name) ? file.slice(0, file.size, 'video/mp4') : file;
    const m = await parseBlob(blob, { duration: false, skipCovers: true });
    const track = m.format.trackInfo?.find((t) => t.type === 1 || t.video);
    const raw = track?.codecName?.replace(/[<>]/g, '') ?? '';
    const codec = VIDEO_CODECS.find(([re]) => re.test(raw))?.[1] ?? (raw || undefined);
    const container = CONTAINERS.find(([re]) => re.test(m.format.container ?? ''))?.[1] ?? m.format.container;
    const audio = m.format.trackInfo?.find((t) => t.type === 2 || t.audio)?.codecName ?? m.format.codec;
    return { container, codec, fps: track?.video?.frameRate, audio };
  } catch {
    return null;
  }
}

/** The video codec named in an FLV's first video tag. */
async function flvCodec(file: File): Promise<string | undefined> {
  const b = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  for (let i = 13; i + 12 < b.length; ) {
    const type = b[i] & 0x1f;
    const size = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    if (type === 9) return ({ 2: 'Sorenson Spark (H.263)', 3: 'Screen video', 4: 'VP6', 5: 'VP6 + alpha', 7: 'H.264', 12: 'HEVC' } as Record<number, string>)[b[i + 11] & 0x0f];
    i += 11 + size + 4;
  }
  return undefined;
}

/** Plays FLV / MPEG-TS through mpegts.js (repackaged to fragmented MP4 for Media Source Extensions). */
async function repackage(video: HTMLVideoElement, url: string, type: 'flv' | 'mpegts'): Promise<{ destroy(): void }> {
  const { default: mpegts } = await import('mpegts.js');
  if (!mpegts.isSupported()) throw new Error('Media Source Extensions not available');
  video.removeAttribute('src');
  const player = mpegts.createPlayer({ type, isLive: false, url }, { enableWorker: false, lazyLoad: false });
  player.attachMediaElement(video);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 15000);
    video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
    player.on(mpegts.Events.ERROR, () => { clearTimeout(timer); reject(new Error('cannot repackage')); });
    player.load();
  });
  return { destroy: () => { player.pause(); player.unload(); player.detachMediaElement(); player.destroy(); } };
}

/** AVI: played by FormatReader itself when it holds MJPEG or H.264 (most camera, CCTV and dashcam files). */
async function openAvi(file: File, ctx: OpenContext): Promise<OpenedView | string | null> {
  const { openAviPlayer } = await import('./avi-player');
  const player = await openAviPlayer(file, ctx.mount).catch(() => null);
  if (!player) return null;
  if ('unsupported' in player) return player.unsupported; // the codec, for the message
  return {
    meta: () => [`${player.width} × ${player.height}`, time(player.duration), `AVI · ${player.codec}`, `${Math.round(player.fps)} fps`],
    tools: () => player.tools,
    about: () => ({ codec: player.codec }),
    destroy: () => player.destroy(),
  };
}

/** Encrypted downloads of video apps (爱奇艺, 优酷, 腾讯视频, 迅雷): explain instead of failing. */
const APP_FORMATS: Record<string, [string, string]> = { qsv: ['iQiyi', '爱奇艺'], kux: ['Youku', '优酷'], qlv: ['Tencent Video', '腾讯视频'], xv: ['Xunlei', '迅雷'] };

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  if (ctx.format?.id === 'exo') {
    ctx.mount.replaceChildren(h('div', { class: 'view view-video' }, h('div', { class: 'vd-message' }, s('exoOnly'))));
    return { meta: () => [ctx.format!.name] };
  }
  const app = APP_FORMATS[ctx.format?.id ?? ''];
  if (app) {
    ctx.mount.replaceChildren(h('div', { class: 'view view-video' }, h('div', { class: 'vd-message' }, s('appOnly').replace(/\{app\}/g, lang() === 'zh' ? app[1] : app[0]))));
    return { meta: () => [ctx.format!.name] };
  }
  let aviCodec: string | undefined;
  if (ctx.format?.id === 'avi') {
    const avi = await openAvi(file, ctx);
    if (avi && typeof avi === 'object') return avi;
    aviCodec = avi ?? undefined;
  }
  const url = URL.createObjectURL(file);
  const video = h('video', { class: 'vd-video', src: url, controls: true, playsinline: true, preload: 'metadata' }) as HTMLVideoElement;
  const message = h('div', { class: 'vd-message', hidden: true });
  ctx.mount.replaceChildren(h('div', { class: 'view view-video' }, video, message));
  const info = codecInfo(file);

  // FLV and MPEG-TS usually hold H.264/AAC, which the browser can decode; only the container is
  // unknown to it. mpegts.js repackages them on the fly for the browser's own player (MSE).
  let repack: { destroy(): void } | null = null;
  const id = ctx.format?.id ?? '';
  const viaRepack = id === 'flv' || id === 'ts';
  let playable: boolean;
  if (viaRepack) {
    playable = await repackage(video, url, id === 'flv' ? 'flv' : 'mpegts').then((p) => ((repack = p), true)).catch(() => false);
  } else {
    // Wait until the browser knows whether it can play the file.
    playable = await new Promise<boolean>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(true), { once: true });
      video.addEventListener('error', () => resolve(false), { once: true });
    });
  }
  const ci = await info;
  const codec = aviCodec ?? ci?.codec ?? (id === 'flv' ? await flvCodec(file) : undefined);
  if (!playable) {
    video.hidden = true;
    message.hidden = false;
    // Formats no browser plays at all (Windows Media, AVI, Flash, RealMedia): don't suggest Safari.
    const legacy = ({ wmv: 'Windows Media (WMV)', avi: 'AVI', flv: 'Flash (FLV)', rmvb: 'RealMedia', asf: 'Windows Media', '3gp': '3GP' } as Record<string, string>)[ctx.format?.id ?? ''] ?? (ci?.container === 'ASF' ? 'Windows Media' : ci?.container === 'AVI' ? 'AVI' : '');
    message.textContent = (legacy ? s('noBrowser').replace('{format}', legacy) : s('cannot')).replace('{codec}', codec ? ` (${codec})` : '');
  } else if (!video.videoWidth) {
    message.hidden = false;
    message.textContent = s('audioOnly');
    message.classList.add('subtle');
  } else if (/samr|sawb|amr/i.test(ci?.audio ?? '')) {
    // 3GP from older phones / WhatsApp: H.264 picture with AMR sound.
    message.hidden = false;
    message.textContent = s('amrSound');
    message.classList.add('subtle');
  }

  // Picture and sound saved apart (B站 caches: video.m4s + audio.m4s): play the sound alongside.
  const companion = (file as File & { companionAudio?: File }).companionAudio;
  let companionUrl = '';
  if (companion && playable) {
    companionUrl = URL.createObjectURL(companion);
    const audio = new Audio(companionUrl);
    const sync = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > 0.25) audio.currentTime = video.currentTime;
    };
    video.addEventListener('play', () => (sync(), void audio.play().catch(() => {})));
    video.addEventListener('pause', () => audio.pause());
    video.addEventListener('seeked', sync);
    video.addEventListener('ratechange', () => (audio.playbackRate = video.playbackRate));
    video.addEventListener('volumechange', () => ((audio.volume = video.volume), (audio.muted = video.muted)));
    video.addEventListener('timeupdate', sync);
    message.hidden = false;
    message.classList.add('subtle');
    message.textContent = s('companion').replace('{name}', companion.name);
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
      ...[ci?.container ?? (id === 'flv' ? 'FLV' : id === 'ts' ? 'MPEG-TS' : undefined), codec].filter(Boolean).length
        ? [[ci?.container ?? (id === 'flv' ? 'FLV' : id === 'ts' ? 'MPEG-TS' : undefined), codec].filter(Boolean).join(' · ')]
        : [ctx.format?.name ?? 'Video'],
      ...(ci?.fps ? [`${Math.round(ci.fps)} fps`] : []),
    ],
    tools: () => tools,
    about: () => ({ codec }),
    destroy: () => {
      repack?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (companionUrl) URL.revokeObjectURL(companionUrl);
    },
  };
}
