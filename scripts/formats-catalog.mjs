// The list of supported formats shown on formats.html, grouped by category.
// Built at build time; tests/core/formats-catalog.test.ts checks that every
// extension listed here really opens in the viewer it is listed under.
// Code & settings extensions are read from the code viewer's own table, so
// adding a language there adds it here automatically.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const t = (en, zh) => ({ en, zh });

const WORDS = [
  { name: t('Text & logs', '文本和日志'), viewer: 'words/text', ext: ['txt', 'text', 'log', 'nfo', 'md', 'markdown', 'mdx', 'html', 'htm', 'xhtml'] },
  { name: t('Subtitles', '字幕'), viewer: 'words/text', ext: ['srt', 'vtt', 'ass', 'ssa'] },
  { name: t('Word', 'Word'), viewer: 'words/docs', ext: ['docx', 'docm', 'dotx', 'dotm'] },
  { name: t('PDF', 'PDF'), viewer: 'words/pdf', ext: ['pdf'] },
  { name: t('PowerPoint', 'PowerPoint'), viewer: 'words/slides', ext: ['pptx', 'pptm', 'ppsx', 'potx'] },
  { name: t('Old Office & WPS', '旧版 Office 和 WPS'), viewer: 'words/legacy', ext: ['doc', 'dot', 'ppt', 'pps', 'pot', 'wps', 'dps'] },
  { name: t('Rich text', '富文本'), viewer: 'words/rtf', ext: ['rtf'] },
  { name: t('OpenDocument', 'OpenDocument'), viewer: 'words/odf', ext: ['odt', 'odp'] },
  { name: t('Apple Pages & Keynote', 'Apple Pages 和 Keynote'), viewer: 'words/iwork', ext: ['pages', 'key'] },
  { name: t('XPS & OFD', 'XPS 和 OFD'), viewer: 'words/fixed', ext: ['xps', 'oxps', 'ofd'] },
  { name: t('Hangul', '韩文 Hangul'), viewer: ['words/hwpx', 'words/hwp'], ext: ['hwpx', 'hwp'] },
  { name: t('Ebooks & comics', '电子书和漫画'), viewer: ['words/books', 'archives/archive', 'words/palmdoc'], ext: ['epub', 'mobi', 'azw3', 'fb2', 'fbz', 'cbz', 'cbr', 'cb7', 'pdb'] },
  { name: t('Email', '邮件'), viewer: 'words/email', ext: ['eml', 'msg', 'mbox', 'mht', 'mhtml'] },
];

const TABLES = [
  { name: t('Spreadsheets', '表格'), viewer: 'words/sheets', ext: ['csv', 'tsv', 'tab', 'xlsx', 'xlsm', 'xltx', 'xlsb', 'xls', 'ods', 'fods', 'numbers', 'et', 'dif', 'slk', 'prn', 'dbf', 'wk1', 'qpw'] },
  { name: t('Databases', '数据库'), viewer: 'words/db', ext: ['mdb', 'accdb', 'sqlite', 'sqlite3', 'db'] },
];

const IMAGES = [
  { name: t('Photos & pictures', '照片和图片'), viewer: 'images/photo', ext: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'svgz'] },
  { name: t('iPhone photos (HEIC)', 'iPhone 照片（HEIC）'), viewer: 'images/photo', ext: ['heic', 'heif'] },
  { name: t('TIFF & Photoshop', 'TIFF 和 Photoshop'), viewer: 'images/photo', ext: ['tiff', 'tif', 'psd'] },
  { name: t('Camera RAW (preview)', '相机 RAW（预览）'), viewer: 'images/photo', ext: ['dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'pef', 'srw'] },
  { name: t('HDR & textures', 'HDR 和贴图'), viewer: 'images/photo', ext: ['exr', 'hdr', 'tga'] },
  { name: t('Medical scans (DICOM)', '医学影像（DICOM）'), viewer: 'images/photo', ext: ['dcm'] },
];

const DRAWINGS = [
  { name: t('CAD drawings', 'CAD 图纸'), viewer: 'drawings/dxf', ext: ['dwg', 'dxf'] },
  { name: t('3D models', '3D 模型'), viewer: 'drawings/model', ext: ['stl', 'obj', 'ply', 'glb', 'gltf', '3mf', 'fbx'] },
  { name: t('CAD & BIM models', 'CAD 和 BIM 模型'), viewer: 'drawings/model', ext: ['step', 'stp', 'iges', 'igs', 'brep', 'ifc'] },
  { name: t('Diagrams', '图表'), viewer: ['drawings/preview', 'drawings/mindmap'], ext: ['vsdx', 'odg', 'xmind'] },
];

const SOUNDS = [
  { name: t('Music & sound', '音乐和音频'), viewer: 'sounds/audio', ext: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'weba', 'aiff'] },
];

const VIDEOS = [
  { name: t('Videos', '视频'), viewer: 'videos/video', ext: ['mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv'] },
  // MPEG-TS '.ts' video is recognised by content; the extension itself belongs to TypeScript here.
  { name: t('FLV & MPEG-TS (H.264)', 'FLV 和 MPEG-TS（H.264）'), viewer: 'videos/video', ext: ['flv', 'm2ts'] },
];

const DATA = [{ name: t('COMTRADE fault records', 'COMTRADE 故障录波'), viewer: 'data/comtrade', ext: ['cfg', 'dat', 'cff'] }];

