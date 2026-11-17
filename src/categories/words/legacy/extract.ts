/**
 * Text from old binary Office files (Word 97–2003 .doc/.dot, PowerPoint
 * 97–2003 .ppt/.pps/.pot) and the WPS equivalents (.wps/.dps), which use the
 * same formats. Layout is not reproduced; text, paragraphs, tables (Word) and
 * slide titles/bodies (PowerPoint) are.
 *
 * Both are "compound files" (an OLE container); the caller provides the
 * streams. Word: [MS-DOC] FIB → Clx piece table. PowerPoint: [MS-PPT]
 * records, SlideListWithText or the slides' own text boxes.
 */
import type { Block, Para } from '../shared/doc-model';

// ----------------------------------------------------------------- Word

/** 0x80–0x9F as Word stores them in "compressed" (8-bit) pieces. */
const CP1252_HIGH =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F' +
  '\u0090‘’“”•–—˜™š›œ\u009DžŸ';

export function docText(wordDocument: Uint8Array, tableStreams: { '0Table'?: Uint8Array; '1Table'?: Uint8Array }): string {
  const fib = new DataView(wordDocument.buffer, wordDocument.byteOffset, wordDocument.byteLength);
  const ident = fib.getUint16(0, true);
  if (ident !== 0xa5ec && ident !== 0xa5dc) throw new Error('Not a Word document');
  const nFib = fib.getUint16(2, true);
  if (nFib < 193) return word6Text(wordDocument, fib);
  const flags = fib.getUint16(0x0a, true);
  if (flags & 0x0100) throw new Error('This document is password-protected');
  const table = flags & 0x0200 ? tableStreams['1Table'] : tableStreams['0Table'];
  if (!table) throw new Error('The document table stream is missing');

  // Locate fcClx/lcbClx generically (FibRgW, FibRgLw sizes vary by version).
  const csw = fib.getUint16(32, true);
  const rgLw = 34 + csw * 2 + 2;
  const cslw = fib.getUint16(34 + csw * 2, true);
  const ccpText = fib.getInt32(rgLw + 3 * 4, true);
  const blob = rgLw + cslw * 4 + 2;
  const fcClx = fib.getUint32(blob + 33 * 8, true);
  const lcbClx = fib.getUint32(blob + 33 * 8 + 4, true);

  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let pos = fcClx;
  const end = fcClx + lcbClx;
  // Skip Prc entries (0x01), then Pcdt (0x02).
  while (pos < end && table[pos] === 0x01) pos += 3 + t.getInt16(pos + 1, true);
  if (table[pos] !== 0x02) throw new Error('No text found in this document');
  const lcb = t.getUint32(pos + 1, true);
  const plc = pos + 5;
  const n = (lcb - 4) / 12;
  let text = '';
  for (let i = 0; i < n && text.length < ccpText; i++) {
    const cpStart = t.getUint32(plc + i * 4, true);
    const cpEnd = t.getUint32(plc + (i + 1) * 4, true);
    const raw = t.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true);
    const compressed = (raw & 0x40000000) !== 0;
    const fc = raw & 0x3fffffff;
    const len = cpEnd - cpStart;
    if (compressed) {
      const start = fc / 2;
      let piece = '';
      for (let k = 0; k < len; k++) {
        const b = wordDocument[start + k];
        piece += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b);
      }
      text += piece;
    } else {
      text += new TextDecoder('utf-16le').decode(wordDocument.subarray(fc, fc + len * 2));
    }
  }
  return text.slice(0, ccpText);
}

