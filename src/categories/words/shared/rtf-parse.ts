/**
 * RTF → simple document model (no DOM; unit-tested).
 * Handles paragraphs, character formatting, colours, alignment, tables,
 * PNG/JPEG pictures, Unicode (\uN) and code-page bytes (\'hh) in any
 * language: each font declares a charset (GBK, Big5, Shift_JIS, Cyrillic…).
 */

import type { Block, Para, Run } from './doc-model';

export type { Block, Para, Run };

/** RTF \fcharsetN → WHATWG encoding label. */
const CHARSETS: Record<number, string> = {
  0: 'windows-1252', 1: 'windows-1252', 77: 'macintosh', 128: 'shift_jis', 129: 'euc-kr', 130: 'euc-kr',
  134: 'gb18030', 136: 'big5', 161: 'windows-1253', 162: 'windows-1254', 163: 'windows-1258', 177: 'windows-1255',
  178: 'windows-1256', 186: 'windows-1257', 204: 'windows-1251', 222: 'windows-874', 238: 'windows-1250',
};
/** \ansicpgN → label */
const CODEPAGES: Record<number, string> = {
  874: 'windows-874', 932: 'shift_jis', 936: 'gb18030', 949: 'euc-kr', 950: 'big5', 1250: 'windows-1250', 1251: 'windows-1251',
  1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258',
  10000: 'macintosh', 65001: 'utf-8',
};

/** Destinations whose content is not document text. */
const SKIP = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
  'fldinst', 'object', 'objdata', 'datastore', 'themedata', 'colorschememapping', 'latentstyles', 'listtable', 'listoverridetable',
  'rsidtbl', 'generator', 'xmlnstbl', 'mmathPr', 'filetbl', 'revtbl', 'pgdsctbl', 'bkmkstart', 'bkmkend', 'nonshppict', 'blipuid',
  'shppict-skip', 'sp', 'sn', 'sv', 'shpinst-skip', 'listtext', 'pntext', 'pntxta', 'pntxtb', 'wgrffmtfilter', 'docvar', 'template',
]);

interface State {
  b: boolean; i: boolean; u: boolean; strike: boolean; sup: boolean; sub: boolean;
  fs: number; cf: number; font: number; uc: number; skip: boolean; dest?: string;
}

const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

