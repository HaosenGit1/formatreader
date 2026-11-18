/**
 * Text that came from a file (bytes + detected encoding) or from the clipboard.
 * Shared by the Text and Sheets viewers: decoding, re-decoding with another
 * encoding, double-encoding repair, and the toolbar/notice UI for all of that.
 */
import { formatBytes, h } from '../../../core/dom';
import type { AboutFacts } from '../../../core/viewer';
import { lang, strings } from '../../../core/i18n';
import { decode } from './encoding/codec';
import { detectEncoding, isBinaryResult, warmDetector, type EncodingResult } from './encoding/detect';
import { decodeEscapes, type DecodedText, type EscapeKind } from './encoding/escapes';
import { destroyedKind, repairMojibake, type RepairResult } from './encoding/mojibake';
import { lostToQuestionMarks } from './encoding/question-loss';
import { ENCODING_CHOICES, encodingName } from './encoding/names';

const s = strings({
  encoding: { en: 'Encoding', zh: '编码' },
  auto: { en: 'Auto', zh: '自动' },
  detected: { en: 'Detected', zh: '检测为' },
  bestGuess: { en: 'Best guess:', zh: '最可能是：' },
  marked: { en: 'Encoding marked inside the file:', zh: '文件内标明的编码：' },
  legacyNote: {
    en: 'Apps that assume UTF-8 show this file as garbled text — here it is decoded correctly.',
    zh: '默认用 UTF-8 打开的软件会把这个文件显示成乱码，这里已按正确编码显示。',
  },
  lowConfidence: { en: 'Not sure? Try another encoding from the list.', zh: '不确定？可以在列表里换一种编码试试。' },
  repaired: {
    en: 'This text had been garbled and saved that way. It was repaired automatically.',
    zh: '这段文字之前被错误编码并保存过，已自动修复。',
  },
  lostOne: {
    en: 'character (shown as �) was already destroyed in the file and cannot be recovered.',
    zh: '个字符（显示为 �）在文件里已经损坏，无法恢复。',
  },
  lostMany: {
    en: 'characters (shown as �) were already destroyed in the file and cannot be recovered.',
    zh: '个字符（显示为 �）在文件里已经损坏，无法恢复。',
  },
  showOriginal: { en: 'Show original', zh: '查看原文' },
  questionLoss: {
    en: '{n} characters in this file are “?”: the original text (often Chinese, Japanese, Korean, Arabic…) was replaced when the file was saved in a format that could not hold it, such as Excel’s “CSV (Comma delimited)”. It is not in the file any more and cannot be recovered. Use the original file, or save it again as “CSV UTF-8”.',
    zh: '这个文件里有 {n} 个“?”：原来的文字（常见于中文、日文、韩文、阿拉伯文等）在保存时被替换掉了，原因是保存格式无法容纳这些文字，例如 Excel 的“CSV（逗号分隔）”。文件中已没有原文，无法恢复。请使用原始文件，或重新另存为“CSV UTF-8”。',
  },
  decodedPrefix: { en: 'This text was encoded as', zh: '这段文字是以下列方式编码的：' },
  decodedSuffix: { en: '— shown decoded.', zh: '——已解码显示。' },
  unicode: { en: 'Unicode escapes (\\u…)', zh: 'Unicode 转义（\\u…）' },
  url: { en: 'URL encoding (%…)', zh: 'URL 编码（%…）' },
  html: { en: 'HTML entities (&#…;)', zh: 'HTML 实体（&#…;）' },
  base64: { en: 'Base64', zh: 'Base64' },
  octal: { en: 'octal byte escapes (\\344…)', zh: '八进制字节转义（\\344…）' },
  qp: { en: 'quoted-printable (=E4…)', zh: 'Quoted-Printable 编码（=E4…）' },
  mime: { en: 'MIME encoded words (=?…?=)', zh: 'MIME 编码字（=?…?=）' },
  destroyedLost: {
    en: 'Characters in this text were destroyed before it was saved: “锟斤拷” / “嚙踝蕭” are what lost characters turn into after a wrong conversion. The original text is not in the file any more and cannot be recovered; use the original file.',
    zh: '这段文字在保存前就已经损坏：“锟斤拷”“嚙踝蕭”是字符在错误转换中丢失后留下的痕迹。原文已不在文件中，无法恢复，请使用原始文件。',
  },
  destroyedMemory: {
    en: '“烫烫烫” / “屯屯屯” is not text: it is empty memory written out by a program bug (Visual C++ debug builds fill memory with these bytes). There is nothing to recover.',
    zh: '“烫烫烫”“屯屯屯”不是文字，而是程序错误写出的空白内存（Visual C++ 调试版本会用这些字节填充内存）。这里没有可恢复的内容。',
  },
  showDecoded: { en: 'Show decoded', zh: '查看解码后' },
  partialStart: { en: 'This file is very large ({total}): browsers can’t show it all at once, so the first {shown} are shown.', zh: '这个文件非常大（{total}）：浏览器无法一次显示全部，这里显示前 {shown}。' },
  partialEnd: { en: 'This file is very large ({total}): the last {shown} are shown (the newest lines of a log).', zh: '这个文件非常大（{total}）：这里显示最后 {shown}（日志中最新的部分）。' },
  showEnd: { en: 'Show the end instead', zh: '改为显示末尾' },
  showStart: { en: 'Show the beginning instead', zh: '改为显示开头' },
  showRepaired: { en: 'Show repaired', zh: '查看修复后' },
});

