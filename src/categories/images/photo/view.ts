/**
 * Image viewer: JPEG, PNG, GIF, WebP, AVIF, BMP, ICO, SVG natively; HEIC
 * (iPhone), TIFF, Photoshop and camera RAW via decoders loaded on demand.
 * Zoom, pan, rotate, pages (multi-page TIFF, HEIC sequences) and photo details.
 */
import './photo.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { createStage } from '../shared/stage';
import { decodeImage, type Picture } from './decode';
import { photoDetails } from './details';

const s = strings({
  motion: { en: '▶ Motion', zh: '▶ 动态照片' },
  play: { en: 'Play', zh: '播放' },
  pause: { en: 'Pause', zh: '暂停' },
  prevFrame: { en: 'Previous frame', zh: '上一帧' },
  nextFrame: { en: 'Next frame', zh: '下一帧' },
  frames: { en: 'frames', zh: '帧' },
  speed: { en: 'Speed', zh: '速度' },
  motionTitle: { en: 'This is a motion photo: play the short video saved with it', zh: '这是动态照片：播放随照片保存的短视频' },
  zoomIn: { en: 'Zoom in (+)', zh: '放大 (+)' },
  zoomOut: { en: 'Zoom out (−)', zh: '缩小 (−)' },
  actual: { en: 'Actual size (1)', zh: '原始大小 (1)' },
  fit: { en: 'Fit', zh: '适应窗口' },
  fitTitle: { en: 'Fit to window (0)', zh: '适应窗口 (0)' },
  rotate: { en: 'Rotate (R)', zh: '旋转 (R)' },
  details: { en: 'Details', zh: '详情' },
  page: { en: 'Image', zh: '图' },
  prev: { en: 'Previous image', zh: '上一张' },
  next: { en: 'Next image', zh: '下一张' },
  images: { en: 'images', zh: '张图' },
  rawPreview: {
    en: 'Showing the preview the camera saved inside this RAW file (full RAW processing is not done here).',
    zh: '显示相机保存在此 RAW 文件中的预览图（这里不做完整的 RAW 处理）。',
  },
  psdComposite: {
    en: 'This Photoshop file was saved without a full flattened image, so only its small preview is shown.',
    zh: '这个 Photoshop 文件保存时没有完整的合成图，只能显示小预览图。',
  },
});