/** Windows language id → code page, for Word 6/95 8-bit text. */
function codePageForLid(lid: number): string {
  const primary = lid & 0x3ff;
  if (lid === 0x0804 || lid === 0x1004) return 'gb18030'; // Chinese (PRC, Singapore)
  if (lid === 0x0404 || lid === 0x0c04 || lid === 0x1404) return 'big5'; // Chinese (Taiwan, HK, Macau)
  const byPrimary: Record<number, string> = {
    0x11: 'shift_jis', 0x12: 'euc-kr', 0x19: 'windows-1251', 0x22: 'windows-1251', 0x23: 'windows-1251', 0x02: 'windows-1251',
    0x1a: 'windows-1250', 0x05: 'windows-1250', 0x0e: 'windows-1250', 0x15: 'windows-1250', 0x18: 'windows-1250', 0x1b: 'windows-1250', 0x24: 'windows-1250',
    0x08: 'windows-1253', 0x1f: 'windows-1254', 0x0d: 'windows-1255', 0x01: 'windows-1256', 0x29: 'windows-1256',
    0x25: 'windows-1257', 0x26: 'windows-1257', 0x27: 'windows-1257', 0x2a: 'windows-1258', 0x1e: 'windows-874',
  };
  return byPrimary[primary] ?? 'windows-1252';
}

/** Word 6/95: unless fast-saved, the main text is one 8-bit run in the document's code page. */
function word6Text(doc: Uint8Array, fib: DataView): string {
  const flags = fib.getUint16(0x0a, true);
  if (flags & 0x0100) throw new Error('This document is password-protected');
  if (flags & 0x0004) throw new Error('This Word 6/95 document was "fast saved"; open and re-save it in Word to read it here');
  const fcMin = fib.getUint32(0x18, true);
  const fcMac = fib.getUint32(0x1c, true);
  const ccpText = fib.getInt32(0x34, true);
  const len = Math.min(fcMac - fcMin, ccpText > 0 ? ccpText : fcMac - fcMin);
  const lid = fib.getUint16(0x06, true);
  return new TextDecoder(codePageForLid(lid)).decode(doc.subarray(fcMin, fcMin + len));
}

/** Word's text with control characters → paragraphs and tables. */
export function docBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let buf = '';
  let fieldDepth = 0;
  const fieldShowing: boolean[] = [];
  let pageBreak = false;
  let rowCells: Para[][] = [];
  let tableRows: Para[][][] = [];
  let cellParas: Para[] = [];
  let lastWasCellEnd = false;

  const para = (s: string): Para => {
    const p: Para = { type: 'para', runs: s ? [{ text: s }] : [] };
    if (pageBreak) {
      p.pageBreakBefore = true;
      pageBreak = false;
    }
    return p;
  };
  const flushTable = () => {
    if (tableRows.length) blocks.push({ type: 'table', rows: tableRows });
    tableRows = [];
  };

  for (const ch of text) {
    const c = ch.charCodeAt(0);
    // Fields: \x13 instructions \x14 result \x15 — keep only the result.
    if (c === 0x13) { fieldDepth++; fieldShowing.push(false); continue; }
    if (c === 0x14) { if (fieldShowing.length) fieldShowing[fieldShowing.length - 1] = true; continue; }
    if (c === 0x15) { fieldDepth = Math.max(0, fieldDepth - 1); fieldShowing.pop(); continue; }
    if (fieldDepth && !fieldShowing[fieldShowing.length - 1]) continue;

    if (c === 0x07) {
      // Cell end; a second mark right after a cell ends the row.
      if (lastWasCellEnd && !buf && !cellParas.length) {
        if (rowCells.length) tableRows.push(rowCells);
        rowCells = [];
      } else {
        cellParas.push(para(buf));
        rowCells.push(cellParas);
        cellParas = [];
      }
      buf = '';
      lastWasCellEnd = true;
      continue;
    }
    lastWasCellEnd = false;
    if (c === 0x0d) {
      if (rowCells.length) cellParas.push(para(buf)); // a paragraph inside a cell
      else {
        flushTable();
        blocks.push(para(buf));
      }
      buf = '';
    } else if (c === 0x0c) {
      if (buf) { blocks.push(para(buf)); buf = ''; }
      pageBreak = true;
    } else if (c === 0x0b) buf += '\n';
    else if (c === 0x09) buf += '\t';
    else if (c === 0x1e) buf += '-';
    else if (c === 0x1f || c === 0x01 || c === 0x08 || c === 0x02 || c === 0x05 || c < 0x09) continue;
    else buf += ch;
  }
  if (buf) blocks.push(para(buf));
  flushTable();
  while (blocks.length && blocks[blocks.length - 1].type === 'para' && !(blocks[blocks.length - 1] as Para).runs.length) blocks.pop();
  return blocks;
}