// This module is prefetched with the text viewers; warm the detector for likely users.
warmDetector();

export class TextSource {
  private constructor(
    readonly bytes: Uint8Array | null,
    readonly detected: EncodingResult | null,
    public encoding: string,
    private raw: string,
    public repair: RepairResult | null,
    public showOriginal = false,
  ) {}

  /** Set when only part of a very large file is shown. */
  partial: { part: 'start' | 'end'; shown: number; total: number; toggle?: () => void } | null = null;

  /** Escapes/Base64 decoding: only viewers meant for reading text turn this on. */
  private decodeEnabled = false;
  decoded: DecodedText | null = null;
  /** "?"-replaced characters, computed once per decoded text. */
  private qFor: string | null = null;
  private qLost = 0;

  /** Show \\u…, %…, &#…; and Base64 text decoded when the whole text is encoded that way. */
  enableDecoding(): this {
    this.decodeEnabled = true;
    this.decoded = this.repair ? null : decodeEscapes(this.raw);
    return this;
  }

  /** Returns null when the bytes are binary, not text. */
  static async fromBytes(bytes: Uint8Array): Promise<TextSource | null> {
    const detected = await detectEncoding(bytes);
    if (isBinaryResult(detected)) return null;
    const raw = decode(bytes.subarray(detected.bomLength), detected.encoding);
    const repair = detected.encoding === 'utf-8' ? repairMojibake(raw) : null;
    return new TextSource(bytes, detected, detected.encoding, raw, repair);
  }

  static fromPasted(text: string): TextSource {
    return new TextSource(null, null, 'utf-8', text, repairMojibake(text));
  }

  /** The file's text as decoded with its encoding (before any 乱码 repair or decoding). */
  get original(): string {
    return this.raw;
  }

  /** Facts for the "About this file" panel. */
  about(): AboutFacts {
    const raw = this.raw.slice(0, 200000);
    const crlf = (raw.match(/\r\n/g) ?? []).length;
    const lf = (raw.match(/(?<!\r)\n/g) ?? []).length;
    const cr = (raw.match(/\r(?!\n)/g) ?? []).length;
    const kinds = [crlf && 'CRLF', lf && 'LF', cr && 'CR'].filter(Boolean) as Array<'CRLF' | 'LF' | 'CR'>;
    const destroyed = destroyedKind(this.raw);
    return {
      encoding: this.encoding,
      bom: !!this.detected && this.detected.bomLength > 0 && this.encoding === this.detected.encoding,
      lineEnding: kinds.length > 1 ? 'mixed' : kinds[0],
      repaired: this.repair && !this.showOriginal ? this.repair.layers : undefined,
      escapes: this.decoded && !this.showOriginal ? this.decoded.kinds : undefined,
      damage: destroyed ?? (this.questionLost() > 0 ? 'question' : undefined),
    };
  }

  private questionLost(): number {
    if (this.qFor !== this.raw) {
      this.qFor = this.raw;
      this.qLost = lostToQuestionMarks(this.raw);
    }
    return this.qLost;
  }

  /** The text to show: repaired or decoded, unless the user asked for the original. */
  get text(): string {
    if (this.showOriginal) return this.raw;
    return this.repair?.text ?? this.decoded?.text ?? this.raw;
  }

  setEncoding(label: string): void {
    if (!this.bytes) return;
    const d = this.detected;
    const encoding = label === 'auto' ? d?.encoding ?? 'utf-8' : label;
    const skip = d && encoding === d.encoding ? d.bomLength : 0;
    this.encoding = encoding;
    this.raw = decode(this.bytes.subarray(skip), encoding);
    this.repair = encoding === 'utf-8' ? repairMojibake(this.raw) : null;
    this.decoded = this.decodeEnabled && !this.repair ? decodeEscapes(this.raw) : null;
    this.showOriginal = false;
  }