export function parseRtf(input: string): Block[] {
  if (!input.startsWith('{\\rtf')) throw new Error('Not an RTF document');

  let defaultEncoding = 'windows-1252';
  const fontCharset = new Map<number, string>();
  const colors: string[] = [];
  const blocks: Block[] = [];

  let para: Para = { type: 'para', runs: [] };
  let align: Para['align'];
  let pendingPageBreak = false;
  // Table building
  let inTable = false;
  /** \intbl in effect for the current paragraph (reset by \pard). */
  let intbl = false;
  let tableRows: Para[][][] = [];
  let rowCells: Para[][] = [];
  let cellParas: Para[] = [];

  let st: State = { b: false, i: false, u: false, strike: false, sup: false, sub: false, fs: 24, cf: 0, font: 0, uc: 1, skip: false };
  const stack: State[] = [];

  // Pending code-page bytes (multi-byte characters arrive as several \'hh).
  let bytes: number[] = [];
  let ucSkip = 0;

  const encodingNow = () => fontCharset.get(st.font) ?? defaultEncoding;
  const flushBytes = () => {
    if (!bytes.length) return;
    const text = new TextDecoder(encodingNow()).decode(new Uint8Array(bytes));
    bytes = [];
    addText(text);
  };
  const addText = (text: string) => {
    if (!text || st.skip) return;
    const last = para.runs[para.runs.length - 1];
    const fmt: Run = {
      text, b: st.b || undefined, i: st.i || undefined, u: st.u || undefined, strike: st.strike || undefined,
      sup: st.sup || undefined, sub: st.sub || undefined,
      sizePt: st.fs !== 24 ? st.fs / 2 : undefined, color: st.cf ? colors[st.cf] : undefined,
    };
    if (last && last.b === fmt.b && last.i === fmt.i && last.u === fmt.u && last.strike === fmt.strike && last.sizePt === fmt.sizePt && last.color === fmt.color && last.sup === fmt.sup && last.sub === fmt.sub) {
      last.text += text;
    } else {
      para.runs.push(fmt);
    }
  };
  const flushTable = () => {
    if (tableRows.length) blocks.push({ type: 'table', rows: tableRows });
    tableRows = [];
    inTable = false;
  };
  const endPara = () => {
    flushBytes();
    // A paragraph outside any cell closes a table in progress.
    if (!intbl && inTable && !rowCells.length && !cellParas.length) flushTable();
    para.align = align;
    if (pendingPageBreak) {
      para.pageBreakBefore = true;
      pendingPageBreak = false;
    }
    if (inTable) cellParas.push(para);
    else blocks.push(para);
    para = { type: 'para', runs: [] };
  };

  // Font table / colour table are parsed from their raw group text.
  const parseFontTable = (group: string) => {
    for (const m of group.matchAll(/\\f(\d+)[^;{}]*?\\fcharset(\d+)/g)) {
      const enc = CHARSETS[Number(m[2])];
      if (enc) fontCharset.set(Number(m[1]), enc);
    }
  };
  const parseColorTable = (group: string) => {
    const body = group.replace(/^\{\\colortbl\s*/, '').replace(/\}$/, '');
    for (const entry of body.split(';').slice(0, -1)) {
      const r = /\\red(\d+)/.exec(entry)?.[1];
      const g = /\\green(\d+)/.exec(entry)?.[1];
      const bl = /\\blue(\d+)/.exec(entry)?.[1];
      colors.push(r === undefined ? '' : `rgb(${r},${g ?? 0},${bl ?? 0})`);
    }
  };
  /** Returns the index just past the group that starts at `start` (which is a '{'). */
  const groupEnd = (start: number) => {
    let depth = 0;
    for (let k = start; k < input.length; k++) {
      const c = input[k];
      if (c === '\\') { k++; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return k + 1;
    }
    return input.length;
  };

  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === '{') {
      flushBytes();
      // Special groups handled as a whole.
      const ahead = input.slice(i, i + 14);
      if (ahead.startsWith('{\\fonttbl')) { const e = groupEnd(i); parseFontTable(input.slice(i, e)); i = e; continue; }
      if (ahead.startsWith('{\\colortbl')) { const e = groupEnd(i); parseColorTable(input.slice(i, e)); i = e; continue; }
      if (ahead.startsWith('{\\*\\shppict') || ahead.startsWith('{\\pict') || ahead.startsWith('{\\*\\blipuid')) {
        const e = groupEnd(i);
        const group = input.slice(i, e);
        const pict = /\\pict[\s\S]*?(\\pngblip|\\jpegblip)[\s\S]*?(?:\\picwgoal(\d+))?[\s\S]*?\s([0-9a-fA-F\s]{32,})\}*$/.exec(group);
        if (pict && !st.skip) {
          const hex = pict[3].replace(/\s+/g, '');
          const data = new Uint8Array(hex.length >> 1);
          for (let k = 0; k < data.length; k++) data[k] = parseInt(hex.substr(k * 2, 2), 16);
          endPara();
          blocks.push({ type: 'picture', mime: pict[1] === '\\pngblip' ? 'image/png' : 'image/jpeg', data, widthPt: pict[2] ? Number(pict[2]) / 20 : undefined });
        }
        i = e;
        continue;
      }
      stack.push({ ...st });
      i++;
      continue;
    }
    if (c === '}') {
      flushBytes();
      st = stack.pop() ?? st;
      i++;
      continue;
    }
    if (c === '\\') {
      const next = input[i + 1];
      if (next === undefined) break;
      // Control symbols
      if (next === "'") {
        const hex = input.substr(i + 2, 2);
        if (ucSkip > 0) ucSkip--;
        else if (!st.skip) bytes.push(parseInt(hex, 16));
        i += 4;
        continue;
      }
      if (next === '*') { st.skip = true; i += 2; continue; }
      if (next === '\\' || next === '{' || next === '}') { flushBytes(); if (ucSkip > 0) ucSkip--; else addText(next); i += 2; continue; }
      if (next === '~') { flushBytes(); addText(' '); i += 2; continue; }
      if (next === '-' || next === '_') { flushBytes(); if (next === '_') addText('‑'); i += 2; continue; }
      if (next === '\n' || next === '\r') { endPara(); i += 2; continue; }
      if (!isLetter(next)) { i += 2; continue; }
      // Control word: letters, optional signed number, optional single space.
      let j = i + 1;
      while (j < input.length && isLetter(input[j])) j++;
      const word = input.slice(i + 1, j);
      let k = j;
      if (input[k] === '-' || (input[k] >= '0' && input[k] <= '9')) {
        k++;
        while (k < input.length && input[k] >= '0' && input[k] <= '9') k++;
      }
      const hasParam = k > j;
      const param = hasParam ? parseInt(input.slice(j, k), 10) : undefined;
      if (input[k] === ' ') k++;
      i = k;

      if (word !== 'u' && word !== 'uc') flushBytes();
      if (SKIP.has(word)) { st.skip = true; continue; }
      if (st.skip) continue;
      switch (word) {
        case 'ansicpg': defaultEncoding = CODEPAGES[param ?? 1252] ?? defaultEncoding; break;
        case 'mac': defaultEncoding = 'macintosh'; break;
        case 'pc': case 'pca': defaultEncoding = 'ibm866'; break;
        case 'f': st.font = param ?? 0; break;
        case 'uc': st.uc = param ?? 1; break;
        case 'u': {
          flushBytes();
          let code = param ?? 0;
          if (code < 0) code += 65536;
          addText(String.fromCharCode(code));
          ucSkip = st.uc;
          continue;
        }
        case 'par': endPara(); break;
        case 'line': addText('\n'); break;
        case 'tab': addText('\t'); break;
        case 'page': endPara(); pendingPageBreak = true; break;
        case 'emdash': addText('—'); break;
        case 'endash': addText('–'); break;
        case 'bullet': addText('•'); break;
        case 'lquote': addText('‘'); break;
        case 'rquote': addText('’'); break;
        case 'ldblquote': addText('“'); break;
        case 'rdblquote': addText('”'); break;
        case 'b': st.b = param !== 0; break;
        case 'i': st.i = param !== 0; break;
        case 'ul': st.u = param !== 0; break;
        case 'ulnone': st.u = false; break;
        case 'strike': st.strike = param !== 0; break;
        case 'super': st.sup = param !== 0; break;
        case 'sub': st.sub = param !== 0; break;
        case 'nosupersub': st.sup = st.sub = false; break;
        case 'fs': st.fs = param ?? 24; break;
        case 'cf': st.cf = param ?? 0; break;
        case 'plain': st = { ...st, b: false, i: false, u: false, strike: false, sup: false, sub: false, fs: 24, cf: 0 }; break;
        case 'pard': align = undefined; intbl = false; break;
        case 'ql': align = 'left'; break;
        case 'qc': align = 'center'; break;
        case 'qr': align = 'right'; break;
        case 'qj': align = 'justify'; break;
        case 'trowd': inTable = true; intbl = true; break;
        case 'intbl': inTable = true; intbl = true; break;
        // \cell proves we're in a table, even when a writer omitted \intbl.
        case 'cell': intbl = true; endPara(); rowCells.push(cellParas); cellParas = []; break;
        case 'row':
          intbl = true;
          if (cellParas.length || para.runs.length) { endPara(); rowCells.push(cellParas); cellParas = []; }
          tableRows.push(rowCells);
          rowCells = [];
          break;
        default:
          break;
      }
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    // Plain text (raw high bytes are code-page bytes too).
    if (ucSkip > 0) { ucSkip--; i++; continue; }
    const code = c.charCodeAt(0);
    if (code >= 0x80) bytes.push(code);
    else { flushBytes(); addText(c); }
    i++;
  }
  flushBytes();
  if (para.runs.length) endPara();
  flushTable();
  // Drop trailing empty paragraphs.
  while (blocks.length) {
    const last = blocks[blocks.length - 1];
    if (last.type === 'para' && !last.runs.some((r) => r.text.trim())) blocks.pop();
    else break;
  }
  return blocks;
}

/** RTF files are 7-bit with escapes; read bytes 1:1 so raw code-page bytes survive. */
export function bytesToRtfString(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}
