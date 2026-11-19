/**
 * End-to-end over every file in samples/: each folder is named after the
 * viewer that must open its files, and text files must decode correctly.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { allViewers } from '../src/categories';
import { decode } from '../src/categories/words/shared/encoding/codec';
import { detectEncoding, isBinaryResult } from '../src/categories/words/shared/encoding/detect';
import { repairMojibake } from '../src/categories/words/shared/encoding/mojibake';
import { detectFormat, extOf } from '../src/core/detect-format';
import { infoEntry } from '../src/core/info-entry';
import { pickViewer } from '../src/core/registry';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'samples');
const viewers = [...allViewers, infoEntry];

const FOLDER_VIEWER: Record<string, string> = {
  text: 'words/text',
  code: 'words/code',
  sheets: 'words/sheets',
  invoices: 'words/invoice',
  bank: 'words/bank',
  xbrl: 'words/xbrl',
  ledger: 'words/ledger',
  animations: 'images/anim',
  books: 'words/books',
  slides: 'words/slides',
  docs: 'words/docs',
  db: 'words/db',
  email: 'words/email',
  archives: 'archives/gzip',
  legacy: 'words/legacy',
  data: 'data/comtrade',
  images: 'images/photo',
  drawings: 'drawings/model',
  sounds: 'sounds/audio',
  videos: 'videos/video',
};

/** Some folders hold several document types, each with its own viewer. */
const EXT_VIEWER: Record<string, string> = { tgs: 'archives/gzip', gif: 'images/photo', png: 'images/photo', webp: 'images/photo', rtf: 'words/rtf', odt: 'words/odf', odp: 'words/odf', xps: 'words/fixed', ofd: 'words/fixed', hwpx: 'words/hwpx', pages: 'words/iwork', key: 'words/iwork', pdb: 'words/palmdoc', hwp: 'words/hwp', zip: 'archives/archive', '7z': 'archives/archive', tar: 'archives/archive', rar: 'archives/archive', cb7: 'archives/archive', pdf: 'words/pdf', dxf: 'drawings/dxf', dwg: 'drawings/dxf', odg: 'drawings/preview', vsdx: 'drawings/preview', xmind: 'drawings/mindmap' };

/** Expected decoded snippet per text sample: proves the right encoding was chosen. */
const EXPECT: Record<string, string> = {
  'novel-gbk.txt': '山村少年',
  'novel-big5.txt': '遠處的山巒',
  'japanese-shiftjis.txt': '吾輩は猫である',
  'korean-euckr.txt': '대한민국은 민주공화국이다',
  'russian-1251.txt': 'Все счастливые семьи',
  'french-1252.txt': 'Le cœur a ses raisons',
  'arabic-1256.txt': 'في البدء كان الكلمة',
  'sales-gbk.csv': '风机叶片',
  'report-utf8-bom.csv': 'Pitch fault',
  'european-semicolon.csv': 'Müller;Köln',
  'movie-gbk.srt': '欢迎来到这里',
  'notepad-utf16.txt': 'Windows 记事本',
  'double-encoded.txt': '这是一段被错误编码后又保存了的中文',
};

const BINARY_EXT = new Set(['epub', 'cbz', 'pptx', 'xlsx', 'xls', 'ods', 'docx', 'mdb', 'accdb', 'sqlite', 'rtf', 'odt', 'odp', 'eml', 'mbox', 'msg', 'mhtml', 'xps', 'ofd', 'hwpx', 'pages', 'key', 'pdb', 'gz', 'doc', 'ppt', 'hwp', 'zip', '7z', 'tar', 'rar', 'cb7', 'cfg', 'cff', 'pdf', 'jpg', 'png', 'gif', 'webp', 'bmp', 'ico', 'heic', 'tiff', 'psd', 'dng', 'svgz', 'svg', 'exr', 'hdr', 'tga', 'dcm', 'stl', 'obj', 'ply', 'glb', '3mf', 'dxf', 'dwg', 'odg', 'vsdx', 'xmind', 'step', 'ifc', 'wav', 'm4a', 'flac', 'aiff', 'weba', 'mp4', '3gp', '3g2', 'webm', 'flv', 'avi', 'lottie', 'tgs', 'swf']);
// locked.zip is password-protected: still routed to the archive viewer.

for (const folder of Object.keys(FOLDER_VIEWER)) {
  const dir = join(root, folder);
  const files = readdirSync(dir).filter((f) => !f.startsWith('.') && !f.endsWith('SOURCES.md') && statSync(join(dir, f)).isFile());

  describe(`samples/${folder} → ${FOLDER_VIEWER[folder]}`, () => {
    for (const name of files) {
      test(name, async () => {
        const bytes = new Uint8Array(readFileSync(join(dir, name)));
        const format = await detectFormat(new Blob([bytes]), name);
        const viewer = pickViewer(viewers, { format, name, ext: extOf(name), head: bytes.subarray(0, 8192) });
        // In samples/data the folder decides (a ZIP there is a COMTRADE record, not a plain archive).
        // Password-protected Office files go to the unlock screen first.
        expect(viewer?.id).toBe(name.startsWith('locked-') ? 'words/locked' : folder === 'data' ? FOLDER_VIEWER[folder] : EXT_VIEWER[extOf(name)] ?? FOLDER_VIEWER[folder]);

        if (BINARY_EXT.has(extOf(name))) return;

        // Text-based: must decode cleanly (repaired files may list destroyed characters).
        const enc = await detectEncoding(bytes);
        expect(isBinaryResult(enc)).toBe(false);
        if (isBinaryResult(enc)) return;
        let text = decode(bytes.subarray(enc.bomLength), enc.encoding);
        const repair = enc.encoding === 'utf-8' ? repairMojibake(text) : null;
        if (repair) text = repair.text;
        expect(text.split('�').length - 1).toBe(repair?.lost ?? 0);
        if (name !== 'double-encoded.txt') expect(repair).toBeNull();
        if (EXPECT[name]) expect(text).toContain(EXPECT[name]);
      });
    }
  });
}

describe('spreadsheet samples read back correctly', () => {
  for (const ext of ['xlsx', 'xls', 'ods']) {
    test(`wind-report.${ext}`, () => {
      const wb = XLSX.read(readFileSync(join(root, 'sheets', `wind-report.${ext}`)), { cellDates: true });
      expect(wb.SheetNames).toEqual(['十月 October', 'Event log']);
      const ws = wb.Sheets[wb.SheetNames[0]];
      expect(ws['A1'].v).toBe('风场月报 Wind farm monthly report');
      expect(ws['A5'].v).toBe('WTG-03');
      expect(ws['B3'].v).toBe(412.6);
    });
  }
});
