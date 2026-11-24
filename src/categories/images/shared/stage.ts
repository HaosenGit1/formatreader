/**
 * Zoom and pan for one picture: mouse wheel / trackpad (zooms around the
 * pointer), drag to move, pinch on touch screens, double-click for 100% / fit,
 * and quarter-turn rotation. Starts fitted to the window and stays fitted when
 * the window changes size, until the visitor zooms.
 */
import { h } from '../../../core/dom';

export interface Stage {
  element: HTMLElement;
  fit(): void;
  actual(): void;
  zoomBy(factor: number): void;
  rotate(): void;
  /** Current zoom (1 = 100%). */
  readonly scale: number;
  /** Quarter turns clockwise (0–3), and the picture shown: for printing it as seen. */
  readonly turns: number;
  readonly content: HTMLElement;
  /** Swap the picture (e.g. another page) and fit it. */
  replace(content: HTMLElement, width: number, height: number): void;
  destroy(): void;
}

const MIN = 0.02;
const MAX = 32;

export function createStage(content: HTMLElement, width: number, height: number, onChange: () => void): Stage {
  const inner = h('div', { class: 'ph-inner' }, content);
  const layer = h('div', { class: 'ph-layer' }, inner);
  const element = h('div', { class: 'ph-stage', tabindex: '0' }, layer);

  let w = width;
  let hgt = height;
  let rotation = 0; // quarter turns
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let fitted = true;

  const box = () => (rotation % 2 ? { bw: hgt, bh: w } : { bw: w, bh: hgt });

  const apply = () => {
    const { bw, bh } = box();
    // The inner element keeps the picture's own size and turns around its centre inside the layer box.
    inner.style.width = `${w}px`;
    inner.style.height = `${hgt}px`;
    inner.style.transform = `translate(${(bw - w) / 2}px, ${(bh - hgt) / 2}px) rotate(${rotation * 90}deg)`;
    layer.style.width = `${bw}px`;
    layer.style.height = `${bh}px`;
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    element.classList.toggle('ph-pixels', scale >= 3);
    onChange();
  };

  const fit = () => {
    const { bw, bh } = box();
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height) return;
    scale = Math.min(r.width / bw, r.height / bh, 1);
    tx = (r.width - bw * scale) / 2;
    ty = (r.height - bh * scale) / 2;
    fitted = true;
    apply();
  };

  /** Zoom to `next`, keeping the point (cx, cy) of the stage still. */
  const zoomTo = (next: number, cx?: number, cy?: number) => {
    const r = element.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    next = Math.min(MAX, Math.max(MIN, next));
    tx = px - (px - tx) * (next / scale);
    ty = py - (py - ty) * (next / scale);
    scale = next;
    fitted = false;
    apply();
  };

  element.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = element.getBoundingClientRect();
      // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as larger steps.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomTo(scale * factor, e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );

  // Drag to move; two fingers to pinch.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; scale: number } | null = null;
  element.addEventListener('pointerdown', (e) => {
    element.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
    element.classList.add('ph-grabbing');
  });
  element.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = element.getBoundingClientRect();
      zoomTo(pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    tx += now.x - prev.x;
    ty += now.y - prev.y;
    fitted = false;
    apply();
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) element.classList.remove('ph-grabbing');
  };
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);

  element.addEventListener('dblclick', (e) => {
    const r = element.getBoundingClientRect();
    if (fitted && scale < 1) zoomTo(1, e.clientX - r.left, e.clientY - r.top);
    else fit();
  });

  element.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') zoomTo(scale * 1.25);
    else if (e.key === '-') zoomTo(scale / 1.25);
    else if (e.key === '0') fit();
    else if (e.key === '1') zoomTo(1);
    else if (e.key === 'r' || e.key === 'R') stage.rotate();
    else return;
    e.preventDefault();
  });

  const ro = new ResizeObserver(() => fitted && fit());
  ro.observe(element);

  const stage: Stage = {
    element,
    fit,
    actual: () => zoomTo(1),
    zoomBy: (f) => zoomTo(scale * f),
    rotate: () => {
      rotation = (rotation + 1) % 4;
      fit();
    },
    get scale() {
      return scale;
    },
    get turns() {
      return rotation;
    },
    get content() {
      return inner.firstElementChild as HTMLElement;
    },
    replace(next, nw, nh) {
      inner.replaceChildren(next);
      w = nw;
      hgt = nh;
      fit();
    },
    destroy: () => ro.disconnect(),
  };
  requestAnimationFrame(fit);
  return stage;
}
