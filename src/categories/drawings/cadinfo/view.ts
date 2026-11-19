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
import { bestPreview, type Found } from './preview';

const s = strings({
  made: { en: 'Made with', zh: '制作软件' },
  open: { en: 'Open it with', zh: '打开方式' },
  why: { en: 'This program saves its drawings in a closed format that only its own software can fully read. Shown here: the preview picture it saved inside the file.', zh: '该软件用封闭格式保存图纸，只有它自己的软件才能完整读取。这里显示的是它保存在文件里的预览图。' },
  noPreview: { en: 'This file has no preview picture inside.', zh: '这个文件里没有预览图。' },
  searching: { en: 'Looking for the preview picture…', zh: '正在查找预览图…' },
  sheet: { en: 'sheet', zh: '张图纸' },
  sheets: { en: 'sheets', zh: '张图纸' },
});

const extOf = (n: string) => /\.([a-z0-9]+)$/i.exec(n)?.[1]?.toLowerCase() ?? '';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = extOf(file.name);
  const kind = CAD_KINDS[ext] ?? CAD_KINDS[ctx.format?.id ?? ''];
  ctx.progress?.(s('searching'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sheets = ctx.format?.id === 'dwf' || ext === 'dwf' ? await dwfSheets(bytes) : [];
  const preview = sheets[0] ?? (await bestPreview(bytes));
  const url = preview ? URL.createObjectURL(preview.blob) : '';
  const extra = sheets.slice(1).map((sh) => ({ ...sh, url: URL.createObjectURL(sh.blob) }));
  const zh = lang() === 'zh';
  ctx.mount.replaceChildren(
    h('div', { class: 'view view-cadinfo' },
      h('div', { class: 'ci-picture' },
        ...(preview
          ? [
              h('figure', { class: 'ci-fig' }, h('img', { src: url, alt: kind?.name ?? '', style: preview.width < 480 ? `width:min(100%, ${Math.min(480, preview.width * 3)}px)` : '' }), ...(sheets[0]?.title ? [h('figcaption', {}, sheets[0].title)] : [])),
              ...extra.map((sh) => h('figure', { class: 'ci-fig' }, h('img', { src: sh.url, alt: sh.title, loading: 'lazy' }), h('figcaption', {}, sh.title))),
            ]
          : [h('p', { class: 'ci-none' }, s('noPreview'))]),
      ),
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
    meta: () => [kind?.name ?? ext.toUpperCase(), ...(sheets.length ? [`${sheets.length} ${sheets.length === 1 ? s('sheet') : s('sheets')}`] : preview ? [`${preview.width} × ${preview.height}`] : [])],
    destroy: () => {
      if (url) URL.revokeObjectURL(url);
      for (const sh of extra) URL.revokeObjectURL(sh.url);
    },
  };
}

/**
 * DWF (V6): a ZIP behind a "(DWF V06.00)" header. Each sheet (section) has a folder with its
 * graphics and its thumbnail / preview pictures; the manifest names the sections.
 */
async function dwfSheets(bytes: Uint8Array): Promise<Array<Found & { title: string }>> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let files: Record<string, Uint8Array> | null = null;
  for (const at of [12, 0]) {
    try {
      files = unzipSync(bytes.subarray(at));
      break;
    } catch {
      /* try the next offset */
    }
  }
  if (!files) return [];
  // Section titles: <dwf:Section … title="Sheet 1"> in manifest.xml / descriptor.xml.
  const titles = new Map<string, string>();
  for (const [path, data] of Object.entries(files)) {
    if (!/\.xml$/i.test(path)) continue;
    const xml = strFromU8(data);
    for (const m of xml.matchAll(/<[\w:]*Section\b[^>]*?\bname="([^"]+)"[^>]*?\btitle="([^"]*)"/g)) titles.set(m[1], m[2]);
    for (const m of xml.matchAll(/<[\w:]*Section\b[^>]*?\btitle="([^"]*)"[^>]*?\bname="([^"]+)"/g)) titles.set(m[2], m[1]);
  }
  // Per folder: the largest picture.
  const best = new Map<string, { data: Uint8Array; type: string; size: number }>();
  for (const [path, data] of Object.entries(files)) {
    const m = /\.(png|jpe?g)$/i.exec(path);
    if (!m) continue;
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const prev = best.get(folder);
    if (!prev || data.length > prev.size) best.set(folder, { data, type: m[1].toLowerCase() === 'png' ? 'image/png' : 'image/jpeg', size: data.length });
  }
  const out: Array<Found & { title: string }> = [];
  for (const [folder, img] of best) {
    const size = await new Promise<[number, number]>((resolve) => {
      const el = new Image();
      const u = URL.createObjectURL(new Blob([img.data as BlobPart], { type: img.type }));
      el.onload = () => (resolve([el.naturalWidth, el.naturalHeight]), URL.revokeObjectURL(u));
      el.onerror = () => (resolve([0, 0]), URL.revokeObjectURL(u));
      el.src = u;
    });
    const key = folder.split('/').pop() ?? folder;
    out.push({ blob: new Blob([img.data as BlobPart], { type: img.type }), width: size[0], height: size[1], title: titles.get(key) ?? titles.get(folder) ?? key });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}
