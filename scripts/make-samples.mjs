// Generates test files in ./samples covering many encodings and text formats.
// Run: npm run samples
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(process.cwd(), 'samples');
mkdirSync(out, { recursive: true });

const CP1252 = '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';

/** Build a reverse map for a legacy encoding by decoding every 1- and 2-byte sequence. */
function encoder(label) {
  const map = new Map();
  for (let b = 0; b < 0x80; b++) map.set(String.fromCharCode(b), [b]);
  if (label === 'windows-1252') {
    for (let b = 0x80; b <= 0xff; b++) map.set(b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b), [b]);
    return map;
  }
  const dec = new TextDecoder(label);
  const single = new Set();
  for (let b = 0x80; b <= 0xff; b++) {
    const s = dec.decode(new Uint8Array([b]));
    if (s.length === 1 && s !== '\uFFFD') {
      single.add(b);
      if (!map.has(s)) map.set(s, [b]);
    }
  }
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    if (single.has(lead)) continue;
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      const s = dec.decode(new Uint8Array([lead, trail]));
      if ([...s].length === 1 && s !== '\uFFFD' && !map.has(s)) map.set(s, [lead, trail]);
    }
  }
  return map;
}

function encode(text, label) {
  if (label === 'utf-8') return new TextEncoder().encode(text);
  const map = encoder(label);
  const bytes = [];
  for (const ch of text) {
    const b = map.get(ch);
    if (!b) throw new Error(`${label} cannot encode ${JSON.stringify(ch)}`);
    bytes.push(...b);
  }
  return new Uint8Array(bytes);
}

/** Samples are grouped by the viewer that opens them, like the source code. */
const folderFor = (name) => {
  const ext = name.split('.').pop().toLowerCase();
  if (['csv', 'tsv', 'xlsx', 'xls', 'ods'].includes(ext)) return 'sheets';
  if (['py', 'st', 'json', 'xml', 'js', 'ts'].includes(ext)) return 'code';
  return 'text';
};
const pathFor = (name) => {
  const dir = join(out, folderFor(name));
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
};

const write = (name, label, text, bom = []) => {
  const body = encode(text, label);
  writeFileSync(pathFor(name), Buffer.concat([Buffer.from(bom), Buffer.from(body)]));
  console.log(`  ${name.padEnd(36)} ${label}`);
};

const novelZh = `第一章　山村少年

天色渐渐暗了下来，远处的山峦被晚霞染成了一片金红色。少年站在村口的老槐树下，望着那条通往外面世界的小路，心中充满了期待。

“阿明，回家吃饭了！”母亲的声音从身后传来。

他应了一声，却没有立刻转身。他知道，总有一天，他会沿着这条路走出去，去看看山外面的世界到底是什么样子。

第二章　远方的来信

第二天清晨，邮差带来了一封信。信封上的字迹很陌生，邮戳来自一个他从未听说过的城市。
`;

const novelTw = `第一章　山村少年

天色漸漸暗了下來，遠處的山巒被晚霞染成了一片金紅色。少年站在村口的老槐樹下，望著那條通往外面世界的小路，心中充滿了期待。

「阿明，回家吃飯了！」母親的聲音從身後傳來。
`;

