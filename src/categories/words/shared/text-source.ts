/**
 * Text that came from a file (bytes + detected encoding) or from the clipboard.
 * Shared by the Text and Sheets viewers: decoding, re-decoding with another
 * encoding, double-encoding repair, and the toolbar/notice UI for all of that.
 */
import { h } from '../../../core/dom';
import { lang, strings } from '../../../core/i18n';
import { decode } from './encoding/codec';
import { detectEncoding, isBinaryResult, warmDetector, type EncodingResult } from './encoding/detect';
import { repairMojibake, type RepairResult } from './encoding/mojibake';
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

  /** The text to show: repaired unless the user asked for the original. */
  get text(): string {
    return this.repair && !this.showOriginal ? this.repair.text : this.raw;
  }

  setEncoding(label: string): void {
    if (!this.bytes) return;
    const d = this.detected;
    const encoding = label === 'auto' ? d?.encoding ?? 'utf-8' : label;
    const skip = d && encoding === d.encoding ? d.bomLength : 0;
    this.encoding = encoding;
    this.raw = decode(this.bytes.subarray(skip), encoding);
    this.repair = encoding === 'utf-8' ? repairMojibake(this.raw) : null;
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
    if (det && this.bytes && this.encoding === det.encoding) {
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
    return out;
  }
}
