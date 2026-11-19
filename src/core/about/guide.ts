/**
 * "About this file": what each format is, where it usually comes from, and how to open it
 * correctly *without* FormatReader. For text, the same for its character encoding (乱码 help):
 * the exact menu names in Excel, Notepad++, VS Code, TextEdit, plus iconv and Python.
 *
 * Texts are [English, 中文]. Menu names stay in English (that is what the apps show in most
 * countries; Chinese Excel shows the same code-page numbers).
 */
export type T = [string, string];

export interface OpenWay {
  on: T;
  how: T;
}

export interface FormatGuide {
  from: T;
  open: OpenWay[];
  /** Extra advice (e.g. how to avoid the problem next time). */
  tip?: T;
}

const WIN: T = ['Windows', 'Windows'];
const MAC: T = ['Mac', 'Mac'];
const PHONE: T = ['iPhone / Android', 'iPhone / 安卓'];
const ANY: T = ['Any computer', '任何电脑'];
const LINUX: T = ['Linux', 'Linux'];
const ONLINE: T = ['Online', '在线'];

const way = (on: T, en: string, zh: string): OpenWay => ({ on, how: [en, zh] });

const VLC = way(ANY, 'VLC (free, plays almost everything; also on phones)', 'VLC（免费，几乎什么都能播放，手机上也有）');
const HANDBRAKE = way(ANY, 'To get an MP4 that plays everywhere: convert it with HandBrake (free)', '想得到到处都能播放的 MP4：用 HandBrake（免费）转换');
const SEVENZIP = way(WIN, '7-Zip (free) or Windows Explorer', '7-Zip（免费）或 Windows 资源管理器');
const UNARCHIVER = way(MAC, 'The Unarchiver or Keka (free)', 'The Unarchiver 或 Keka（免费）');
const LIBRE = (what: string, zh: string) => way(ANY, `LibreOffice ${what} (free)`, `LibreOffice ${zh}（免费）`);

const word: FormatGuide = {
  from: ['Microsoft Word, the most common document format.', 'Microsoft Word，最常见的文档格式。'],
  open: [way(ANY, 'Microsoft Word, WPS Office', 'Microsoft Word、WPS Office'), way(MAC, 'Pages (free on Mac)', 'Pages（Mac 自带免费）'), LIBRE('Writer', 'Writer'), way(ONLINE, 'Google Docs, Word for the web', 'Google 文档、网页版 Word'), way(PHONE, 'Word app, WPS app, or the Files app preview', 'Word、WPS 应用，或“文件”应用预览')],
};
const oldWord: FormatGuide = { ...word, from: ['Microsoft Word 97–2003 (the old binary .doc format).', 'Microsoft Word 97–2003（旧的二进制 .doc 格式）。'], tip: ['To keep it readable for years, save a copy as .docx or PDF.', '为了长期可读，建议另存为 .docx 或 PDF。'] };
const excel: FormatGuide = {
  from: ['Microsoft Excel workbook.', 'Microsoft Excel 工作簿。'],
  open: [way(ANY, 'Microsoft Excel, WPS Office', 'Microsoft Excel、WPS Office'), way(MAC, 'Numbers (free on Mac)', 'Numbers（Mac 自带免费）'), LIBRE('Calc', 'Calc'), way(ONLINE, 'Google Sheets, Excel for the web', 'Google 表格、网页版 Excel'), way(PHONE, 'Excel app, WPS app', 'Excel、WPS 应用')],
};
const ppt: FormatGuide = {
  from: ['Microsoft PowerPoint presentation.', 'Microsoft PowerPoint 演示文稿。'],
  open: [way(ANY, 'Microsoft PowerPoint, WPS Office', 'Microsoft PowerPoint、WPS Office'), way(MAC, 'Keynote (free on Mac)', 'Keynote（Mac 自带免费）'), LIBRE('Impress', 'Impress'), way(ONLINE, 'Google Slides', 'Google 幻灯片')],
};
const odf: FormatGuide = {
  from: ['OpenDocument: LibreOffice / OpenOffice, the ISO standard office format used by many governments.', 'OpenDocument：LibreOffice / OpenOffice 的格式，许多政府采用的 ISO 标准办公格式。'],
  open: [LIBRE('', ''), way(ANY, 'Microsoft Office and WPS also open it', 'Microsoft Office 和 WPS 也能打开'), way(ONLINE, 'Google Docs / Sheets / Slides', 'Google 文档 / 表格 / 幻灯片')],
};
const iwork: FormatGuide = {
  from: ['Apple Pages / Numbers / Keynote (Mac, iPhone, iPad).', 'Apple 的 Pages / Numbers / Keynote（Mac、iPhone、iPad）。'],
  open: [way(MAC, 'Pages, Numbers or Keynote (free)', 'Pages、Numbers 或 Keynote（免费）'), way(ONLINE, 'iCloud.com in any browser (free Apple ID)', '任何浏览器打开 iCloud.com（免费 Apple ID）'), way(WIN, 'Ask the sender to export to Word / Excel / PowerPoint or PDF', '请发送者导出为 Word / Excel / PowerPoint 或 PDF')],
};
const wps: FormatGuide = {
  from: ['Kingsoft WPS Office (very common in China). Old .wps can also be Microsoft Works.', '金山 WPS Office（中国很常用）。旧的 .wps 也可能是 Microsoft Works。'],
  open: [way(ANY, 'WPS Office (free)', 'WPS Office（免费）'), LIBRE('', ''), way(WIN, 'Microsoft Office opens most WPS files', 'Microsoft Office 能打开大多数 WPS 文件')],
};
const pdf: FormatGuide = {
  from: ['PDF: the universal fixed-layout document; prints the same everywhere.', 'PDF：通用的版式文档，在哪里打印都一样。'],
  open: [way(ANY, 'Any web browser, Adobe Acrobat Reader', '任何网页浏览器、Adobe Acrobat Reader'), way(MAC, 'Preview', '预览'), way(PHONE, 'Files app / any PDF app', '“文件”应用 / 任何 PDF 应用')],
};
const ebook = (from: T, extra: OpenWay[] = []): FormatGuide => ({
  from,
  open: [...extra, way(ANY, 'Calibre (free: reads and converts most ebook formats)', 'Calibre（免费：能阅读并转换大多数电子书格式）'), way(WIN, 'SumatraPDF (free: EPUB, MOBI, CBZ, CHM, DjVu, XPS)', 'SumatraPDF（免费：EPUB、MOBI、CBZ、CHM、DjVu、XPS）')],
});
const kindle = ebook(['Amazon Kindle ebook.', '亚马逊 Kindle 电子书。'], [way(ANY, 'Kindle app or Kindle device (books bought from Amazon are locked to your account)', 'Kindle 应用或 Kindle 设备（在亚马逊购买的书绑定账户）')]);
const comic = ebook(['Comic book: the pages are pictures inside an archive (CBZ = zip, CBR = rar, CB7 = 7z).', '漫画：每页是一张图片，装在压缩包里（CBZ = zip，CBR = rar，CB7 = 7z）。'], [way(WIN, 'CDisplayEx, YACReader', 'CDisplayEx、YACReader'), way(PHONE, 'Panels, Chunky, ComicScreen', 'Panels、Chunky、ComicScreen')]);
const archive = (from: T, extra: OpenWay[] = []): FormatGuide => ({
  from,
  open: [...extra, SEVENZIP, UNARCHIVER, way(LINUX, 'Built in (tar, unzip, 7z)', '系统自带（tar、unzip、7z）')],
  tip: ['If file names inside show garbled text (zip made on Chinese/Japanese Windows): on Mac use The Unarchiver, which asks for the encoding; on Linux: unzip -O GBK file.zip', '如果里面的文件名是乱码（在中文/日文 Windows 上打包的 zip）：Mac 上用 The Unarchiver，它会询问编码；Linux 上：unzip -O GBK 文件.zip'],
});
const image = (from: T, extra: OpenWay[] = []): FormatGuide => ({
  from,
  open: [...extra, way(WIN, 'Photos', '照片'), way(MAC, 'Preview / Photos', '预览 / 照片'), way(ANY, 'Any web browser', '任何网页浏览器')],
});
const raw: FormatGuide = {
  from: ['Camera RAW: the untouched sensor data from a digital camera (Canon, Nikon, Sony, Fujifilm…).', '相机 RAW：数码相机（佳能、尼康、索尼、富士……）未经处理的传感器数据。'],
  open: [way(ANY, 'Adobe Lightroom / Photoshop; free: darktable, RawTherapee', 'Adobe Lightroom / Photoshop；免费：darktable、RawTherapee'), way(MAC, 'Preview and Photos (built in)', '预览和照片（系统自带）'), way(WIN, 'Photos with Microsoft’s free “Raw Image Extension”', '照片 + 微软免费的“Raw Image Extension”')],
};
const audio = (from: T, extra: OpenWay[] = []): FormatGuide => ({ from, open: [...extra, VLC] });
const video = (from: T, extra: OpenWay[] = []): FormatGuide => ({ from, open: [...extra, VLC, HANDBRAKE] });
const cad3d = (from: T, extra: OpenWay[] = []): FormatGuide => ({ from, open: [...extra, way(ANY, 'FreeCAD or Blender (free)', 'FreeCAD 或 Blender（免费）'), way(ONLINE, 'Autodesk Viewer (free, in the browser)', 'Autodesk Viewer（免费，在浏览器中）')] });
const font: FormatGuide = { from: ['A font file.', '字体文件。'], open: [way(WIN, 'Double-click: preview and Install', '双击：预览并安装'), way(MAC, 'Double-click: Font Book', '双击：字体册')] };
const program: FormatGuide = { from: ['A program, not a document. Only run programs you trust.', '这是程序，不是文档。只运行你信任的程序。'], open: [way(ANY, 'Run it only on the system it was made for', '只在它对应的系统上运行')] };

