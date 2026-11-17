/**
 * Outlook often stores an HTML email wrapped inside RTF ("\fromhtml1",
 * [MS-OXRTFEX]). This recovers the original HTML: text inside
 * {\*\htmltagN …} groups and ordinary text are kept; regions between
 * \htmlrtf and \htmlrtf0 exist only for RTF readers and are dropped.
 */

const CODEPAGES: Record<number, string> = {
  932: 'shift_jis', 936: 'gb18030', 949: 'euc-kr', 950: 'big5', 874: 'windows-874', 1250: 'windows-1250', 1251: 'windows-1251',
  1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 65001: 'utf-8',
};

export const isHtmlInRtf = (rtf: string) => /\\fromhtml1/.test(rtf.slice(0, 2000));

export function htmlFromRtf(rtf: string): string {
  const cp = Number(/\\ansicpg(\d+)/.exec(rtf.slice(0, 2000))?.[1] ?? 1252);
  const decoder = new TextDecoder(CODEPAGES[cp] ?? 'windows-1252');
  let out = '';
  let bytes: number[] = [];
  const flush = () => {
    if (bytes.length) {
      out += decoder.decode(new Uint8Array(bytes));
      bytes = [];
    }
  };
  const emit = (s: string) => {
    flush();
    out += s;
  };

  // Group stack: does this group belong to an \htmltag? Is it ignorable?
  const stack: Array<{ tag: boolean; skip: boolean }> = [];
  let tag = false;
  let skip = false;
  let htmlrtf = false;
  let ucSkip = 0;
  let uc = 1;

  let i = 0;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') {
      stack.push({ tag, skip });
      i++;
      // {\*\htmltagN …}: HTML source; other {\* …} destinations are ignored.
      if (rtf.startsWith('\\*\\htmltag', i)) {
        tag = true;
        i += 10;
        while (/[0-9]/.test(rtf[i])) i++;
        if (rtf[i] === ' ') i++;
      } else if (rtf.startsWith('\\*', i)) {
        skip = true;
      } else if (/^\\(fonttbl|colortbl|stylesheet|info|pict)\b/.test(rtf.slice(i, i + 12))) {
        skip = true;
      }
      continue;
    }
    if (c === '}') {
      flush();
      ({ tag, skip } = stack.pop() ?? { tag: false, skip: false });
      i++;
      continue;
    }
    if (c === '\\') {
      const n = rtf[i + 1];
      if (n === "'") {
        if (ucSkip > 0) ucSkip--;
        else if (!skip && (tag || !htmlrtf)) bytes.push(parseInt(rtf.substr(i + 2, 2), 16));
        i += 4;
        continue;
      }
      if (n === '\\' || n === '{' || n === '}') {
        if (!skip && (tag || !htmlrtf)) emit(n);
        i += 2;
        continue;
      }
      if (n === '~') { if (!skip && (tag || !htmlrtf)) emit(' '); i += 2; continue; }
      if (!/[a-zA-Z]/.test(n ?? '')) { i += 2; continue; }
      let j = i + 1;
      while (j < rtf.length && /[a-zA-Z]/.test(rtf[j])) j++;
      const word = rtf.slice(i + 1, j);
      let k = j;
      if (rtf[k] === '-' || /[0-9]/.test(rtf[k] ?? '')) {
        k++;
        while (/[0-9]/.test(rtf[k] ?? '')) k++;
      }
      const param = k > j ? Number(rtf.slice(j, k)) : undefined;
      if (rtf[k] === ' ') k++;
      i = k;
      if (word === 'htmlrtf') { htmlrtf = param !== 0; continue; }
      if (skip || (!tag && htmlrtf)) continue;
      if (word === 'par' || word === 'line') emit('\r\n');
      else if (word === 'tab') emit('\t');
      else if (word === 'uc') uc = param ?? 1;
      else if (word === 'u') {
        let code = param ?? 0;
        if (code < 0) code += 65536;
        emit(String.fromCharCode(code));
        ucSkip = uc;
      }
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (ucSkip > 0) { ucSkip--; i++; continue; }
    if (!skip && (tag || !htmlrtf)) {
      const code = c.charCodeAt(0);
      if (code >= 0x80) bytes.push(code);
      else emit(c);
    }
    i++;
  }
  flush();
  return out;
}