  /** Encoding dropdown for the toolbar (files only). */
  tool(onChange: () => void): HTMLElement | null {
    if (!this.bytes) return null;
    const detected = this.detected?.encoding ?? 'utf-8';
    const select = h('select', {
      class: 'enc-select',
      'aria-label': s('encoding'),
      onchange: (e: Event) => {
        this.setEncoding((e.target as HTMLSelectElement).value);
        onChange();
      },
    }) as HTMLSelectElement;
    select.append(h('option', { value: 'auto' }, `${s('auto')} · ${encodingName(detected, lang())}`));
    const seen = new Set<string>();
    for (const label of [...(this.detected?.alternatives ?? []), ...ENCODING_CHOICES.map((c) => c.label)]) {
      if (seen.has(label)) continue;
      seen.add(label);
      select.append(h('option', { value: label }, encodingName(label, lang())));
    }
    select.value = this.encoding === detected ? 'auto' : this.encoding;
    return h('label', { class: 'tool' }, h('span', { class: 'tool-label' }, s('encoding')), select);
  }

  /** Explanations shown under the toolbar. */
  notices(onChange: () => void): HTMLElement[] {
    const out: HTMLElement[] = [];
    const det = this.detected;
    const qLost = this.questionLost();
    if (this.partial) {
      const p = this.partial;
      const text = s(p.part === 'end' ? 'partialEnd' : 'partialStart').replace('{shown}', formatBytes(p.shown)).replace('{total}', formatBytes(p.total));
      out.push(h('div', { class: 'notice' }, text, p.toggle ? ' ' : '', p.toggle ? h('button', { type: 'button', class: 'link', onclick: p.toggle }, s(p.part === 'end' ? 'showStart' : 'showEnd')) : null));
    }
    const destroyed = destroyedKind(this.raw);
    if (destroyed) out.push(h('div', { class: 'notice warn' }, s(destroyed === 'lost' ? 'destroyedLost' : 'destroyedMemory')));
    if (qLost) out.push(h('div', { class: 'notice warn' }, s('questionLoss').replace('{n}', qLost.toLocaleString())));
    // "Decoded correctly" would contradict the loss notice: the text is gone whatever the encoding.
    if (det && this.bytes && this.encoding === det.encoding && !qLost) {
      const name = encodingName(det.encoding, lang());
      if (det.reason === 'statistical' || det.reason === 'fallback') {
        out.push(
          h(
            'div',
            { class: 'notice' },
            h('strong', {}, `${det.reason === 'fallback' ? s('bestGuess') : s('detected')} ${name}`),
            det.reason === 'statistical' ? ` (${Math.round(det.confidence * 100)}%)` : '',
            ' — ',
            s('legacyNote'),
            det.confidence < 0.5 ? ` ${s('lowConfidence')}` : '',
          ),
        );
      } else if (det.reason === 'bom' && det.encoding !== 'utf-8') {
        out.push(h('div', { class: 'notice subtle' }, `${s('marked')} ${name}`));
      } else if (det.reason === 'utf16-pattern') {
        out.push(h('div', { class: 'notice subtle' }, `${s('detected')} ${name}`));
      }
    }
    if (this.repair) {
      const lost = this.repair.lost;
      out.push(
        h(
          'div',
          { class: 'notice good' },
          s('repaired'),
          lost ? ` ${lost} ${lost === 1 ? s('lostOne') : s('lostMany')}` : '',
          ' ',
          h(
            'button',
            {
              type: 'button',
              class: 'link',
              onclick: () => {
                this.showOriginal = !this.showOriginal;
                onChange();
              },
            },
            this.showOriginal ? s('showRepaired') : s('showOriginal'),
          ),
        ),
      );
    }
    if (this.decoded) {
      const names = this.decoded.kinds.map((k: EscapeKind) => s(k)).join(' → ');
      out.push(
        h(
          'div',
          { class: 'notice good' },
          `${s('decodedPrefix')} ${names} ${s('decodedSuffix')} `,
          h(
            'button',
            {
              type: 'button',
              class: 'link',
              onclick: () => {
                this.showOriginal = !this.showOriginal;
                onChange();
              },
            },
            this.showOriginal ? s('showDecoded') : s('showOriginal'),
          ),
        ),
      );
    }
    return out;
  }
}
