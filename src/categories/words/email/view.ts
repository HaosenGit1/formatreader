/**
 * Email viewer: EML, MBOX (mailboxes), Outlook MSG, and MHTML saved pages.
 * HTML bodies render in a sandbox with scripts and remote content blocked
 * (no tracking pixels). Attachments open in FormatReader itself.
 */
import './email.css';
import { formatBytes, h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { renderPaper } from '../shared/paper';
import { bytesToRtfString, parseRtf } from '../shared/rtf-parse';
import type { Block } from '../shared/doc-model';
import { latin1, mhtmlToHtml } from './mhtml';
import { htmlFromRtf, isHtmlInRtf } from './rtf-html';

const s = strings({
  from: { en: 'From', zh: '发件人' },
  to: { en: 'To', zh: '收件人' },
  cc: { en: 'Cc', zh: '抄送' },
  date: { en: 'Date', zh: '日期' },
  attachments: { en: 'Attachments', zh: '附件' },
  openHint: { en: 'Click an attachment to open it here.', zh: '点击附件即可在这里打开。' },
  remoteBlocked: { en: 'Remote images and scripts are blocked for your privacy.', zh: '为保护隐私，已阻止远程图片和脚本。' },
  messages: { en: 'messages', zh: '封邮件' },
  noSubject: { en: '(no subject)', zh: '（无主题）' },
  savedPage: { en: 'Saved web page', zh: '保存的网页' },
  resources: { en: 'resources inside', zh: '个内嵌资源' },
  pageNote: { en: 'Shown from the file only — nothing is loaded from the internet, and scripts do not run.', zh: '仅显示文件中的内容——不会从网络加载任何东西，也不会运行脚本。' },
});

interface Attachment {
  name: string;
  type: string;
  data: Uint8Array;
}
interface Message {
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  html?: string;
  text?: string;
  /** Body that only exists as RTF (common in Outlook), already converted. */
  rtf?: Block[];
  attachments: Attachment[];
  /** Inline pictures referenced from the HTML body (cid:…). */
  inline: Map<string, Attachment>;
}

const addr = (a?: { name?: string; address?: string } | null) => (a ? (a.name && a.address ? `${a.name} <${a.address}>` : a.name || a.address || '') : '');
const addrs = (list?: Array<{ name?: string; address?: string; group?: Array<{ name?: string; address?: string }> }>) =>
  (list ?? []).flatMap((a) => (a.group ? a.group : [a])).map(addr).filter(Boolean).join(', ');
const when = (d?: string | null) => {
  if (!d) return '';
  const t = new Date(d);
  return isNaN(t.getTime()) ? d : t.toLocaleString();
};
const u8 = (b: ArrayBuffer | Uint8Array | string) => (typeof b === 'string' ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b));

// --------------------------------------------------------------- parsers

async function parseEml(bytes: Uint8Array): Promise<Message> {
  const { default: PostalMime } = await import('postal-mime');
  const m = await PostalMime.parse(bytes);
  const attachments: Attachment[] = [];
  const inline = new Map<string, Attachment>();
  for (const a of m.attachments) {
    const att = { name: a.filename || `attachment.${(a.mimeType.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '')}`, type: a.mimeType, data: u8(a.content) };
    const cid = a.contentId?.replace(/^<|>$/g, '');
    if (cid && (a.related || a.disposition === 'inline')) inline.set(cid, att);
    else attachments.push(att);
  }
  return {
    subject: m.subject ?? '',
    from: addr(m.from),
    to: addrs(m.to),
    cc: addrs(m.cc),
    date: when(m.date),
    html: m.html ?? undefined,
    text: m.text ?? undefined,
    attachments,
    inline,
  };
}