export const FORMAT_GUIDES: Record<string, FormatGuide> = {
  docx: word, doc: oldWord, dot: oldWord, ole: oldWord,
  xlsx: excel, xlsb: excel, xls: { ...excel, from: ['Microsoft Excel 97–2003 workbook (old binary format).', 'Microsoft Excel 97–2003 工作簿（旧二进制格式）。'] },
  pptx: ppt, ppt, pps: ppt, pot: ppt,
  odt: odf, ods: odf, odp: odf, odg: odf,
  pages: iwork, numbers: iwork, key: iwork, iwork,
  wps, et: wps, dps: wps,
  pdf,
  rtf: { from: ['Rich Text Format: simple formatted text, readable by almost every word processor.', 'RTF 富文本：简单的带格式文本，几乎所有文字处理软件都能读。'], open: [way(WIN, 'Word, WordPad', 'Word、写字板'), way(MAC, 'TextEdit, Pages', '文本编辑、Pages'), LIBRE('Writer', 'Writer')] },
  ofd: { from: ['OFD: China’s national fixed-layout document standard (e-invoices, government documents).', 'OFD：中国国家版式文档标准（电子发票、公文）。'], open: [way(WIN, 'An OFD reader such as 数科 OFD 阅读器 or Foxit OFD', 'OFD 阅读器，例如数科 OFD 阅读器或福昕 OFD'), way(ONLINE, 'The e-invoice platform where it was issued can also give a PDF', '开票平台通常也能下载 PDF 版本')] },
  xps: { from: ['XPS: Microsoft’s fixed-layout document (from “Print to XPS”).', 'XPS：微软的版式文档（来自“打印到 XPS”）。'], open: [way(WIN, 'XPS Viewer (Windows optional feature)', 'XPS 查看器（Windows 可选功能）'), way(ANY, 'SumatraPDF (free)', 'SumatraPDF（免费）')] },
  oxps: { from: ['OpenXPS: Windows 8+ “Print to XPS”.', 'OpenXPS：Windows 8 及以上的“打印到 XPS”。'], open: [way(WIN, 'XPS Viewer, SumatraPDF', 'XPS 查看器、SumatraPDF')] },
  hwp: { from: ['Hangul (HWP): the standard word processor of Korea (government, schools).', 'Hangul（HWP）：韩国的标准文字处理软件（政府、学校）。'], open: [way(ANY, 'Hancom Office / Hancom Docs; free Hancom viewer', 'Hancom Office / Hancom Docs；免费的 Hancom 阅读器'), LIBRE('Writer (older HWP)', 'Writer（旧版 HWP）')] },
  hwpx: { from: ['Hangul HWPX: the newer, open Korean document format.', 'Hangul HWPX：较新的开放韩文文档格式。'], open: [way(ANY, 'Hancom Office / Hancom Docs', 'Hancom Office / Hancom Docs')] },
  wpd: { from: ['WordPerfect (Corel), common in law offices.', 'WordPerfect（Corel），律师事务所常用。'], open: [way(WIN, 'WordPerfect', 'WordPerfect'), LIBRE('Writer', 'Writer')] },
  msg: { from: ['An e-mail saved from Microsoft Outlook (Windows).', '从 Microsoft Outlook（Windows）保存的邮件。'], open: [way(ANY, 'Outlook (Windows or Mac)', 'Outlook（Windows 或 Mac）'), way(ANY, 'Ask the sender to forward the mail or save it as .eml', '请发送者转发邮件或另存为 .eml')] },
  eml: { from: ['A single e-mail (standard format).', '一封邮件（标准格式）。'], open: [way(ANY, 'Outlook, Apple Mail, Thunderbird', 'Outlook、Apple 邮件、Thunderbird')] },
  mbox: { from: ['A whole mailbox (many e-mails), e.g. from Gmail Takeout or Thunderbird.', '整个邮箱（很多封邮件），例如来自 Gmail 导出或 Thunderbird。'], open: [way(ANY, 'Thunderbird (Import), Apple Mail (Import Mailboxes)', 'Thunderbird（导入）、Apple 邮件（导入邮箱）')] },
  epub: ebook(['EPUB: the standard ebook format (reflowable text).', 'EPUB：标准电子书格式（可重排文字）。'], [way(MAC, 'Books', '图书'), way(PHONE, 'Apple Books, Google Play Books', 'Apple 图书、Google Play 图书'), way(WIN, 'Thorium Reader (free)', 'Thorium Reader（免费）')]),
  mobi: kindle, azw: kindle, azw3: kindle, kfx: kindle,
  fb2: ebook(['FictionBook: an XML ebook format popular in Russia and Eastern Europe.', 'FictionBook：在俄罗斯和东欧流行的 XML 电子书格式。'], [way(ANY, 'FBReader', 'FBReader')]), fbz: ebook(['FictionBook (zipped).', 'FictionBook（压缩）。'], [way(ANY, 'FBReader', 'FBReader')]),
  pdb: ebook(['PalmDoc: an old Palm Pilot ebook.', 'PalmDoc：旧的 Palm 掌上电脑电子书。']),
  umd: ebook(['UMD: an old Chinese mobile-phone ebook format.', 'UMD：旧的中文手机电子书格式。']),
  lit: ebook(['Microsoft Reader ebook (discontinued 2012).', 'Microsoft Reader 电子书（2012 年停用）。']),
  cbz: comic, cbr: comic, cb7: comic,
  chm: ebook(['CHM: Windows compiled help / old ebooks.', 'CHM：Windows 编译帮助文件 / 旧电子书。'], [way(WIN, 'Double-click (Windows HTML Help, built in)', '双击打开（Windows 自带 HTML 帮助）')]),
  djvu: ebook(['DjVu: scanned books and documents, smaller than PDF.', 'DjVu：扫描书籍和文档，比 PDF 小。'], [way(ANY, 'DjView (free)', 'DjView（免费）')]),
  ps: { from: ['PostScript: the printer language behind PDF.', 'PostScript：PDF 背后的打印机语言。'], open: [way(ANY, 'Ghostscript / GSview; or convert to PDF', 'Ghostscript / GSview；或转换为 PDF')] },
  mdb: { from: ['Microsoft Access database (97–2003); also used by many industrial and SCADA tools for settings and logs.', 'Microsoft Access 数据库（97–2003）；很多工业和 SCADA 软件也用它保存配置和记录。'], open: [way(WIN, 'Microsoft Access', 'Microsoft Access'), way(MAC, 'MDB Viewer apps', 'MDB Viewer 类应用'), way(LINUX, 'mdbtools (mdb-tables, mdb-export)', 'mdbtools（mdb-tables、mdb-export）'), LIBRE('Base', 'Base')] },
  accdb: { from: ['Microsoft Access database (2007 and later).', 'Microsoft Access 数据库（2007 及以后）。'], open: [way(WIN, 'Microsoft Access', 'Microsoft Access'), way(LINUX, 'mdbtools', 'mdbtools')] },
  sqlite: { from: ['SQLite database: inside countless apps, phones and browsers.', 'SQLite 数据库：无数应用、手机和浏览器内部都在用。'], open: [way(ANY, 'DB Browser for SQLite (free)', 'DB Browser for SQLite（免费）'), way(ANY, 'sqlite3 command line', 'sqlite3 命令行')] },
  dbf: { from: ['dBASE / FoxPro table: old databases, GIS shapefiles, accounting software.', 'dBASE / FoxPro 表：旧数据库、GIS 矢量数据、财务软件。'], open: [LIBRE('Calc', 'Calc'), way(WIN, 'Excel opens DBF', 'Excel 可以打开 DBF')], tip: ['DBF text is often in the local code page (e.g. GBK); LibreOffice asks for the character set.', 'DBF 中的文字通常是本地编码（如 GBK）；LibreOffice 会让你选择字符集。'] },
  lotus: { from: ['Lotus 1-2-3 spreadsheet (1980s–90s).', 'Lotus 1-2-3 表格（1980–90 年代）。'], open: [LIBRE('Calc', 'Calc')] },
  qpw: { from: ['Quattro Pro spreadsheet (Corel).', 'Quattro Pro 表格（Corel）。'], open: [LIBRE('Calc', 'Calc')] },
  pub: { from: ['Microsoft Publisher.', 'Microsoft Publisher。'], open: [way(WIN, 'Publisher', 'Publisher'), LIBRE('Draw', 'Draw')] },
  mpp: { from: ['Microsoft Project plan.', 'Microsoft Project 项目计划。'], open: [way(WIN, 'Microsoft Project', 'Microsoft Project'), way(ANY, 'ProjectLibre (free)', 'ProjectLibre（免费）')] },
  comtrade: { from: ['COMTRADE (IEEE C37.111): fault and disturbance records from protection relays, fault recorders and wind-turbine/plant controllers.', 'COMTRADE（IEEE C37.111）：保护继电器、故障录波器以及风机/电站控制器的故障和扰动录波。'], open: [way(WIN, 'SEL’s free TOP (The Output Processor), Siemens SIGRA, Wavewin', 'SEL 的免费 TOP、西门子 SIGRA、Wavewin'), way(ANY, 'Python: the comtrade package', 'Python：comtrade 库')], tip: ['Keep the .cfg and .dat files together with the same name.', '请把同名的 .cfg 和 .dat 文件放在一起。'] },

  jpg: image(['JPEG photo: phones, cameras, the web.', 'JPEG 照片：手机、相机、网页。']),
  png: image(['PNG image: screenshots and graphics (lossless).', 'PNG 图片：截图和图形（无损）。']),
  gif: image(['GIF image (often animated).', 'GIF 图片（常为动图）。']),
  webp: image(['WebP image: Google’s web image format.', 'WebP 图片：Google 的网页图片格式。']),
  avif: image(['AVIF image: the newest web image format.', 'AVIF 图片：最新的网页图片格式。'], [way(WIN, 'Photos with the free “AV1 Video Extension”', '照片 + 免费的“AV1 Video Extension”')]),
  bmp: image(['Bitmap: uncompressed Windows image.', '位图：未压缩的 Windows 图片。']),
  ico: image(['Icon file (Windows / websites).', '图标文件（Windows / 网站）。']),
  heic: image(['HEIC: the default photo format of iPhones (High Efficiency).', 'HEIC：iPhone 默认的照片格式（高效）。'], [way(WIN, 'Photos with Microsoft’s “HEIF Image Extensions” + “HEVC Video Extensions” (Store)', '照片 + 微软应用商店的“HEIF 图像扩展”和“HEVC 视频扩展”'), way(PHONE, 'To send JPEG instead: iPhone Settings → Camera → Formats → Most Compatible, or Settings → Photos → Transfer to Mac or PC → Automatic', '想直接得到 JPEG：iPhone 设置 → 相机 → 格式 → 兼容性最佳；或 设置 → 照片 → 传输到 Mac 或 PC → 自动')]),
  tiff: image(['TIFF: scanners, faxes, printing and archives.', 'TIFF：扫描仪、传真、印刷和档案。'], [way(ANY, 'GIMP (free), Photoshop', 'GIMP（免费）、Photoshop')]),
  psd: { from: ['Adobe Photoshop document (with layers).', 'Adobe Photoshop 文档（带图层）。'], open: [way(ANY, 'Photoshop; GIMP (free)', 'Photoshop；GIMP（免费）'), way(ONLINE, 'Photopea (free, in the browser)', 'Photopea（免费，在浏览器中）'), way(MAC, 'Preview (flattened)', '预览（合并图层）')] },
  cr3: raw, raf: raw, dng: raw, cr2: raw, nef: raw, arw: raw, orf: raw, rw2: raw, pef: raw, srw: raw,
  exr: { from: ['OpenEXR: high-dynamic-range images from film and 3D rendering.', 'OpenEXR：电影和三维渲染的高动态范围图片。'], open: [way(ANY, 'Photoshop, GIMP, Blender, Affinity Photo', 'Photoshop、GIMP、Blender、Affinity Photo')] },
  hdr: { from: ['Radiance HDR: lighting / environment maps for 3D.', 'Radiance HDR：三维用的光照 / 环境贴图。'], open: [way(ANY, 'Photoshop, GIMP, Blender', 'Photoshop、GIMP、Blender')] },
  tga: { from: ['Targa image: games and 3D textures.', 'Targa 图片：游戏和三维贴图。'], open: [way(ANY, 'GIMP (free), Photoshop', 'GIMP（免费）、Photoshop')] },
  dcm: { from: ['DICOM: medical scans (CT, MRI, X-ray, ultrasound) from hospitals.', 'DICOM：医院的医学影像（CT、MRI、X 光、超声）。'], open: [way(WIN, 'RadiAnt, MicroDicom (free viewer)', 'RadiAnt、MicroDicom（免费阅读器）'), way(MAC, 'Horos, OsiriX Lite', 'Horos、OsiriX Lite'), way(ANY, 'Weasis (free); the viewer on the hospital’s CD', 'Weasis（免费）；医院光盘里自带的阅读器')] },
  svg: image(['SVG: vector graphics (logos, icons, diagrams).', 'SVG：矢量图形（标志、图标、图表）。'], [way(ANY, 'Inkscape (free), Illustrator', 'Inkscape（免费）、Illustrator')]),
  svgz: image(['SVG vector graphics, gzip-compressed.', 'SVG 矢量图形（gzip 压缩）。'], [way(ANY, 'Inkscape (free)', 'Inkscape（免费）')]),
  jxl: image(['JPEG XL: a new photo format.', 'JPEG XL：新的照片格式。']),
  jp2: image(['JPEG 2000: archives, maps and medical images.', 'JPEG 2000：档案、地图和医学影像。'], [way(ANY, 'GIMP (free), IrfanView (Windows)', 'GIMP（免费）、IrfanView（Windows）')]),

  dwg: { from: ['AutoCAD drawing: the standard 2D/3D CAD format (engineering, architecture, plant layouts).', 'AutoCAD 图纸：标准的二维/三维 CAD 格式（工程、建筑、电站布置）。'], open: [way(WIN, 'Autodesk DWG TrueView (free), AutoCAD, 中望CAD / GstarCAD', 'Autodesk DWG TrueView（免费）、AutoCAD、中望CAD / 浩辰CAD'), way(ONLINE, 'Autodesk Viewer (free, in the browser)', 'Autodesk Viewer（免费，在浏览器中）'), way(MAC, 'AutoCAD for Mac, DraftSight', 'AutoCAD for Mac、DraftSight')], tip: ['Garbled text or “?” in DWG usually means a missing font (SHX / big font): install the font or choose a substitute (e.g. gbcbig.shx for Chinese).', 'DWG 中文字乱码或“？”通常是缺少字体（SHX / 大字体）：安装字体或指定替换字体（中文常用 gbcbig.shx）。'] },
  dxf: { from: ['DXF: AutoCAD’s exchange format for drawings.', 'DXF：AutoCAD 的图纸交换格式。'], open: [way(ANY, 'LibreCAD, QCAD (free), AutoCAD, DWG TrueView', 'LibreCAD、QCAD（免费）、AutoCAD、DWG TrueView')] },
  step: cad3d(['STEP: 3D models exchanged between mechanical CAD programs (SolidWorks, Inventor, CATIA, Creo, Fusion).', 'STEP：机械 CAD 软件（SolidWorks、Inventor、CATIA、Creo、Fusion）之间交换的三维模型。'], [way(WIN, 'eDrawings (free)', 'eDrawings（免费）')]),
  iges: cad3d(['IGES: an older 3D CAD exchange format.', 'IGES：较旧的三维 CAD 交换格式。']),
  stl: cad3d(['STL: 3D printing models.', 'STL：3D 打印模型。'], [way(ANY, 'Slicers: Cura, PrusaSlicer, Bambu Studio', '切片软件：Cura、PrusaSlicer、Bambu Studio'), way(MAC, 'Preview / Quick Look', '预览 / 快速查看')]),
  obj: cad3d(['OBJ: a common 3D model format.', 'OBJ：常见的三维模型格式。']),
  glb: cad3d(['glTF/GLB: 3D models for the web, AR and games.', 'glTF/GLB：用于网页、AR 和游戏的三维模型。'], [way(WIN, '3D Viewer', '3D 查看器')]),
  fbx: cad3d(['FBX: 3D models and animation (Autodesk, games).', 'FBX：三维模型和动画（Autodesk、游戏）。']),
  '3mf': cad3d(['3MF: modern 3D printing format.', '3MF：新的 3D 打印格式。'], [way(ANY, 'Cura, PrusaSlicer, Bambu Studio', 'Cura、PrusaSlicer、Bambu Studio')]),
  ifc: { from: ['IFC: open BIM building model (from Revit, ArchiCAD, Tekla).', 'IFC：开放的 BIM 建筑模型（来自 Revit、ArchiCAD、Tekla）。'], open: [way(WIN, 'BIMvision (free), Solibri Anywhere', 'BIMvision（免费）、Solibri Anywhere'), way(ANY, 'Blender + Bonsai (free)', 'Blender + Bonsai（免费）')] },
  vsd: { from: ['Microsoft Visio 2003–2010 diagram.', 'Microsoft Visio 2003–2010 图表。'], open: [way(WIN, 'Visio, Visio Viewer', 'Visio、Visio 查看器'), LIBRE('Draw', 'Draw')] },
  vsdx: { from: ['Microsoft Visio diagram (flowcharts, network and electrical diagrams).', 'Microsoft Visio 图表（流程图、网络图、电气图）。'], open: [way(WIN, 'Visio', 'Visio'), LIBRE('Draw', 'Draw'), way(ONLINE, 'draw.io / diagrams.net (free, imports VSDX)', 'draw.io / diagrams.net（免费，可导入 VSDX）')] },
  xmind: { from: ['XMind mind map.', 'XMind 思维导图。'], open: [way(ANY, 'XMind (free version)', 'XMind（有免费版）')] },
  kml: { from: ['Google Earth places, routes and areas (KML, XML text).', 'Google Earth 地点、路线和区域（KML，XML 文本）。'], open: [way(ANY, 'Google Earth Pro (free), Google Earth web, QGIS', 'Google Earth 专业版（免费）、网页版 Google Earth、QGIS')] },
  gpx: { from: ['GPS tracks and waypoints from GPS units, phones and sports apps.', '来自 GPS 设备、手机和运动 App 的轨迹和航点。'], open: [way(ANY, 'Google Earth Pro, QGIS, GPXSee (free)', 'Google Earth 专业版、QGIS、GPXSee（免费）')] },
  geojson: { from: ['GeoJSON: map features as JSON (web maps, GIS exports).', 'GeoJSON：JSON 格式的地图要素（网页地图、GIS 导出）。'], open: [way(ANY, 'QGIS (free), geojson.io in a browser', 'QGIS（免费）、浏览器中的 geojson.io')] },
  shp: { from: ['Esri Shapefile: GIS map data. The .shp holds shapes; the .dbf next to it holds the attributes, .prj the coordinate system — keep them together.', 'Esri Shapefile：GIS 地图数据。.shp 存图形，旁边的 .dbf 存属性，.prj 存坐标系——请放在一起。'], open: [way(ANY, 'QGIS (free), ArcGIS', 'QGIS（免费）、ArcGIS')] },
  kmz: { from: ['Google Earth places and routes (zipped KML).', 'Google Earth 地点和路线（压缩的 KML）。'], open: [way(ANY, 'Google Earth Pro (free), Google Earth web', 'Google Earth 专业版（免费）、网页版 Google Earth')] },

  mp3: audio(['MP3 audio.', 'MP3 音频。'], [way(ANY, 'Every music player', '所有音乐播放器')]),
  m4a: audio(['AAC audio (iPhone voice memos, iTunes).', 'AAC 音频（iPhone 语音备忘录、iTunes）。'], [way(ANY, 'Apple Music / iTunes, Windows Media Player', 'Apple 音乐 / iTunes、Windows Media Player')]),
  aac: audio(['AAC audio.', 'AAC 音频。']),
  wav: audio(['WAV: uncompressed audio (recorders, Windows).', 'WAV：未压缩音频（录音设备、Windows）。'], [way(ANY, 'Every music player; Audacity to edit (free)', '所有音乐播放器；用 Audacity 编辑（免费）')]),
  flac: audio(['FLAC: lossless compressed music.', 'FLAC：无损压缩音乐。'], [way(WIN, 'Windows Media Player (Windows 10+)', 'Windows Media Player（Windows 10 及以上）'), way(MAC, 'QuickTime / Finder preview', 'QuickTime / Finder 预览')]),
  aiff: audio(['AIFF: Apple’s uncompressed audio.', 'AIFF：苹果的未压缩音频。']),
  ogg: audio(['Ogg Vorbis audio (open format; games, Linux).', 'Ogg Vorbis 音频（开放格式；游戏、Linux）。']),
  opus: audio(['Opus audio (WhatsApp/Telegram voice messages, web calls).', 'Opus 音频（WhatsApp/Telegram 语音消息、网络通话）。']),
  wma: audio(['Windows Media Audio.', 'Windows Media 音频。'], [way(WIN, 'Windows Media Player', 'Windows Media Player')]),
  amr: audio(['AMR: phone voice recordings and voice messages.', 'AMR：手机录音和语音消息。']),
  mid: { from: ['MIDI: musical notes, not recorded sound (keyboards, music software).', 'MIDI：音符，不是录制的声音（电子琴、音乐软件）。'], open: [way(MAC, 'GarageBand', 'GarageBand'), way(ANY, 'MuseScore (free, shows the score)', 'MuseScore（免费，显示乐谱）'), VLC] },
  ra: audio(['RealAudio (1990s–2000s internet radio).', 'RealAudio（1990–2000 年代网络电台）。']),
  mka: audio(['Matroska audio.', 'Matroska 音频。']),

  mp4: video(['MP4 video: the most widely playable video.', 'MP4 视频：兼容性最好的视频格式。'], [way(ANY, 'Every video player and browser', '所有视频播放器和浏览器')]),
  mov: video(['QuickTime video (iPhone, Mac, cameras).', 'QuickTime 视频（iPhone、Mac、相机）。'], [way(MAC, 'QuickTime Player', 'QuickTime Player'), way(WIN, 'Media Player / Films & TV', '媒体播放器 / 电影和电视')]),
  webm: video(['WebM: the web’s open video format (screen recorders, YouTube).', 'WebM：网页的开放视频格式（录屏、YouTube）。']),
  mkv: video(['MKV (Matroska): films with several sound tracks and subtitles.', 'MKV（Matroska）：带多个音轨和字幕的影片。']),
  avi: video(['AVI: the classic Windows video container; still used by CCTV recorders, dashcams, old cameras.', 'AVI：经典的 Windows 视频格式；监控录像机、行车记录仪、老相机仍在使用。']),
  wmv: video(['Windows Media Video (Windows XP–7 era).', 'Windows Media 视频（Windows XP–7 时代）。'], [way(WIN, 'Windows Media Player', 'Windows Media Player')]),
  flv: video(['Flash video (2000s web video, old online courses).', 'Flash 视频（2000 年代的网络视频、旧网课）。']),
  rmvb: video(['RealMedia: very common for Chinese downloads in the 2000s.', 'RealMedia：2000 年代国内下载资源非常常见。']),
  mpg: video(['MPEG-1/2 video (VCD, DVD, TV recordings).', 'MPEG-1/2 视频（VCD、DVD、电视录像）。']),
  ts: video(['MPEG transport stream: TV, camcorders (.mts/.m2ts), recorded streams.', 'MPEG 传输流：电视、摄像机（.mts/.m2ts）、录制的直播。']),
  ogv: video(['Ogg video (Theora).', 'Ogg 视频（Theora）。']),
  '3gp': video(['3GP: phone video — older phones, and WhatsApp / MMS videos sent over slow networks (common in India, Latin America, Africa). Old ones use H.263 picture and AMR sound, which browsers can’t play.', '3GP：手机视频——旧手机，以及在慢速网络下通过 WhatsApp / 彩信发送的视频（印度、拉美、非洲常见）。较老的使用 H.263 画面和 AMR 声音，浏览器无法播放。']),
  exo: { from: ['EXO: an encrypted offline download inside an Android app (YouTube and other ExoPlayer apps). Only that app, on that phone, can play it.', 'EXO：安卓 App 内的加密离线下载（YouTube 等基于 ExoPlayer 的 App）。只有那台手机上的该 App 能播放。'], open: [way(['Android phone', '安卓手机'], 'The app that downloaded it (YouTube: Library → Downloads)', '下载它的 App（YouTube：媒体库 → 下载内容）')] },

  zip: archive(['ZIP archive.', 'ZIP 压缩包。'], [way(ANY, 'Built into Windows and Mac (double-click)', 'Windows 和 Mac 自带（双击）')]),
  rar: archive(['RAR archive (WinRAR).', 'RAR 压缩包（WinRAR）。'], [way(WIN, 'WinRAR; Windows 11 opens RAR itself', 'WinRAR；Windows 11 自带支持 RAR')]),
  '7z': archive(['7-Zip archive.', '7-Zip 压缩包。']),
  gz: archive(['GZIP: a single compressed file (Linux, servers, logs).', 'GZIP：单个压缩文件（Linux、服务器、日志）。']),
  bz2: archive(['BZIP2 compressed file.', 'BZIP2 压缩文件。']),
  xz: archive(['XZ compressed file.', 'XZ 压缩文件。']),
  zst: archive(['Zstandard compressed file.', 'Zstandard 压缩文件。']),
  tar: archive(['TAR: files bundled together (Linux / Mac).', 'TAR：打包在一起的文件（Linux / Mac）。']),
  cab: archive(['Windows Cabinet (installers, drivers).', 'Windows Cabinet（安装包、驱动）。']),
  iso: archive(['Disc image (CD/DVD/installer).', '光盘镜像（CD/DVD/安装盘）。'], [way(ANY, 'Double-click to mount it as a drive (Windows 8+, Mac)', '双击即可挂载为驱动器（Windows 8 及以上、Mac）')]),
  dmg: { from: ['macOS disk image (Mac app installers).', 'macOS 磁盘映像（Mac 应用安装包）。'], open: [way(MAC, 'Double-click', '双击'), way(WIN, '7-Zip can extract many', '7-Zip 可以解开大部分')] },

  ttf: font, otf: font, woff: font, woff2: font,
  exe: program, elf: program, macho: program, class: program, wasm: program,
  apk: { from: ['Android app package.', '安卓应用安装包。'], open: [way(PHONE, 'Install on Android (only from sources you trust)', '在安卓上安装（只安装可信来源）')] },
  jar: { from: ['Java program or library (a zip inside).', 'Java 程序或库（内部是 zip）。'], open: [way(ANY, 'java -jar file.jar (needs Java)', 'java -jar 文件.jar（需要 Java）'), SEVENZIP] },
};

