/**
 * Animations:
 *  - Lottie (After Effects animations from Bodymovin: .json, .lottie; Telegram .tgs stickers
 *    arrive here unzipped) — played with lottie-web's light build (no code evaluation),
 *    with play/pause, a frame slider, speed and loop.
 *  - Flash (.swf) — played by Ruffle, the open-source Flash emulator, with networking
 *    switched off so the animation cannot contact any server. Website only (its engine is
 *    ~14 MB, kept out of the portable file).
 */
import './anim.css';
import { printPicture, svgSource } from '../../../core/print-picture';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import pkg from '@ruffle-rs/ruffle/package.json';

const s = strings({
  play: { en: 'Play', zh: '播放' },
  pause: { en: 'Pause', zh: '暂停' },
  frame: { en: 'Frame', zh: '帧' },
  frames: { en: 'frames', zh: '帧' },
  speed: { en: 'Speed', zh: '速度' },
  loop: { en: 'Loop', zh: '循环' },
  lottie: { en: 'Lottie animation', zh: 'Lottie 动画' },
  flash: { en: 'Flash animation', zh: 'Flash 动画' },
  flashPortable: { en: 'Flash (.swf) files open on formatreader.com: the Flash player is too large to include in this single file.', zh: 'Flash (.swf) 文件请在 formatreader.com 打开：Flash 播放器太大，没有放进这个单文件版。' },
  flashNote: { en: 'Played by Ruffle (open-source Flash emulator). The animation cannot connect to the internet. Some ActionScript 3 content may not work fully.', zh: '由 Ruffle（开源 Flash 模拟器）播放，动画无法连接网络。部分 ActionScript 3 内容可能无法完整运行。' },
  noLottie: { en: 'This file has no Lottie animation inside.', zh: '这个文件里没有 Lottie 动画。' },
});

type Json = Record<string, unknown>;

/** The animation JSON, with pictures from a .lottie package put inline. */
async function lottieData(file: File, isPackage: boolean): Promise<Json> {
  if (!isPackage) return JSON.parse(await file.text()) as Json;
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as { animations?: Array<{ id: string }> };
  const id = manifest.animations?.[0]?.id;
  const path = (id && files[`animations/${id}.json`] ? `animations/${id}.json` : Object.keys(files).find((f) => /^animations\/.+\.json$/.test(f)));
  if (!path) throw new Error(s('noLottie'));
  const data = JSON.parse(strFromU8(files[path])) as Json;
  // Pictures are stored in images/: give them to the player as data: URLs.
  for (const a of (data.assets as Array<Json> | undefined) ?? []) {
    const p = typeof a.p === 'string' ? a.p : '';
    const bytes = files[`images/${p}`] ?? files[`i/${p}`];
    if (bytes && !p.startsWith('data:')) {
      const type = /\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg';
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      a.u = '';
      a.p = `data:${type};base64,${btoa(bin)}`;
      a.e = 1;
    }
  }
  return data;
}