console.log('Writing samples to ./samples');
write('novel-gbk.txt', 'gbk', novelZh);
write('novel-big5.txt', 'big5', novelTw);
write('japanese-shiftjis.txt', 'shift_jis', '吾輩は猫である。名前はまだ無い。\nどこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。\n');
write('korean-euckr.txt', 'euc-kr', '대한민국 헌법\n\n제1조 ① 대한민국은 민주공화국이다.\n② 대한민국의 주권은 국민에게 있고, 모든 권력은 국민으로부터 나온다.\n');
write('russian-1251.txt', 'windows-1251', 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему.\nВсё смешалось в доме Облонских.\n');
write('french-1252.txt', 'windows-1252', 'Le cœur a ses raisons que la raison ne connaît point.\nÇa a été très difficile, n’est-ce pas ?\n');
write('arabic-1256.txt', 'windows-1256', 'في البدء كان الكلمة، والكلمة كان عند الله، وكان الكلمة الله.\n');

// CSV exported from a Chinese Excel (GBK) and a UTF-8 one with BOM
write('sales-gbk.csv', 'gbk', '日期,地区,产品,数量,金额\n2026-01-03,北京,风机叶片,12,"1,240,000"\n2026-01-05,上海,齿轮箱,4,860000\n2026-01-09,广州,"变流器, 3MW",7,1530000\n');
write('report-utf8-bom.csv', 'utf-8', 'Turbine,Status,Power (kW),Note\nWTG-01,Running,2410,\nWTG-02,Stopped,0,"Pitch fault, blade 2"\nWTG-03,Running,2385,\n', [0xef, 0xbb, 0xbf]);
write('european-semicolon.csv', 'windows-1252', 'Name;Stadt;Betrag\nMüller;Köln;1.234,50\nGarçon;Besançon;99,00\n');

// Subtitles in GBK (the classic "subtitle shows garbled" case)
write('movie-gbk.srt', 'gbk', '1\r\n00:00:01,000 --> 00:00:03,500\r\n你好，欢迎来到这里。\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\n<i>我们走吧。</i>\r\n');
write('anime.ass', 'utf-8', '[Script Info]\nTitle: Sample\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,さくら,0,0,0,,{\\i1}おはよう！{\\i0}\\N今日もいい天気だね。\nDialogue: 0,0:00:03.50,0:00:05.00,Default,Ken,0,0,0,,Yeah, let\'s go.\n');

// Double-encoded text: UTF-8 read as GBK and saved again as UTF-8 (浣犲ソ)
const original = '这是一段被错误编码后又保存了的中文，FormatReader 会自动把它修好。\n';
const garbled = new TextDecoder('gbk').decode(new TextEncoder().encode(original));
write('double-encoded.txt', 'utf-8', garbled);

// UTF-16 LE with BOM (Windows Notepad "Unicode")
const u16 = 'Windows 记事本 “Unicode” 格式保存的文件\r\nUTF-16 LE with BOM\r\n';
const u16bytes = Buffer.alloc(u16.length * 2);
for (let i = 0; i < u16.length; i++) u16bytes.writeUInt16LE(u16.charCodeAt(i), i * 2);
writeFileSync(pathFor('notepad-utf16.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), u16bytes]));
console.log('  notepad-utf16.txt                    utf-16le');

// Code, data, markup
write('example.py', 'utf-8', '#!/usr/bin/env python3\n"""Read turbine data and print the average power."""\nimport csv\n\n\ndef average_power(path: str) -> float:\n    with open(path, encoding="utf-8") as f:\n        rows = list(csv.DictReader(f))\n    values = [float(r["Power (kW)"]) for r in rows]\n    return sum(values) / len(values)  # 平均功率\n\n\nif __name__ == "__main__":\n    print(f"{average_power(\'report.csv\'):.1f} kW")\n');
write('motor_control.st', 'utf-8', '(* IEC 61131-3 Structured Text *)\nFUNCTION_BLOCK FB_Motor\nVAR_INPUT\n    Start : BOOL;\n    Stop  : BOOL;\nEND_VAR\nVAR_OUTPUT\n    Running : BOOL;\nEND_VAR\n\nIF Start AND NOT Stop THEN\n    Running := TRUE;\nELSIF Stop THEN\n    Running := FALSE;\nEND_IF;\nEND_FUNCTION_BLOCK\n');
write('config.json', 'utf-8', '{"site":"风电场 A","turbines":[{"id":"WTG-01","rated_kw":2500,"online":true},{"id":"WTG-02","rated_kw":2500,"online":false}],"scada":{"poll_ms":1000,"protocol":"IEC 61850"}}');
write('README.md', 'utf-8', '# FormatReader sample\n\nThis **Markdown** file is rendered safely — scripts never run.\n\n## Features\n\n- Any encoding: UTF-8, GBK, Big5, Shift_JIS…\n- Tables, subtitles, code\n\n| Format | Status |\n| --- | --- |\n| TXT | ✅ |\n| CSV | ✅ |\n\n```js\nconsole.log("hello");\n```\n\n> 中文也能正常显示。\n');
write('page.html', 'utf-8', '<!doctype html><html><head><title>Sample</title><style>body{font-family:sans-serif;padding:2em}h1{color:#2f5bea}</style></head><body><h1>HTML preview</h1><p>Rendered in a sandbox. <script>alert("this will not run")</script></p><ul><li>One</li><li>二</li></ul></body></html>');
write('data.xml', 'utf-8', '<?xml version="1.0" encoding="UTF-8"?>\n<turbines>\n  <turbine id="WTG-01" status="running">\n    <power unit="kW">2410</power>\n  </turbine>\n</turbines>\n');
write('server.log', 'utf-8', Array.from({ length: 3000 }, (_, i) => `2026-11-17 08:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} INFO  [poller] read 128 tags from PLC-${(i % 4) + 1} in ${20 + (i % 13)} ms`).join('\n') + '\n');
// Spreadsheets: several sheets, merged cells, formulas, dates, Chinese text
const XLSX = await import('xlsx');
{
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['风场月报 Wind farm monthly report', null, null, null, null],
    ['Turbine 风机', 'Energy MWh', 'Availability', 'Date', 'Status 状态'],
    ['WTG-01', 412.6, 0.981, new Date(2026, 9, 31), 'Running 运行'],
    ['WTG-02', 388.2, 0.954, new Date(2026, 9, 31), 'Running 运行'],
    ['WTG-03', 0, 0.12, new Date(2026, 9, 31), 'Gearbox fault 齿轮箱故障'],
    ['Total 合计', null, null, null, null],
  ], { cellDates: true });
  ws['B6'] = { t: 'n', f: 'SUM(B3:B5)', v: 800.8 };
  ws['C6'] = { t: 'n', f: 'AVERAGE(C3:C5)', v: 0.685 };
  for (const r of [3, 4, 5]) ws[`C${r}`].z = '0.0%';
  ws['C6'].z = '0.0%';
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, '十月 October');
  const log = [['Time', 'Turbine', 'Event']];
  for (let i = 0; i < 500; i++) log.push([`2026-10-${String(1 + (i % 30)).padStart(2, '0')} ${String(i % 24).padStart(2, '0')}:00`, `WTG-0${1 + (i % 3)}`, i % 7 ? 'OK' : 'Pitch warning 变桨警告']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(log), 'Event log');
  for (const [ext, bookType] of [['xlsx', 'xlsx'], ['xls', 'biff8'], ['ods', 'ods']]) {
    writeFileSync(pathFor(`wind-report.${ext}`), XLSX.write(wb, { type: 'buffer', bookType }));
    console.log(`  wind-report.${ext}`.padEnd(38), bookType);
  }
}
console.log('Done.');