/** Rotate-clockwise icon (drawn, so it has the same size and weight as the shell's icons). */
function rotateIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  for (const d of ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const extOf = (name: string) => /\.([a-z0-9]{1,6})$/i.exec(name)?.[1]?.toLowerCase() ?? '';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = extOf(file.name);
  const decoded = await decodeImage(file, ctx.format?.id ?? ext, ext);
  let index = 0;
  let pic: Picture = await decoded.page(0);

  const frame = (p: Picture) => {
    p.element.classList.add('ph-picture');
    return p.element;
  };

  const zoomLabel = h('button', { type: 'button', class: 'ph-zoom', title: s('actual'), onclick: () => stage.actual() }, '100%');
  const stage = createStage(frame(pic), pic.width, pic.height, () => {
    zoomLabel.textContent = `${Math.round(stage.scale * 100)}%`;
  });
  for (let i = 0; i < (decoded.turns ?? 0); i++) stage.rotate();

  // Details panel (filled in the background: EXIF reading never delays the picture).
  const details = h('aside', { class: 'ph-details', hidden: true });
  const fillDetails = async () => {
    const rows = await photoDetails(file, pic.width, pic.height, decoded.label, decoded.details);
    details.replaceChildren(h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  };
  void fillDetails();

  ctx.mount.replaceChildren(h('div', { class: 'view view-photo' }, stage.element, details));
  stage.element.focus({ preventScroll: true });

  const pageLabel = h('span', { class: 'ph-page' });
  const showPage = async (i: number) => {
    if (i < 0 || i >= decoded.pages || i === index) return;
    index = i;
    pic = await decoded.page(i);
    stage.replace(frame(pic), pic.width, pic.height);
    pageLabel.textContent = `${index + 1} / ${decoded.pages}`;
    void fillDetails();
    ctx.refreshChrome();
  };
  pageLabel.textContent = `${index + 1} / ${decoded.pages}`;

  const detailsBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'aria-pressed': 'false',
      onclick: () => {
        details.hidden = !details.hidden;
        detailsBtn.setAttribute('aria-pressed', String(!details.hidden));
      },
    },
    s('details'),
  );

  // Built once and reused, so the zoom label keeps updating between toolbar redraws.
  const tools: HTMLElement[] = [
    ...(decoded.pages > 1
      ? [
          h(
            'div',
            { class: 'seg', role: 'group' },
            h('button', { type: 'button', title: s('prev'), 'aria-label': s('prev'), onclick: () => void showPage(index - 1) }, '‹'),
            pageLabel,
            h('button', { type: 'button', title: s('next'), 'aria-label': s('next'), onclick: () => void showPage(index + 1) }, '›'),
          ),
        ]
      : []),
    h(
      'div',
      { class: 'seg', role: 'group' },
      h('button', { type: 'button', title: s('zoomOut'), 'aria-label': s('zoomOut'), onclick: () => stage.zoomBy(1 / 1.25) }, '−'),
      zoomLabel,
      h('button', { type: 'button', title: s('zoomIn'), 'aria-label': s('zoomIn'), onclick: () => stage.zoomBy(1.25) }, '+'),
    ),
    h('button', { type: 'button', class: 'btn', title: s('fitTitle'), onclick: () => stage.fit() }, s('fit')),
    h('button', { type: 'button', class: 'btn', title: s('rotate'), 'aria-label': s('rotate'), onclick: () => stage.rotate() }, rotateIcon()),
    detailsBtn,
  ];

  // Animated GIF / APNG / WebP / AVIF: play, pause, step through frames, speed.
  let anim: import('./animated').AnimatedPlayer | null = null;
  const fmtId = ctx.format?.id ?? ext;
  if (['gif', 'png', 'webp', 'avif'].includes(fmtId)) {
    void import('./animated').then(async ({ animatedPlayer }) => {
      const player = await animatedPlayer(file, fmtId).catch(() => null);
      if (!player) return;
      anim = player;
      player.canvas.classList.add('ph-picture');
      stage.replace(player.canvas, player.canvas.width, player.canvas.height);
      const label = h('span', { class: 'ph-page' }, `1 / ${player.frameCount}`);
      const playBtn = h('button', { type: 'button', title: s('pause'), 'aria-label': s('pause') }, '❚❚') as HTMLButtonElement;
      const sync = () => {
        playBtn.textContent = player.playing() ? '❚❚' : '▶';
        playBtn.title = player.playing() ? s('pause') : s('play');
      };
      playBtn.addEventListener('click', () => {
        player.playing() ? player.pause() : player.play();
        sync();
      });
      player.onFrame((i) => (label.textContent = `${i + 1} / ${player.frameCount}`));
      const step = (d: number) => async () => {
        await player.step(d);
        sync();
      };
      const controls = h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': s('frames') },
        h('button', { type: 'button', title: s('prevFrame'), 'aria-label': s('prevFrame'), onclick: step(-1) }, '⏮'),
        playBtn,
        h('button', { type: 'button', title: s('nextFrame'), 'aria-label': s('nextFrame'), onclick: step(1) }, '⏭'),
        label,
      );
      const speeds = [0.25, 0.5, 1, 2];
      const speedGroup = h('div', { class: 'seg', role: 'group', 'aria-label': s('speed') }, ...speeds.map((v) => h('button', { type: 'button', class: v === 1 ? 'active' : '', onclick: (e: Event) => { player.setSpeed(v); for (const b of speedGroup.children) b.classList.toggle('active', b === e.currentTarget); } }, `${v}×`)));
      tools.unshift(controls, speedGroup);
      animMeta = `${player.frameCount} ${s('frames')}`;
      ctx.refreshChrome();
    });
  }
  let animMeta = '';

  // Motion photos (Samsung, Pixel, Huawei, Xiaomi…): a short video hidden after the picture.
  const fmt = ctx.format?.id ?? ext;
  let motionUrl = '';
  let motionVideo: HTMLVideoElement | null = null;
  if (fmt === 'jpg' || fmt === 'heic') {
    void import('./motion').then(async ({ findMotionVideo }) => {
      const video = await findMotionVideo(file);
      if (!video) return;
      motionUrl = URL.createObjectURL(video);
      const btn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', title: s('motionTitle') }, s('motion')) as HTMLButtonElement;
      btn.addEventListener('click', () => {
        if (motionVideo) {
          motionVideo.remove();
          motionVideo = null;
          btn.setAttribute('aria-pressed', 'false');
          return;
        }
        motionVideo = h('video', { class: 'ph-motion', src: motionUrl, controls: true, autoplay: true, loop: true, playsinline: true }) as HTMLVideoElement;
        stage.element.append(motionVideo);
        btn.setAttribute('aria-pressed', 'true');
      });
      tools.splice(tools.length - 1, 0, btn);
      ctx.refreshChrome();
    });
  }

  return {
    meta: () => [decoded.label, `${pic.width} × ${pic.height}`, ...(decoded.pages > 1 ? [`${decoded.pages} ${s('images')}`] : []), ...(animMeta ? [animMeta] : [])],
    tools: () => tools,
    notices: () => (decoded.note && decoded.note !== 'heicDepth' ? [h('div', { class: 'notice subtle' }, s(decoded.note))] : []),
    destroy: () => {
      (anim as import('./animated').AnimatedPlayer | null)?.destroy();
      if (motionUrl) URL.revokeObjectURL(motionUrl);
      stage.destroy();
      decoded.release?.();
    },
  };
}