async function openLottie(file: File, ctx: OpenContext): Promise<OpenedView> {
  const data = await lottieData(file, ctx.format?.id === 'lottie');
  const { default: lottie } = await import('lottie-web/build/player/lottie_light.js');
  const stage = h('div', { class: 'an-stage' });
  const slider = h('input', { type: 'range', class: 'an-slider', min: '0', step: '1', 'aria-label': s('frame') }) as HTMLInputElement;
  const frameText = h('span', { class: 'an-frame' });
  const playBtn = h('button', { type: 'button', class: 'an-play', 'aria-label': s('pause') }, '❚❚') as HTMLButtonElement;
  ctx.mount.replaceChildren(h('div', { class: 'view view-anim' }, stage, h('div', { class: 'an-bar' }, playBtn, slider, frameText)));
  const anim = lottie.loadAnimation({ container: stage, renderer: 'svg', loop: true, autoplay: true, animationData: data });
  const total = Math.max(1, Math.round(anim.totalFrames));
  slider.max = String(total - 1);
  const fps = Number(data.fr) || 30;
  let playing = true;
  const setPlaying = (p: boolean) => {
    playing = p;
    p ? anim.play() : anim.pause();
    playBtn.textContent = p ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', p ? s('pause') : s('play'));
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  slider.addEventListener('input', () => {
    setPlaying(false);
    anim.goToAndStop(Number(slider.value), true);
  });
  anim.addEventListener('enterFrame', () => {
    const f = Math.floor(anim.currentFrame);
    slider.value = String(f);
    frameText.textContent = `${f + 1} / ${total}`;
  });
  const speeds = [0.25, 0.5, 1, 2];
  const speedGroup = h('div', { class: 'seg', role: 'group', 'aria-label': s('speed') }, ...speeds.map((v) => h('button', { type: 'button', class: v === 1 ? 'active' : '', onclick: (e: Event) => { anim.setSpeed(v); for (const b of speedGroup.children) b.classList.toggle('active', b === e.currentTarget); } }, `${v}×`)));
  const loopBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'true', onclick: () => { anim.loop = !anim.loop; loopBtn.setAttribute('aria-pressed', String(anim.loop)); if (anim.loop && !playing) setPlaying(true); } }, s('loop')) as HTMLButtonElement;
  return {
    meta: () => [s('lottie'), `${Number(data.w) || '?'} × ${Number(data.h) || '?'}`, `${total} ${s('frames')} · ${fps} fps · ${(total / fps).toFixed(1)} s`],
    tools: () => [speedGroup, loopBtn],
    // The frame on screen now, alone on the page.
    print: () => {
      const svg = stage.querySelector('svg');
      if (!svg) return window.print();
      const got = svgSource(svg);
      printPicture(got.src, got.wide);
    },
    destroy: () => anim.destroy(),
  };
}

interface RufflePlayerElement extends HTMLElement {
  ruffle?(): { load(o: object): Promise<void> };
  load?(o: object): Promise<void>;
}
declare global {
  interface Window {
    RufflePlayer?: { config?: object; newest(): { createPlayer(): RufflePlayerElement } };
  }
}

let ruffleScript: Promise<void> | null = null;
function loadRuffle(): Promise<void> {
  ruffleScript ??= new Promise((resolve, reject) => {
    const base = new URL(`vendor/ruffle-${pkg.version}/`, document.baseURI).href;
    // No network for SWF content; the player's own files come from our folder.
    window.RufflePlayer = { ...(window.RufflePlayer ?? {}), config: { publicPath: base, autoplay: 'on', unmuteOverlay: 'hidden', splashScreen: false, letterbox: 'on', allowNetworking: 'none', allowScriptAccess: false, upgradeToHttps: true, warnOnUnsupportedContent: false, contextMenu: 'rightClickOnly', polyfills: false } } as Window['RufflePlayer'];
    const script = document.createElement('script');
    script.src = `${base}ruffle.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('The Flash player could not be loaded.'));
    document.head.append(script);
  });
  return ruffleScript;
}

async function openFlash(file: File, ctx: OpenContext): Promise<OpenedView> {
  if (import.meta.env.MODE === 'portable') {
    ctx.mount.replaceChildren(h('div', { class: 'view view-anim' }, h('p', { class: 'an-note' }, s('flashPortable'))));
    return { meta: () => [s('flash')] };
  }
  const [data] = await Promise.all([file.arrayBuffer(), loadRuffle()]);
  const player = window.RufflePlayer!.newest().createPlayer();
  player.classList.add('an-flash');
  ctx.mount.replaceChildren(h('div', { class: 'view view-anim' }, h('div', { class: 'an-stage' }, player), h('p', { class: 'an-note' }, s('flashNote'))));
  const api = player.ruffle?.() ?? player;
  await api.load!({ data, allowNetworking: 'none' });
  const head = new Uint8Array(data, 0, 4);
  return {
    meta: () => [s('flash'), `SWF ${head[3]}`],
    print: false, // a Flash animation or game: nothing to put on paper
    destroy: () => player.remove(),
  };
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  return ctx.format?.id === 'swf' ? openFlash(file, ctx) : openLottie(file, ctx);
}