async function parseMsg(data: ArrayBuffer): Promise<Message> {
  // msgreader decodes old code pages with iconv-lite, which expects Buffer.
  const { Buffer } = await import('buffer');
  (globalThis as { Buffer?: unknown }).Buffer ??= Buffer;
  // CommonJS package: depending on the bundler the class is .default or .default.default.
  const mod = (await import('@kenjiuno/msgreader')) as unknown as { default: unknown };
  const inner = mod.default as { default?: unknown };
  const MsgReader = (typeof inner === 'function' ? inner : inner.default) as typeof import('@kenjiuno/msgreader').default;
  let reader = new MsgReader(data);
  let d = reader.getFileData();
  // Old (non-Unicode) messages store text in the sender's code page, e.g. 932
  // for Japanese: read again with that encoding so it isn't garbled.
  const cp = d.messageCodepage ?? d.internetCodepage;
  const ansi = cp ? CODEPAGE_NAMES[cp] : undefined;
  if (ansi && ansi !== 'windows-1252') {
    try {
      const again = new MsgReader(data);
      again.parserConfig = { ansiEncoding: ansi };
      const d2 = again.getFileData();
      reader = again;
      d = d2;
    } catch {
      /* encoding unsupported: keep the first reading */
    }
  }
  const recipients = d.recipients ?? [];
  const who = (type: string) => recipients.filter((r) => (r.recipType ?? 'to') === type).map((r) => (r.name && r.email && r.name !== r.email ? `${r.name} <${r.email}>` : r.name || r.email || '')).filter(Boolean).join(', ');
  const attachments: Attachment[] = [];
  const inline = new Map<string, Attachment>();
  for (const att of d.attachments ?? []) {
    if (att.innerMsgContent) continue;
    try {
      const file = reader.getAttachment(att);
      const a = { name: file.fileName || att.fileName || 'attachment', type: att.attachMimeTag ?? 'application/octet-stream', data: file.content };
      if (att.pidContentId && att.attachmentHidden) inline.set(att.pidContentId.replace(/^<|>$/g, ''), a);
      else attachments.push(a);
    } catch {
      /* unreadable attachment: skip it */
    }
  }
  let html = d.bodyHtml ?? (d.html ? new TextDecoder('utf-8').decode(d.html) : undefined);
  // Many Outlook messages keep the real body only as compressed RTF, often
  // with the original HTML wrapped inside it.
  let rtf: Block[] | undefined;
  if (!html && d.compressedRtf) {
    try {
      const mod2 = (await import('@kenjiuno/decompressrtf')) as unknown as { decompressRTF?: (a: number[]) => number[]; default?: { decompressRTF: (a: number[]) => number[] } };
      const decompress = mod2.decompressRTF ?? mod2.default!.decompressRTF;
      const rtfText = bytesToRtfString(new Uint8Array(decompress(Array.from(d.compressedRtf))));
      if (isHtmlInRtf(rtfText)) html = htmlFromRtf(rtfText);
      else if (!(d.body ?? '').trim()) rtf = parseRtf(rtfText);
    } catch {
      /* keep the plain body */
    }
  }
  return {
    subject: d.subject ?? '',
    from: d.senderName && d.senderEmail && d.senderName !== d.senderEmail ? `${d.senderName} <${d.senderEmail}>` : d.senderName || d.senderEmail || '',
    to: who('to'),
    cc: who('cc'),
    date: when(d.messageDeliveryTime ?? d.clientSubmitTime ?? d.creationTime),
    html,
    text: d.body,
    rtf,
    attachments,
    inline,
  };
}

/** Windows code page → encoding name understood by msgreader (iconv-lite). */
const CODEPAGE_NAMES: Record<number, string> = {
  // Internet code pages for Japanese mail (ISO-2022-JP) still store Outlook's own text as Windows 932.
  932: 'shift_jis', 50220: 'shift_jis', 50221: 'shift_jis', 50222: 'shift_jis', 51932: 'euc-jp',
  936: 'gbk', 54936: 'gb18030', 52936: 'gbk', 950: 'big5', 949: 'euc-kr', 51949: 'euc-kr',
  874: 'windows-874', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253',
  1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258',
  20866: 'koi8-r', 21866: 'koi8-u', 28591: 'latin1', 28592: 'iso-8859-2', 28595: 'iso-8859-5',
};

/** Split an mbox into raw messages ("From " lines start each one). */
export function splitMbox(text: string): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  let cur: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('From ') && (i === 0 || lines[i - 1] === '')) {
      if (cur) out.push(cur.join('\n'));
      cur = [];
      continue;
    }
    // ">From " escaping inside bodies.
    cur?.push(/^>+From /.test(line) ? line.slice(1) : line);
  }
  if (cur) out.push(cur.join('\n'));
  return out.filter((m) => m.trim());
}

// ------------------------------------------------------------------ views

const FRAME_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' data:; font-src data:";