const ARCHIVES = [
  { name: t('Archives', '压缩包'), viewer: 'archives/archive', ext: ['zip', '7z', 'rar', 'tar', 'tgz', 'xz', 'bz2', 'zst', 'cab', 'iso'] },
  { name: t('GZIP', 'GZIP'), viewer: 'archives/gzip', ext: ['gz'] },
];

const COMING = [
  { name: t('More images', '更多图片'), ext: ['jxl', 'jp2', 'dds', 'ktx2'] },
  { name: t('More audio & video (details only for now)', '更多音视频（暂只显示信息）'), ext: ['wma', 'ape', 'amr', 'mid', 'avi', 'wmv', 'rmvb', 'mpg'] },
  { name: t('More drawings', '更多图纸'), ext: ['vsd', 'kmz', 'skp'] },
  { name: t('System logs', '系统日志'), ext: ['evtx', 'plist', 'journal', 'pcap'] },
  { name: t('More documents & data', '更多文档和数据'), ext: ['chm', 'djvu', 'parquet', 'h5', 'mat', 'pst'] },
];

/** Code & settings, read from the code viewer's extension table (grouped by its section comments). */
function codeGroups(root) {
  const src = readFileSync(join(root, 'src/categories/words/code/languages.ts'), 'utf8');
  const block = src.slice(src.indexOf('const CODE'), src.indexOf('};', src.indexOf('const CODE')));
  const json = /JSON_EXT = new Set\(\[([^\]]+)\]/.exec(src)?.[1].match(/'([^']+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
  const SECTIONS = {
    Web: t('Web', '网页'),
    'General purpose': t('Programming', '编程语言'),
    'No highlighter yet': t('Programming', '编程语言'),
    'Industrial / engineering': t('Industrial & engineering', '工业和工程'),
    'Shell / scripts': t('Scripts', '脚本'),
    'Data / config': t('Data & settings', '数据和配置'),
  };
  // Extensions that belong to (or are shared with) another group on this page.
  const elsewhere = new Set(['key', 'pub', 'cfg', 'mat', 'ps', 'nc', 'fb2', 'svg', 'dxf', 'obj', 'step', 'stp', 'p21', 'ifc']);
  const groups = new Map();
  let section = null;
  for (const line of block.split('\n')) {
    const comment = /^\s*\/\/\s*([^:]+?)(:|$)/.exec(line);
    if (comment && SECTIONS[comment[1].trim()]) {
      section = SECTIONS[comment[1].trim()];
      continue;
    }
    if (!section) continue;
    for (const m of line.matchAll(/\b([a-z0-9_+-]+):\s*'/g)) {
      if (elsewhere.has(m[1])) continue;
      const key = section.en;
      if (!groups.has(key)) groups.set(key, { name: section, viewer: 'words/code', ext: [] });
      groups.get(key).ext.push(m[1]);
    }
  }
  groups.get('Data & settings')?.ext.unshift(...json.filter((e) => e !== 'fb2'));
  return [...groups.values()].map((g) => ({ ...g, ext: [...new Set(g.ext)] }));
}

export function formatsCatalog(root = process.cwd()) {
  return [
    { id: 'words', name: t('Documents & ebooks', '文档和电子书'), groups: WORDS },
    { id: 'tables', name: t('Tables & databases', '表格和数据库'), groups: TABLES },
    { id: 'images', name: t('Images', '图片'), groups: IMAGES },
    { id: 'drawings', name: t('Drawings & 3D', '图纸和 3D'), groups: DRAWINGS },
    { id: 'sounds', name: t('Sounds', '音频'), groups: SOUNDS },
    { id: 'videos', name: t('Videos', '视频'), groups: VIDEOS },
    { id: 'code', name: t('Code & settings', '代码和配置'), groups: codeGroups(root) },
    { id: 'data', name: t('Engineering data', '工程数据'), groups: DATA },
    { id: 'archives', name: t('Archives', '压缩包'), groups: ARCHIVES },
    { id: 'coming', name: t('Coming', '即将支持'), coming: true, groups: COMING },
  ];
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const both = (x) => `<span data-en="${esc(x.en)}" data-zh="${esc(x.zh)}">${esc(x.en)}</span>`;

/** The format list as static HTML (readable without JavaScript, and by search engines). */
export function formatsHtml(root = process.cwd()) {
  const cats = formatsCatalog(root);
  const supported = new Set(cats.filter((c) => !c.coming).flatMap((c) => c.groups.flatMap((g) => g.ext)));
  const sections = cats
    .map(
      (c) => `
      <section class="fmt-cat${c.coming ? ' fmt-coming' : ''}" id="${c.id}">
        <h2>${both(c.name)}${c.coming ? '' : ` <span class="fmt-count">${new Set(c.groups.flatMap((g) => g.ext)).size}</span>`}</h2>
        ${c.groups
          .map(
            (g) => `
        <div class="fmt-group">
          <div class="fmt-name">${both(g.name)}</div>
          <div class="fmt-exts">${g.ext.map((e) => `<span class="fmt-ext">.${esc(e)}</span>`).join('')}</div>
        </div>`,
          )
          .join('')}
      </section>`,
    )
    .join('');
  return { html: sections, count: supported.size };
}