/** Text files: by extension. */
const editor = way(ANY, 'Any text editor: Notepad / Notepad++ (Windows), TextEdit (Mac), VS Code', '任何文本编辑器：记事本 / Notepad++（Windows）、文本编辑（Mac）、VS Code');
export const TEXT_GUIDES: Record<string, FormatGuide> = {
  csv: { from: ['CSV: a table as plain text, separated by commas. Exported by Excel, databases, SCADA/PLC logs, banks.', 'CSV：用逗号分隔的纯文本表格。由 Excel、数据库、SCADA/PLC 日志、银行等导出。'], open: [way(ANY, 'Excel, WPS, Numbers, LibreOffice Calc, Google Sheets', 'Excel、WPS、Numbers、LibreOffice Calc、Google 表格'), editor], tip: ['Double-clicking a CSV makes Excel guess the encoding (your Windows language) — this is the most common cause of garbled text. Use the import steps below instead. To send CSV safely: Excel → Save As → “CSV UTF-8”.', '双击 CSV 时 Excel 会按你的 Windows 语言猜编码——这是最常见的乱码原因。请改用下面的导入步骤。发送 CSV 时：Excel → 另存为 →“CSV UTF-8”。'] },
  tsv: { from: ['TSV: a table as plain text, separated by tabs.', 'TSV：用制表符分隔的纯文本表格。'], open: [way(ANY, 'Excel, LibreOffice Calc, Google Sheets', 'Excel、LibreOffice Calc、Google 表格'), editor] },
  txt: { from: ['Plain text.', '纯文本。'], open: [editor] },
  log: { from: ['A log file written by a program, device or server.', '由程序、设备或服务器写出的日志文件。'], open: [editor, way(WIN, 'For big logs: Notepad++, glogg / klogg (free)', '大日志：Notepad++、glogg / klogg（免费）'), way(MAC, 'Console', '控制台')] },
  json: { from: ['JSON: structured data used by web services and settings.', 'JSON：网页服务和配置文件使用的结构化数据。'], open: [way(ANY, 'Any web browser (shows it formatted), VS Code', '任何网页浏览器（会格式化显示）、VS Code')] },
  xml: { from: ['XML: structured data (settings, exchanges between systems, IEC 61850 SCL…).', 'XML：结构化数据（配置、系统间交换、IEC 61850 SCL……）。'], open: [way(ANY, 'Any web browser, VS Code, Notepad++', '任何网页浏览器、VS Code、Notepad++')] },
  md: { from: ['Markdown: plain text with simple formatting (README files, notes).', 'Markdown：带简单格式的纯文本（README、笔记）。'], open: [way(ANY, 'VS Code (preview), Typora, Obsidian', 'VS Code（预览）、Typora、Obsidian')] },
  html: { from: ['A web page.', '网页。'], open: [way(ANY, 'Any web browser', '任何网页浏览器')] },
  srt: { from: ['SRT subtitles for a video.', '视频的 SRT 字幕。'], open: [way(ANY, 'Put it next to the video with the same name; VLC and most players load it', '与视频同名放在一起；VLC 和大多数播放器会自动加载')], tip: ['Subtitles in GBK/Big5 show garbled text on phones and TVs: save them as UTF-8.', 'GBK/Big5 编码的字幕在手机和电视上会乱码：请另存为 UTF-8。'] },
  ini: { from: ['Settings file (Windows programs).', '配置文件（Windows 程序）。'], open: [editor] },
};
TEXT_GUIDES.vtt = TEXT_GUIDES.srt;
TEXT_GUIDES.ass = TEXT_GUIDES.srt;
TEXT_GUIDES.ssa = TEXT_GUIDES.srt;
TEXT_GUIDES.htm = TEXT_GUIDES.html;
TEXT_GUIDES.markdown = TEXT_GUIDES.md;
TEXT_GUIDES.tab = TEXT_GUIDES.tsv;
TEXT_GUIDES.cfg = TEXT_GUIDES.ini;
TEXT_GUIDES.conf = TEXT_GUIDES.ini;
TEXT_GUIDES.text = TEXT_GUIDES.txt;
TEXT_GUIDES.nfo = TEXT_GUIDES.txt;
export const CODE_GUIDE: FormatGuide = { from: ['Source code or a settings file.', '源代码或配置文件。'], open: [way(ANY, 'VS Code, Notepad++, Sublime Text, any text editor', 'VS Code、Notepad++、Sublime Text、任何文本编辑器')] };

