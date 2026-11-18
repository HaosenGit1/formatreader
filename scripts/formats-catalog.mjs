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
  { name: t('XBRL financial reports (XBRL, Inline XBRL: SEC, ESEF/EU, Companies House)', 'XBRL 财报（XBRL、Inline XBRL：SEC、欧盟 ESEF、英国 Companies House）'), viewer: 'words/xbrl', ext: ['xbrl'] },
  { name: t('Bank statements (MT940, camt.053, OFX/QFX/QBO, BAI2)', '银行流水（MT940、camt.053、OFX/QFX/QBO、BAI2）'), viewer: 'words/bank', ext: ['sta', '940', 'mt940', 'ofx', 'qfx', 'qbo', 'bai', 'bai2'] },
  { name: t('E-invoices (China 数电票, UBL/Peppol, ZUGFeRD/Factur-X)', '电子发票（数电票、UBL/Peppol、ZUGFeRD/Factur-X）'), viewer: ['words/invoice', 'words/code'], ext: ['xml'] },
];

const TABLES = [
  { name: t('Spreadsheets', '表格'), viewer: 'words/sheets', ext: ['csv', 'tsv', 'tab', 'xlsx', 'xlsm', 'xltx', 'xlsb', 'xls', 'ods', 'fods', 'numbers', 'et', 'dif', 'slk', 'prn', 'dbf', 'wk1', 'qpw'] },
  { name: t('Databases', '数据库'), viewer: 'words/db', ext: ['mdb', 'accdb', 'sqlite', 'sqlite3', 'db'] },
];

const IMAGES = [
  { name: t('Photos & pictures', '照片和图片'), viewer: 'images/photo', ext: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'svgz'] },
  { name: t('iPhone photos (HEIC)', 'iPhone 照片（HEIC）'), viewer: 'images/photo', ext: ['heic', 'heif'] },
  { name: t('TIFF & Photoshop', 'TIFF 和 Photoshop'), viewer: 'images/photo', ext: ['tiff', 'tif', 'psd'] },
  { name: t('Phone photos: iPhone, Samsung, Huawei, Pixel, Xiaomi (incl. motion photos, ProRAW/DNG)', '手机照片：iPhone、三星、华为、Pixel、小米（含动态照片、ProRAW/DNG）'), viewer: 'images/photo', ext: ['jpg', 'heic', 'heif', 'dng', 'avif'] },
  { name: t('Camera RAW (preview): Canon, Nikon, Sony, Fujifilm, Olympus/OM, Panasonic, Leica, Pentax, Hasselblad, Phase One, Sigma, Kodak, GoPro…', '相机 RAW（预览）：佳能、尼康、索尼、富士、奥林巴斯/OM、松下、徕卡、宾得、哈苏、飞思、适马、柯达、GoPro…'), viewer: 'images/photo', ext: ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'arq', 'srf', 'sr2', 'raf', 'orf', 'ori', 'rw2', 'raw', 'rwl', 'pef', 'srw', 'x3f', '3fr', 'fff', 'iiq', 'cap', 'eip', 'erf', 'kdc', 'dcr', 'dcs', 'mos', 'mef', 'mrw', 'gpr'] },
  { name: t('Animations: GIF, APNG, animated WebP, Lottie (.json/.lottie), Telegram stickers (.tgs), Flash (.swf)', '动画：GIF、APNG、动态 WebP、Lottie（.json/.lottie）、Telegram 贴纸（.tgs）、Flash（.swf）'), viewer: ['images/photo', 'images/anim', 'archives/gzip'], ext: ['gif', 'apng', 'webp', 'lottie', 'tgs', 'swf'] },
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
  { name: t('Short-video apps: TikTok/抖音, Instagram, 快手, YouTube, 小红书, 视频号, B站 (incl. B站 cache video.m4s + audio.m4s, .m3u8 + pieces in a dropped folder)', '短视频平台：抖音/TikTok、Instagram、快手、YouTube、小红书、视频号、B站（含 B站缓存 video.m4s + audio.m4s、拖入文件夹的 .m3u8 + 分段）'), viewer: ['videos/video', 'words/text', 'words/code'], ext: ['mp4', 'webm', 'mov', 'm4s', 'f4v', 'blv', 'm3u8'] },
  { name: t('Encrypted video-app downloads (explained): 爱奇艺 .qsv, 优酷 .kux, 腾讯视频 .qlv, 迅雷 .xv', '视频 App 的加密下载（给出说明）：爱奇艺 .qsv、优酷 .kux、腾讯视频 .qlv、迅雷 .xv'), viewer: 'videos/video', ext: ['qsv', 'kux', 'qlv', 'xv'] },
  { name: t('Phone, action-camera and drone videos (iPhone, Android, GoPro, Insta360, DJI)', '手机、运动相机和无人机视频（iPhone、安卓、GoPro、Insta360、大疆）'), viewer: 'videos/video', ext: ['mov', 'mp4', 'lrv', 'insv'] },
  // MPEG-TS '.ts' video is recognised by content; the extension itself belongs to TypeScript here.
  { name: t('FLV & MPEG-TS (H.264)', 'FLV 和 MPEG-TS（H.264）'), viewer: 'videos/video', ext: ['flv', 'm2ts'] },
  { name: t('AVI from cameras, CCTV & dashcams (MJPEG, H.264)', '相机、监控和行车记录仪的 AVI（MJPEG、H.264）'), viewer: 'videos/video', ext: ['avi'] },
];

const DATA = [{ name: t('COMTRADE fault records', 'COMTRADE 故障录波'), viewer: 'data/comtrade', ext: ['cfg', 'dat', 'cff'] }];

const ARCHIVES = [
  { name: t('Archives', '压缩包'), viewer: 'archives/archive', ext: ['zip', '7z', 'rar', 'tar', 'tgz', 'xz', 'bz2', 'zst', 'cab', 'iso'] },
  { name: t('GZIP', 'GZIP'), viewer: 'archives/gzip', ext: ['gz'] },
];

const COMING = [
  { name: t('More images', '更多图片'), ext: ['jxl', 'jp2', 'dds', 'ktx2'] },
  { name: t('More audio & video, DivX/Xvid AVI (details only for now)', '更多音视频、DivX/Xvid 的 AVI（暂只显示信息）'), ext: ['wma', 'ape', 'amr', 'mid', 'wmv', 'rmvb', 'mpg'] },
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
