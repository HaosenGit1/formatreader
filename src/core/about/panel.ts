/**
 * The "About this file" panel: what the file is, where it comes from, and how to open it
 * correctly elsewhere — in one place, with a Copy button to pass it on.
 * Loaded only when the button is pressed.
 */
import './about.css';
import { h } from '../dom';
import { lang, strings } from '../i18n';
import type { FormatInfo } from '../detect-format';
import type { AboutFacts } from '../viewer';
import { CODE_GUIDE, ENCODING_GUIDES, FORMAT_GUIDES, TEXT_GUIDES, type FormatGuide, type T } from './guide';

const s = strings({
  title: { en: 'About this file', zh: '关于此文件' },
  format: { en: 'Format', zh: '格式' },
  byContent: { en: '(recognised from its content, not its name)', zh: '（根据文件内容识别，而不是文件名）' },
  mismatch: { en: 'The name ends in .{ext}, but the content is {name}. Renaming it to .{right} helps other apps open it.', zh: '文件名是 .{ext}，但内容其实是{name}。改名为 .{right} 后，其他软件更容易打开。' },
  from: { en: 'Where it comes from', zh: '来源' },
  open: { en: 'How to open it elsewhere', zh: '在其他软件中怎么打开' },
  tip: { en: 'Tip', zh: '提示' },
  encoding: { en: 'Text encoding', zh: '文字编码' },
  bom: { en: 'starts with a BOM mark', zh: '带 BOM 标记' },
  lines: { en: 'Line endings', zh: '换行符' },
  CRLF: { en: 'Windows (CRLF)', zh: 'Windows（CRLF）' },
  LF: { en: 'Mac / Linux (LF)', zh: 'Mac / Linux（LF）' },
  CR: { en: 'old Mac (CR)', zh: '老式 Mac（CR）' },
  mixed: { en: 'mixed', zh: '混合' },
  readAs: { en: 'To read the text correctly, choose this encoding:', zh: '要正确显示文字，请选择这个编码：' },
  excelWin: { en: 'Excel (Windows): Data → From Text/CSV → File Origin: “{x}” → Load', zh: 'Excel（Windows）：数据 → 从文本/CSV → 文件原始格式：“{x}” → 加载' },
  excelMac: { en: 'Excel (Mac): File → Import → CSV file → File origin: “{x}”', zh: 'Excel（Mac）：文件 → 导入 → CSV 文件 → 文件原始格式：“{x}”' },
  libre: { en: 'LibreOffice: the Text Import window → Character set: {x}', zh: 'LibreOffice：文本导入窗口 → 字符集：{x}' },
  npp: { en: 'Notepad++: Encoding → {x}', zh: 'Notepad++：编码 → {x}' },
  vscode: { en: 'VS Code: click the encoding at the bottom right → Reopen with Encoding → {x}', zh: 'VS Code：点右下角的编码 → 通过编码重新打开 → {x}' },
  textedit: { en: 'TextEdit (Mac): File → Open → Options → Plain Text Encoding: {x}', zh: '文本编辑（Mac）：文件 → 打开 → 选项 → 纯文本编码：{x}' },
  cmd: { en: 'Convert a copy to UTF-8 (Mac, Linux, Git Bash):', zh: '转换出一份 UTF-8 副本（Mac、Linux、Git Bash）：' },
  python: { en: 'Python:', zh: 'Python：' },
  utf8Note: { en: 'UTF-8 opens correctly almost everywhere. Exception: Excel on Windows, double-clicking a CSV without a BOM — use the import steps:', zh: 'UTF-8 几乎在哪里都能正确打开。例外：在 Windows 上双击没有 BOM 的 CSV 用 Excel 打开——请使用导入步骤：' },
  repaired: { en: 'Garbled text inside the file', zh: '文件中的乱码' },
  repairedWhat: { en: 'This text was damaged before it reached you: it was read with the wrong encoding ({steps}) and then saved. Every app shows the garbled text because it is now in the file itself. FormatReader shows the repaired text.', zh: '这段文字在到你手上之前就被损坏了：它曾被用错误的编码读取（{steps}）然后保存。乱码已经写进文件，所以任何软件都会显示乱码。FormatReader 显示的是修复后的文字。' },
  repairedFix: { en: 'To repair the file itself:', zh: '修复文件本身：' },
  repairedCopy: { en: 'Or simply copy the repaired text from FormatReader into a new file.', zh: '或者直接把 FormatReader 中修复后的文字复制到新文件里。' },
  readAsStep: { en: '{right} read as {wrong}', zh: '{right} 被当成 {wrong} 读取' },
  escapes: { en: 'The text is written in an encoded form ({kinds}); FormatReader shows it decoded.', zh: '文字是以编码形式写的（{kinds}）；FormatReader 显示的是解码后的内容。' },
  damage: { en: 'Characters already lost', zh: '已丢失的字符' },
  damageQ: { en: 'Some characters were replaced by “?” when the file was saved (by a program that could not write them, e.g. Excel “CSV” in a different language). They cannot be recovered by any app. Ask for the original, saved as “CSV UTF-8” or .xlsx.', zh: '文件保存时，有些字符被替换成了“?”（保存的程序写不了这些字，例如在另一种语言的系统里用 Excel 存为“CSV”）。任何软件都无法恢复。请向对方要原文件，并另存为“CSV UTF-8”或 .xlsx。' },
  damageLost: { en: 'The text contains 锟斤拷 / ï¿½: characters were lost once and the loss was then saved. They cannot be recovered; ask for the original file.', zh: '文字中有“锟斤拷”/“ï¿½”：字符曾经丢失，丢失后又被保存。无法恢复；请向对方要原文件。' },
  damageMemory: { en: 'The text contains 烫烫烫 / 屯屯屯: this is uninitialised memory written by a program bug, not real text.', zh: '文字中有“烫烫烫”/“屯屯屯”：这是程序缺陷写出的未初始化内存，并不是真正的文字。' },
  codec: { en: 'Codec', zh: '编码格式' },
  unknown: { en: 'Not recognised. If you know which program made it, that program can open it.', zh: '无法识别。如果你知道是哪个软件生成的，用那个软件就能打开。' },
  copy: { en: 'Copy', zh: '复制' },
  copied: { en: 'Copied', zh: '已复制' },
  close: { en: 'Close', zh: '关闭' },
});

