/**
 * Files from paid CAD / design programs (SolidWorks, Inventor, Revit, SketchUp, Rhino,
 * MicroStation, CATIA, 3ds Max, old Visio): their geometry is in a closed format, so the
 * preview picture saved inside the file is shown, with what the file is and how to open it.
 */
import './cadinfo.css';
import { h } from '../../../core/dom';
import { lang, strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { CAD_KINDS } from './formats';
import { bestPreview } from './preview';

const s = strings({
  made: { en: 'Made with', zh: '制作软件' },
  open: { en: 'Open it with', zh: '打开方式' },
  why: { en: 'This program saves its drawings in a closed format that only its own software can fully read. Shown here: the preview picture it saved inside the file.', zh: '该软件用封闭格式保存图纸，只有它自己的软件才能完整读取。这里显示的是它保存在文件里的预览图。' },
  noPreview: { en: 'This file has no preview picture inside.', zh: '这个文件里没有预览图。' },
  searching: { en: 'Looking for the preview picture…', zh: '正在查找预览图…' },
});

const extOf = (n: string) => /\.([a-z0-9]+)$/i.exec(n)?.[1]?.toLowerCase() ?? '';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = extOf(file.name);
  const kind = CAD_KINDS[ext] ?? CAD_KINDS[ctx.format?.id ?? ''];
  ctx.progress?.(s('searching'));
  const preview = await bestPreview(new Uint8Array(await file.arrayBuffer()));
  const url = preview ? URL.createObjectURL(preview.blob) : '';
  const zh = lang() === 'zh';
  ctx.mount.replaceChildren(
    h('div', { class: 'view view-cadinfo' },
      h('div', { class: 'ci-picture' }, preview ? h('img', { src: url, alt: kind?.name ?? '', style: preview.width < 480 ? `width:min(100%, ${Math.min(480, preview.width * 3)}px)` : '' }) : h('p', { class: 'ci-none' }, s('noPreview'))),
      h('div', { class: 'ci-card' },
        h('h2', {}, kind?.name ?? file.name),
        h('p', { class: 'ci-why' }, s('why')),
        h('dl', {},
          h('dt', {}, s('made')), h('dd', {}, kind?.maker ?? '—'),
          h('dt', {}, s('open')), h('dd', {}, kind ? kind.open[zh ? 1 : 0] : '—'),
        ),
      ),
    ), // prettier-ignore
  );
  return {
    meta: () => [kind?.name ?? ext.toUpperCase(), ...(preview ? [`${preview.width} × ${preview.height}`] : [])],
    destroy: () => url && URL.revokeObjectURL(url),
  };
}