// ------------------------------------------------------------------ encodings

export interface EncodingGuide {
  /** Where text in this encoding comes from. */
  from: T;
  excel?: string;
  npp?: string;
  vscode?: string;
  textedit?: string;
  iconv: string;
  python: string;
}

const enc = (from: T, excel: string | undefined, npp: string | undefined, vscode: string | undefined, textedit: string | undefined, iconv: string, python: string): EncodingGuide => ({ from, excel, npp, vscode, textedit, iconv, python });

export const ENCODING_GUIDES: Record<string, EncodingGuide> = {
  'utf-8': enc(['UTF-8 (Unicode): the modern standard for every language — Mac, Linux, the web, new Windows apps.', 'UTF-8（Unicode）：适用于所有语言的现代标准——Mac、Linux、网页、新版 Windows 软件。'], '65001 : Unicode (UTF-8)', 'Encoding → UTF-8', 'UTF-8', 'Unicode (UTF-8)', 'UTF-8', 'utf-8'),
  'utf-16le': enc(['UTF-16 LE (“Unicode” in Windows): Notepad’s old “Unicode” option, Excel “Unicode Text”, many Windows tools and logs.', 'UTF-16 LE（Windows 里的“Unicode”）：记事本旧的“Unicode”选项、Excel 的“Unicode 文本”、许多 Windows 工具和日志。'], '1200 : Unicode', 'Encoding → UTF-16 LE BOM', 'UTF-16 LE', 'Unicode (UTF-16 Little-Endian)', 'UTF-16LE', 'utf-16-le'),
  'utf-16be': enc(['UTF-16 BE: some Java, Mac and mainframe tools.', 'UTF-16 BE：一些 Java、Mac 和大型机工具。'], '1201 : Unicode (Big-Endian)', 'Encoding → UTF-16 BE BOM', 'UTF-16 BE', 'Unicode (UTF-16 Big-Endian)', 'UTF-16BE', 'utf-16-be'),
  gb18030: enc(['GBK / GB18030 (code page 936): Simplified Chinese Windows and Excel in mainland China.', 'GBK / GB18030（代码页 936）：中国大陆的简体中文 Windows 和 Excel。'], '936 : Chinese Simplified (GB2312)', 'Character sets → Chinese → GB2312 (Simplified Chinese)', 'Simplified Chinese (GBK)', 'Chinese (GB 18030)', 'GB18030', 'gb18030'),
  big5: enc(['Big5 (code page 950): Traditional Chinese Windows in Taiwan and Hong Kong.', 'Big5（代码页 950）：台湾和香港的繁体中文 Windows。'], '950 : Chinese Traditional (Big5)', 'Character sets → Chinese → Big5 (Traditional Chinese)', 'Traditional Chinese (Big5)', 'Chinese (Big 5)', 'BIG5', 'big5hkscs'),
  shift_jis: enc(['Shift-JIS (code page 932): Japanese Windows.', 'Shift-JIS（代码页 932）：日文 Windows。'], '932 : Japanese (Shift-JIS)', 'Character sets → Japanese → Shift-JIS', 'Japanese (Shift JIS)', 'Japanese (Shift JIS)', 'CP932', 'cp932'),
  'euc-jp': enc(['EUC-JP: Japanese Unix/Linux and older Japanese web pages.', 'EUC-JP：日文 Unix/Linux 和较老的日文网页。'], '51932 : Japanese (EUC)', 'Character sets → Japanese → EUC-JP', 'Japanese (EUC-JP)', 'Japanese (EUC)', 'EUC-JP', 'euc_jp'),
  'iso-2022-jp': enc(['ISO-2022-JP (JIS): older Japanese e-mail.', 'ISO-2022-JP（JIS）：较老的日文邮件。'], '50220 : Japanese (JIS)', undefined, undefined, 'Japanese (ISO 2022-JP)', 'ISO-2022-JP', 'iso2022_jp'),
  'euc-kr': enc(['EUC-KR / CP949: Korean Windows.', 'EUC-KR / CP949：韩文 Windows。'], '949 : Korean', 'Character sets → Korean → Windows 949', 'Korean (EUC-KR)', 'Korean (Windows, DOS)', 'CP949', 'cp949'),
  'windows-1251': enc(['Windows-1251: Cyrillic Windows (Russian, Ukrainian, Bulgarian, Serbian, Belarusian, Kazakh).', 'Windows-1251：西里尔文 Windows（俄语、乌克兰语、保加利亚语、塞尔维亚语、白俄罗斯语、哈萨克语）。'], '1251 : Cyrillic (Windows)', 'Character sets → Cyrillic → Windows-1251', 'Cyrillic (Windows 1251)', 'Cyrillic (Windows)', 'CP1251', 'cp1251'),
  'koi8-r': enc(['KOI8-R: Russian Unix/Linux and old Russian e-mail.', 'KOI8-R：俄文 Unix/Linux 和旧的俄文邮件。'], '20866 : Cyrillic (KOI8-R)', 'Character sets → Cyrillic → KOI8-R', 'Cyrillic (KOI8-R)', 'Cyrillic (KOI8-R)', 'KOI8-R', 'koi8_r'),
  'koi8-u': enc(['KOI8-U: Ukrainian Unix and e-mail.', 'KOI8-U：乌克兰文 Unix 和邮件。'], '21866 : Cyrillic (KOI8-U)', 'Character sets → Cyrillic → KOI8-U', 'Cyrillic (KOI8-U)', 'Ukrainian (KOI8-U)', 'KOI8-U', 'koi8_u'),
  ibm866: enc(['CP866: Russian DOS programs and the Windows console.', 'CP866：俄文 DOS 程序和 Windows 命令行。'], '866 : Cyrillic (DOS)', 'Character sets → Cyrillic → OEM 866', 'Cyrillic (CP 866)', 'Cyrillic (DOS)', 'CP866', 'cp866'),
  'x-mac-cyrillic': enc(['Mac Cyrillic: old Mac computers (before macOS X).', 'Mac 西里尔文：老式 Mac 电脑（macOS X 之前）。'], '10007 : Cyrillic (Mac)', undefined, undefined, 'Cyrillic (Mac OS)', 'MAC-CYRILLIC', 'mac_cyrillic'),
  'iso-8859-5': enc(['ISO-8859-5: Cyrillic, older Unix.', 'ISO-8859-5：西里尔文，较老的 Unix。'], '28595 : Cyrillic (ISO)', 'Character sets → Cyrillic → ISO 8859-5', 'Cyrillic (ISO 8859-5)', 'Cyrillic (ISO 8859-5)', 'ISO-8859-5', 'iso8859_5'),
  'windows-1252': enc(['Windows-1252: Western Windows (English, French, German, Spanish, Portuguese, Italian, Dutch, Nordic).', 'Windows-1252：西欧 Windows（英语、法语、德语、西班牙语、葡萄牙语、意大利语、荷兰语、北欧语言）。'], '1252 : Western European (Windows)', 'Character sets → Western European → Windows-1252', 'Western (Windows 1252)', 'Western (Windows Latin 1)', 'CP1252', 'cp1252'),
  'iso-8859-15': enc(['ISO-8859-15 (Latin 9, with €): Western, older Unix.', 'ISO-8859-15（Latin 9，含 €）：西欧，较老的 Unix。'], '28605 : Latin 9 (ISO)', 'Character sets → Western European → ISO 8859-15', 'Western (ISO 8859-15)', 'Western (ISO Latin 9)', 'ISO-8859-15', 'iso8859_15'),
  macintosh: enc(['Mac Roman: old Mac computers (before macOS X).', 'Mac Roman：老式 Mac 电脑（macOS X 之前）。'], '10000 : Western European (Mac)', undefined, undefined, 'Western (Mac OS Roman)', 'MACINTOSH', 'mac_roman'),
  'windows-1250': enc(['Windows-1250: Central European Windows (Polish, Czech, Slovak, Hungarian, Croatian, Slovenian, Romanian).', 'Windows-1250：中欧 Windows（波兰语、捷克语、斯洛伐克语、匈牙利语、克罗地亚语、斯洛文尼亚语、罗马尼亚语）。'], '1250 : Central European (Windows)', 'Character sets → Central European → Windows-1250', 'Central European (Windows 1250)', 'Central European (Windows Latin 2)', 'CP1250', 'cp1250'),
  'iso-8859-2': enc(['ISO-8859-2 (Latin 2): Central European, older Unix and e-mail.', 'ISO-8859-2（Latin 2）：中欧，较老的 Unix 和邮件。'], '28592 : Central European (ISO)', 'Character sets → Central European → ISO 8859-2', 'Central European (ISO 8859-2)', 'Central European (ISO Latin 2)', 'ISO-8859-2', 'iso8859_2'),
  'windows-1253': enc(['Windows-1253: Greek Windows.', 'Windows-1253：希腊文 Windows。'], '1253 : Greek (Windows)', 'Character sets → Greek → Windows-1253', 'Greek (Windows 1253)', 'Greek (Windows)', 'CP1253', 'cp1253'),
  'iso-8859-7': enc(['ISO-8859-7: Greek, older Unix.', 'ISO-8859-7：希腊文，较老的 Unix。'], '28597 : Greek (ISO)', 'Character sets → Greek → ISO 8859-7', 'Greek (ISO 8859-7)', 'Greek (ISO 8859-7)', 'ISO-8859-7', 'iso8859_7'),
  'windows-1254': enc(['Windows-1254: Turkish (and Azerbaijani) Windows.', 'Windows-1254：土耳其文（及阿塞拜疆文）Windows。'], '1254 : Turkish (Windows)', 'Character sets → Turkish → Windows-1254', 'Turkish (Windows 1254)', 'Turkish (Windows Latin 5)', 'CP1254', 'cp1254'),
  'windows-1255': enc(['Windows-1255: Hebrew Windows.', 'Windows-1255：希伯来文 Windows。'], '1255 : Hebrew (Windows)', 'Character sets → Hebrew → Windows-1255', 'Hebrew (Windows 1255)', 'Hebrew (Windows)', 'CP1255', 'cp1255'),
  'iso-8859-8': enc(['ISO-8859-8: Hebrew, older Unix.', 'ISO-8859-8：希伯来文，较老的 Unix。'], '28598 : Hebrew (ISO-Visual)', 'Character sets → Hebrew → ISO 8859-8', 'Hebrew (ISO 8859-8)', 'Hebrew (ISO 8859-8)', 'ISO-8859-8', 'iso8859_8'),
  'windows-1256': enc(['Windows-1256: Arabic Windows (also Persian and Urdu).', 'Windows-1256：阿拉伯文 Windows（也用于波斯语、乌尔都语）。'], '1256 : Arabic (Windows)', 'Character sets → Arabic → Windows-1256', 'Arabic (Windows 1256)', 'Arabic (Windows)', 'CP1256', 'cp1256'),
  'iso-8859-6': enc(['ISO-8859-6: Arabic, older Unix.', 'ISO-8859-6：阿拉伯文，较老的 Unix。'], '28596 : Arabic (ISO)', 'Character sets → Arabic → ISO 8859-6', 'Arabic (ISO 8859-6)', 'Arabic (ISO 8859-6)', 'ISO-8859-6', 'iso8859_6'),
  'windows-1257': enc(['Windows-1257: Baltic Windows (Lithuanian, Latvian, Estonian).', 'Windows-1257：波罗的海 Windows（立陶宛语、拉脱维亚语、爱沙尼亚语）。'], '1257 : Baltic (Windows)', 'Character sets → Baltic → Windows-1257', 'Baltic (Windows 1257)', 'Baltic (Windows)', 'CP1257', 'cp1257'),
  'iso-8859-13': enc(['ISO-8859-13: Baltic, older Unix.', 'ISO-8859-13：波罗的海，较老的 Unix。'], '28603 : Estonian (ISO)', 'Character sets → Baltic → ISO 8859-13', 'Estonian (ISO 8859-13)', undefined, 'ISO-8859-13', 'iso8859_13'),
  'windows-1258': enc(['Windows-1258: Vietnamese Windows.', 'Windows-1258：越南文 Windows。'], '1258 : Vietnamese (Windows)', 'Character sets → Vietnamese → Windows-1258', 'Vietnamese (Windows 1258)', 'Vietnamese (Windows)', 'CP1258', 'cp1258'),
  'windows-874': enc(['Windows-874 / TIS-620: Thai Windows.', 'Windows-874 / TIS-620：泰文 Windows。'], '874 : Thai (Windows)', 'Character sets → Thai → TIS-620', 'Thai (Windows 874)', 'Thai (Windows, DOS)', 'CP874', 'cp874'),
};
ENCODING_GUIDES.gbk = ENCODING_GUIDES.gb18030;