const tr = (t: T) => (lang() === 'zh' ? t[1] : t[0]);
const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

/** The extension each format is normally saved with, when it differs from its id. */
const RIGHT_EXT: Record<string, string[]> = {
  jpg: ['jpg', 'jpeg', 'jpe', 'jfif'], tiff: ['tif', 'tiff'], heic: ['heic', 'heif'], mid: ['mid', 'midi'], aiff: ['aif', 'aiff'], mpg: ['mpg', 'mpeg', 'vob'],
  ts: ['ts', 'mts', 'm2ts'], step: ['step', 'stp', 'p21'], iges: ['iges', 'igs'], ole: [], lotus: ['wk1', 'wk3', 'wk4', 'wks', '123'], iwork: ['pages', 'numbers', 'key'],
  mov: ['mov', 'qt'], mp4: ['mp4', 'm4v', 'm4a', 'm4b', 'm4p', '3gp'], m4a: ['m4a', 'm4b', 'm4p', 'aac', 'mp4'], ogg: ['ogg', 'oga', 'ogv', 'opus', 'spx'], mkv: ['mkv', 'mka', 'mks', 'webm'],
  html: ['html', 'htm', 'xhtml'], gz: ['gz', 'tgz'], tar: ['tar'], glb: ['glb', 'gltf'], dcm: ['dcm', 'dicom'], comtrade: ['cff', 'cfg', 'dat', 'zip'], pcap: ['pcap', 'pcapng', 'cap', 'dmp'], bplist: ['plist', 'webloc', 'strings', 'nib'],
  zip: ['zip', 'zipx'], doc: ['doc', 'dot', 'wps'], xls: ['xls', 'xlt', 'et'], ppt: ['ppt', 'pps', 'pot', 'dps'], docx: ['docx', 'docm', 'dotx', 'dotm'], xlsx: ['xlsx', 'xlsm', 'xltx', 'xltm'], pptx: ['pptx', 'pptm', 'ppsx', 'potx'],
  cr3: ['cr3'], dng: ['dng'], raf: ['raf'], exe: ['exe', 'dll', 'sys', 'scr', 'com', 'msi'], macho: ['', 'dylib', 'app'], elf: ['', 'so', 'o'], jar: ['jar', 'war', 'ear', 'aar'], apk: ['apk', 'aab'],
  sqlite: ['sqlite', 'sqlite3', 'db', 'db3'], woff: ['woff'], woff2: ['woff2'], svgz: ['svgz'], fbz: ['fbz', 'fb2.zip'],
};
// Containers that many formats share: a different extension is normal, so no rename advice.
const SHARED_CONTAINER = new Set(['zip', 'ole', 'mp4', 'mkv', 'ogg', 'tar', 'gz', 'xml', 'comtrade', 'iwork']);