function sandboxed(html: string, extraCss = ''): HTMLIFrameElement {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><base target="_blank"><style>body{margin:16px;font:15px/1.6 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1d1d1f;background:#fff}img{max-width:100%;height:auto}${extraCss}</style>`;
  const doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
  // No allow-scripts, no allow-same-origin.
  return h('iframe', { class: 'mail-frame', sandbox: 'allow-popups allow-popups-to-escape-sandbox', srcdoc: doc, title: 'Message' });
}

/** Grow the frame to its content so the page scrolls as one. */
function autoHeight(frame: HTMLIFrameElement) {
  frame.addEventListener('load', () => {
    // Sandboxed without same-origin: we cannot measure; use a generous height.
    frame.style.height = '70vh';
  });
}

function messageEl(m: Message, ctx: OpenContext): HTMLElement {
  const rows: Array<[string, string]> = [[s('from'), m.from], [s('to'), m.to], [s('cc'), m.cc], [s('date'), m.date]];
  let body: HTMLElement;
  if (m.html) {
    // cid: pictures become data: URLs (blob: would be blocked across the sandbox).
    let html = m.html;
    for (const [cid, a] of m.inline) {
      let bin = '';
      for (let i = 0; i < a.data.length; i += 8192) bin += String.fromCharCode(...a.data.subarray(i, i + 8192));
      html = html.split(`cid:${cid}`).join(`data:${a.type};base64,${btoa(bin)}`);
    }
    const frame = sandboxed(html);
    autoHeight(frame);
    body = h('div', { class: 'mail-body' }, frame, h('div', { class: 'mail-note' }, s('remoteBlocked')));
  } else if (m.rtf?.length) {
    body = h('div', { class: 'mail-body mail-rtf' }, renderPaper(m.rtf).el);
  } else {
    body = h('div', { class: 'mail-body' }, h('pre', { class: 'mail-text', dir: 'auto' }, m.text ?? ''));
  }
  const atts = m.attachments.length
    ? h(
        'section',
        { class: 'mail-atts' },
        h('h3', {}, `${s('attachments')} (${m.attachments.length})`, h('span', { class: 'mail-hint' }, ` · ${s('openHint')}`)),
        h(
          'div',
          { class: 'mail-att-list' },
          ...m.attachments.map((a) =>
            h(
              'button',
              { type: 'button', class: 'mail-att', onclick: () => ctx.openFile(new File([a.data as BlobPart], a.name, { type: a.type })) },
              h('span', { class: 'mail-att-name' }, a.name),
              h('span', { class: 'mail-att-size' }, formatBytes(a.data.length)),
            ),
          ),
        ),
      )
    : null;
  return h(
    'article',
    { class: 'mail' },
    h('h2', { class: 'mail-subject', dir: 'auto' }, m.subject || s('noSubject')),
    h('dl', { class: 'mail-head' }, ...rows.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', { dir: 'auto' }, v)])),
    atts,
    body,
  );
}

export const preload = () => import('postal-mime');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);

  // Saved web page
  if (ext === 'mhtml' || ext === 'mht' || ctx.format?.id === 'mhtml') {
    const page = mhtmlToHtml(bytes);
    const frame = sandboxed(page.html);
    ctx.mount.replaceChildren(h('div', { class: 'view view-mail' }, h('div', { class: 'mail-note top' }, s('pageNote')), frame));
    frame.classList.add('page-frame');
    return { title: page.title, meta: () => [s('savedPage'), `${page.resources} ${s('resources')}`] };
  }

  // Mailbox: list on the left, message on the right
  if (ext === 'mbox' || ext === 'mbx' || ctx.format?.id === 'mbox') {
    // One char per byte, so each message's own charset can be decoded later.
    const raws = splitMbox(latin1(bytes)).slice(0, 5000);
    const messages = await Promise.all(raws.map((r) => parseEml(Uint8Array.from(r, (c) => c.charCodeAt(0) & 0xff))));
    const list = h('nav', { class: 'mbox-list' });
    const pane = h('div', { class: 'mbox-pane' });
    let active = 0;
    const draw = () => {
      list.replaceChildren(
        ...messages.map((m, i) =>
          h(
            'button',
            { type: 'button', class: `mbox-item${i === active ? ' active' : ''}`, onclick: () => { active = i; draw(); } },
            h('span', { class: 'mbox-subject', dir: 'auto' }, m.subject || s('noSubject')),
            h('span', { class: 'mbox-from', dir: 'auto' }, m.from),
            h('span', { class: 'mbox-date' }, m.date),
          ),
        ),
      );
      pane.replaceChildren(messages[active] ? messageEl(messages[active], ctx) : h('div'));
    };
    draw();
    ctx.mount.replaceChildren(h('div', { class: 'view view-mail mbox' }, list, pane));
    return { meta: () => ['Mailbox (MBOX)', `${messages.length} ${s('messages')}`], onLangChange: draw };
  }

  const message = ctx.format?.id === 'msg' || ext === 'msg' ? await parseMsg(data) : await parseEml(bytes);
  const draw = () => ctx.mount.replaceChildren(h('div', { class: 'view view-mail' }, messageEl(message, ctx)));
  draw();
  return {
    title: message.subject || undefined,
    meta: () => [ext === 'msg' ? 'Outlook message' : 'Email (EML)', ...(message.attachments.length ? [`${message.attachments.length} ${s('attachments').toLowerCase()}`] : [])],
    onLangChange: draw,
  };
}