// ------------------------------------------------------------ PowerPoint

export interface PptSlide {
  title: string[];
  body: string[];
}

const SLIDE_LIST_WITH_TEXT = 0x0ff0;
const SLIDE_PERSIST_ATOM = 0x03f3;
const TEXT_HEADER_ATOM = 0x0f9f;
const TEXT_CHARS_ATOM = 0x0fa0;
const TEXT_BYTES_ATOM = 0x0fa8;
const SLIDE = 0x03ee;

interface Rec {
  type: number;
  instance: number;
  container: boolean;
  start: number;
  len: number;
}

function* records(d: Uint8Array, start: number, end: number): Generator<Rec> {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let p = start;
  while (p + 8 <= end) {
    const verInst = dv.getUint16(p, true);
    const type = dv.getUint16(p + 2, true);
    const len = dv.getUint32(p + 4, true);
    if (p + 8 + len > end || len > d.length) return;
    yield { type, instance: verInst >> 4, container: (verInst & 0xf) === 0xf, start: p + 8, len };
    p += 8 + len;
  }
}

function textOf(d: Uint8Array, r: Rec): string {
  if (r.type === TEXT_CHARS_ATOM) return new TextDecoder('utf-16le').decode(d.subarray(r.start, r.start + r.len));
  let s = '';
  for (let i = 0; i < r.len; i++) {
    const b = d[r.start + i];
    s += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b);
  }
  return s;
}

const lines = (s: string) => s.split(/[\r\v]/).map((x) => x.trim()).filter(Boolean);

export function pptSlides(stream: Uint8Array): PptSlide[] {
  const slides: PptSlide[] = [];

  // 1) Classic: text kept in SlideListWithText (instance 0 = slides).
  // "Fast save" appends edits and leaves older copies in the file; the
  // current slide list is the last one written.
  const lists: PptSlide[][] = [];
  const walk = (start: number, end: number) => {
    for (const r of records(stream, start, end)) {
      if (r.type === SLIDE_LIST_WITH_TEXT && r.container && r.instance === 0) {
        const list: PptSlide[] = [];
        let current: PptSlide | null = null;
        let textType = 1;
        for (const a of records(stream, r.start, r.start + r.len)) {
          if (a.type === SLIDE_PERSIST_ATOM) list.push((current = { title: [], body: [] }));
          else if (a.type === TEXT_HEADER_ATOM) textType = new DataView(stream.buffer, stream.byteOffset + a.start, 4).getUint32(0, true);
          else if ((a.type === TEXT_CHARS_ATOM || a.type === TEXT_BYTES_ATOM) && current) {
            (textType === 0 || textType === 6 ? current.title : current.body).push(...lines(textOf(stream, a)));
          }
        }
        lists.push(list);
      } else if (r.container && r.type !== SLIDE) walk(r.start, r.start + r.len);
    }
  };
  walk(0, stream.length);
  const latest = [...lists].reverse().find((l) => l.some((s) => s.title.length || s.body.length));
  if (latest) return latest;

  // 2) Newer writers keep text inside each slide's own text boxes.
  slides.length = 0;
  const collect = (start: number, end: number, into: PptSlide, state: { type: number }) => {
    for (const r of records(stream, start, end)) {
      if (r.type === TEXT_HEADER_ATOM) state.type = new DataView(stream.buffer, stream.byteOffset + r.start, 4).getUint32(0, true);
      else if (r.type === TEXT_CHARS_ATOM || r.type === TEXT_BYTES_ATOM) (state.type === 0 || state.type === 6 ? into.title : into.body).push(...lines(textOf(stream, r)));
      else if (r.container || (r.type >= 0xf000 && r.type <= 0xf122)) collect(r.start, r.start + r.len, into, state);
    }
  };
  const findSlides = (start: number, end: number) => {
    for (const r of records(stream, start, end)) {
      if (r.type === SLIDE && r.container) {
        const s: PptSlide = { title: [], body: [] };
        collect(r.start, r.start + r.len, s, { type: 1 });
        slides.push(s);
      } else if (r.container) findSlides(r.start, r.start + r.len);
    }
  };
  findSlides(0, stream.length);
  return slides;
}