function extAdvice(format: FormatInfo, ext: string): string | null {
  if (!ext || SHARED_CONTAINER.has(format.id)) return null;
  const ok = RIGHT_EXT[format.id] ?? [format.id];
  if (!ok.length || ok.includes(ext)) return null;
  return fill(s('mismatch'), { ext, name: format.name, right: ok[0] });
}

function guideFor(format: FormatInfo | null, ext: string, viewerId: string): FormatGuide | null {
  if (format && FORMAT_GUIDES[format.id]) return FORMAT_GUIDES[format.id];
  if (FORMAT_GUIDES[ext] && (!format || format.text)) return FORMAT_GUIDES[ext];
  if (TEXT_GUIDES[ext]) return TEXT_GUIDES[ext];
  if (viewerId === 'words/code') return CODE_GUIDE;
  if (viewerId === 'words/text') return TEXT_GUIDES.txt;
  return null;
}

const SINGLE_NAME: Record<string, string> = { gb18030: 'GBK', 'windows-1252': 'Windows-1252', 'utf-8': 'UTF-8' };
const encName = (label: string) => SINGLE_NAME[label] ?? label.toUpperCase();

/** "UTF-8 read as GBK" steps from repair layers ('gb18030' or 'windows-1252→windows-1251'). */
function layerSteps(layers: string[]) {
  return layers.map((l) => {
    const [wrong, right] = l.includes('→') ? l.split('→') : [l, 'utf-8'];
    return { wrong, right };
  });
}

interface Section {
  heading: string;
  lines: Array<string | HTMLElement>;
  /** Plain text for Copy. */
  plain: string[];
}

export interface AboutInput {
  name: string;
  ext: string;
  size: number;
  format: FormatInfo | null;
  viewerId: string;
  viewerName?: string;
  facts: AboutFacts;
}

export function aboutSections(input: AboutInput): Section[] {
  const { format, ext, facts } = input;
  const out: Section[] = [];
  const add = (heading: string, lines: Array<string | HTMLElement>, plain?: string[]) => out.push({ heading, lines, plain: plain ?? lines.map((l) => (typeof l === 'string' ? l : l.textContent ?? '')) });
  const code = (text: string) => h('code', { class: 'about-code' }, text);

  // Format
  const fmtLines: string[] = [];
  if (format) fmtLines.push(`${format.name} ${s('byContent')}`);
  else if (facts.encoding) fmtLines.push(`${ext ? `.${ext} — ` : ''}${lang() === 'zh' ? '文本' : 'Text'}`);
  else fmtLines.push(s('unknown'));
  if (format) {
    const advice = extAdvice(format, ext);
    if (advice) fmtLines.push(advice);
  }
  if (facts.codec) fmtLines.push(`${s('codec')}: ${facts.codec}`);
  add(s('format'), fmtLines);

  // Where it comes from + how to open it
  const guide = guideFor(format, ext, input.viewerId);
  if (guide) {
    add(s('from'), [tr(guide.from)]);
    add(s('open'), guide.open.map((w) => `${tr(w.on)}: ${tr(w.how)}`));
  }

  // Text: encoding, how to choose it in each app
  if (facts.encoding) {
    const e = ENCODING_GUIDES[facts.encoding];
    const lines: Array<string | HTMLElement> = [];
    const head = `${encName(facts.encoding)}${facts.bom ? ` (${s('bom')})` : ''}`;
    lines.push(e ? `${tr(e.from)}${facts.bom ? ` (${s('bom')})` : ''}` : head);
    if (facts.lineEnding) lines.push(`${s('lines')}: ${s(facts.lineEnding)}`);
    if (e) {
      const isUtf8 = facts.encoding === 'utf-8';
      const table = ['csv', 'tsv', 'tab', 'prn'].includes(ext) || input.viewerId === 'words/sheets';
      const steps: string[] = [];
      if (isUtf8 && !table) {
        // UTF-8 text opens correctly in practically every app: nothing to explain.
      } else {
        lines.push(isUtf8 ? s('utf8Note') : s('readAs'));
        if (e.excel && table) steps.push(fill(s('excelWin'), { x: e.excel }), fill(s('excelMac'), { x: e.excel }));
      }
      if (!isUtf8) {
        steps.push(fill(s('libre'), { x: encName(facts.encoding) }));
        if (e.npp) steps.push(fill(s('npp'), { x: e.npp }));
        if (e.vscode) steps.push(fill(s('vscode'), { x: e.vscode }));
        if (e.textedit) steps.push(fill(s('textedit'), { x: e.textedit }));
      }
      if (steps.length) lines.push(h('ul', { class: 'about-steps' }, ...steps.map((x) => h('li', {}, x))));
      if (!isUtf8 && facts.encoding !== 'utf-16le' && facts.encoding !== 'utf-16be') {
        const file = input.name || 'file.txt';
        const outName = file.replace(/(\.[^.]+)?$/, '-utf8$1');
        lines.push(s('cmd'), code(`iconv -f ${e.iconv} -t UTF-8 "${file}" > "${outName}"`));
        lines.push(s('python'), code(`open("${file}", encoding="${e.python}").read()`));
      }
    }
    add(s('encoding'), lines, lines.map((l) => (l instanceof HTMLElement ? (l.tagName === 'UL' ? [...l.children].map((c) => `- ${c.textContent}`).join('\n') : l.textContent ?? '') : l)));
  }

  // Mojibake saved into the file: explain and give the exact repair command.
  if (facts.repaired?.length) {
    const steps = layerSteps(facts.repaired);
    const what = steps.map((st) => fill(s('readAsStep'), { right: encName(st.right), wrong: encName(st.wrong) })).join(lang() === 'zh' ? '，再' : ', then ');
    const file = input.name || 'file.txt';
    const outName = file.replace(/(\.[^.]+)?$/, '-fixed$1');
    // Undo the outermost layer first: encode back to the wrong code page, read as the right one.
    const pipe = steps
      .map((st) => {
        const wrong = ENCODING_GUIDES[st.wrong]?.iconv ?? st.wrong.toUpperCase();
        const right = ENCODING_GUIDES[st.right]?.iconv ?? st.right.toUpperCase();
        return right === 'UTF-8' ? `iconv -f UTF-8 -t ${wrong}` : `iconv -f UTF-8 -t ${wrong} | iconv -f ${right} -t UTF-8`;
      })
      .join(' | ');
    const pyChain = steps.map((st) => `.encode("${ENCODING_GUIDES[st.wrong]?.python ?? st.wrong}", "replace").decode("${ENCODING_GUIDES[st.right]?.python ?? st.right}", "replace")`).join('');
    add(s('repaired'), [
      fill(s('repairedWhat'), { steps: what }),
      s('repairedFix'),
      code(`cat "${file}" | ${pipe} > "${outName}"`),
      s('python'),
      code(`t = open("${file}", encoding="utf-8").read()${pyChain}`),
      s('repairedCopy'),
    ]);
  }
  if (facts.escapes?.length) add(s('encoding'), [fill(s('escapes'), { kinds: facts.escapes.join(', ') })]);
  if (facts.damage) add(s('damage'), [s(facts.damage === 'question' ? 'damageQ' : facts.damage === 'lost' ? 'damageLost' : 'damageMemory')]);

  if (guide?.tip) add(s('tip'), [tr(guide.tip)]);
  return out;
}

export function aboutPanel(input: AboutInput, onClose: () => void): HTMLElement {
  const sections = aboutSections(input);
  const copyBtn = h('button', { type: 'button', class: 'btn' }, s('copy')) as HTMLButtonElement;
  copyBtn.addEventListener('click', () => {
    const text = [`${input.name}`, ...sections.flatMap((sec) => ['', `# ${sec.heading}`, ...sec.plain])].join('\n');
    navigator.clipboard?.writeText(text).then(
      () => {
        copyBtn.textContent = s('copied');
        setTimeout(() => (copyBtn.textContent = s('copy')), 1500);
      },
      () => {},
    );
  });
  return h(
    'section',
    { class: 'about-panel', 'aria-label': s('title') },
    h('div', { class: 'about-head' }, h('h2', {}, s('title')), copyBtn, h('button', { type: 'button', class: 'btn', onclick: onClose }, s('close'))),
    ...sections.map((sec) => h('div', { class: 'about-sec' }, h('h3', {}, sec.heading), ...sec.lines.map((l) => (typeof l === 'string' ? h('p', {}, l) : l)))),
  );
}
