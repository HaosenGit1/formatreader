/**
 * Words: everything you read — text, code, tables, documents, books, slides.
 * Each viewer below is its own module, loaded only when a file needs it.
 */
import type { ViewerEntry } from '../../core/viewer';
import { codeKind } from './code/languages';
import { DELIMITED_EXT, SHEET_FORMAT_IDS, SHEET_TEXT_EXT, isSpreadsheetXml } from './sheets/formats';

const BOOK_FORMATS = new Set(['epub', 'mobi', 'azw3', 'fb2', 'fbz', 'cbz']);

/** True when the bytes didn't match a binary format, so the file is (probably) text. */
const isTextish = (format: { text?: boolean } | null) => !format || !!format.text;

const headText = (head: Uint8Array) => new TextDecoder('utf-8').decode(head.subarray(0, 4000));

export const wordsViewers: ViewerEntry[] = [
  {
    id: 'words/books',
    category: 'words',
    mimes: /^application\/(epub\+zip|x-mobipocket-ebook|vnd\.amazon\.ebook|x-fictionbook\+xml|vnd\.comicbook\+zip|x-cbz)$/,
    layout: 'fill',
    accepts: ({ format, ext }) => (format ? BOOK_FORMATS.has(format.id) : ext === 'fb2'),
    load: () => import('./books/view'),
  },
  {
    id: 'words/slides',
    category: 'words',
    mimes: /presentationml|ms-powerpoint|opendocument\.presentation/,
    accepts: ({ format }) => format?.id === 'pptx',
    load: () => import('./slides/view'),
  },
  {
    id: 'words/docs',
    category: 'words',
    mimes: /wordprocessingml|^application\/msword$/,
    accepts: ({ format }) => format?.id === 'docx',
    load: () => import('./docs/view'),
  },
  {
    id: 'words/db',
    // Measured: an 800 MB SQLite (9 million rows) opened in 1 s; Access files are read whole.
    heavyAbove: () => 1024 * 1024 * 1024,
    category: 'words',
    mimes: /x-msaccess|vnd\.ms-access|x-sqlite3|vnd\.sqlite3/,
    accepts: ({ format }) => ['mdb', 'accdb', 'sqlite'].includes(format?.id ?? ''),
    load: () => import('./db/view'),
  },
  {
    id: 'words/locked',
    category: 'words',
    layout: 'fill',
    prefetch: false,
    accepts: ({ format }) => format?.id === 'locked',
    load: () => import('./locked/view'),
  },
  {
    id: 'words/rtf',
    category: 'words',
    mimes: /rtf/,
    accepts: ({ format }) => format?.id === 'rtf',
    load: () => import('./rtf/view'),
  },
  {
    id: 'words/odf',
    category: 'words',
    mimes: /opendocument\.(text|presentation)/,
    accepts: ({ format }) => ['odt', 'odp'].includes(format?.id ?? ''),
    load: () => import('./odf/view'),
  },
  {
    id: 'words/email',
    category: 'words',
    mimes: /^message\/rfc822$|vnd\.ms-outlook|^application\/mbox$|multipart\/related|x-mimearchive/,
    accepts: ({ format, ext }) => format?.id === 'msg' || (isTextish(format) && ['eml', 'mbox', 'mbx', 'mht', 'mhtml'].includes(ext)),
    load: () => import('./email/view'),
  },
  {
    id: 'words/fixed',
    category: 'words',
    mimes: /ms-xpsdocument|oxps|^application\/ofd$/,
    accepts: ({ format }) => ['xps', 'oxps', 'ofd'].includes(format?.id ?? ''),
    load: () => import('./fixed/view'),
  },
  {
    id: 'words/iwork',
    category: 'words',
    mimes: /x-iwork|vnd\.apple\.(pages|keynote|numbers)/,
    // Numbers files go to the Sheets viewer (SheetJS reads them).
    accepts: ({ format }) => ['pages', 'key', 'iwork'].includes(format?.id ?? ''),
    load: () => import('./iwork/view'),
  },
  {
    id: 'words/hwpx',
    category: 'words',
    mimes: /hwp\+zip|haansofthwpx/,
    accepts: ({ format }) => format?.id === 'hwpx',
    load: () => import('./hwpx/view'),
  },
  {
    id: 'words/hwp',
    category: 'words',
    mimes: /x-hwp|haansofthwp/,
    accepts: ({ format }) => format?.id === 'hwp',
    load: () => import('./hwp/view'),
  },
  {
    id: 'words/palmdoc',
    category: 'words',
    accepts: ({ format }) => format?.id === 'pdb',
    load: () => import('./text/palm-view'),
  },
  {
    id: 'words/legacy',
    category: 'words',
    mimes: /^application\/(msword|vnd\.ms-powerpoint|vnd\.ms-works)$/,
    accepts: ({ format }) => ['doc', 'ppt', 'wps', 'dps', 'dot', 'pps', 'pot'].includes(format?.id ?? ''),
    load: () => import('./legacy/view'),
  },
  {
    id: 'words/pdf',
    category: 'words',
    mimes: /^application\/pdf$/,
    accepts: ({ format }) => format?.id === 'pdf',
    load: () => import('./pdf/view'),
  },
  {
    id: 'words/sheets',
    // Excel: 1 million rows (109 MB) opened in 17 s. CSV is shown in parts instead (see read.ts).
    heavyAbove: (format) => (format && !format.text ? 150 * 1024 * 1024 : undefined),
    category: 'words',
    mimes: /^text\/(csv|tab-separated-values)$|spreadsheetml|ms-excel|opendocument\.spreadsheet|x-iwork-numbers|^application\/(x-)?dbf$/,
    prefetch: true,
    accepts: ({ format, ext, head }) =>
      (format != null && SHEET_FORMAT_IDS.has(format.id)) ||
      (isTextish(format) && (DELIMITED_EXT.has(ext) || SHEET_TEXT_EXT.has(ext) || (ext === 'xml' && isSpreadsheetXml(head)))),
    load: () => import('./sheets/view'),
  },
  {
    id: 'words/code',
    category: 'words',
    mimes: /^(text\/(x-|javascript|css|xml)|application\/(json|javascript|xml|x-sh|x-yaml|yaml|toml|x-httpd-php|sql|x-ipynb\+json))/,
    prefetch: true,
    priority: 20,
    accepts: ({ format, name, head }) => isTextish(format) && codeKind(name, headText(head)) !== null,
    load: () => import('./code/view'),
  },
  {
    id: 'words/text',
    category: 'words',
    mimes: /^text\/(plain|markdown|html|vtt)|^application\/x-subrip$/,
    prefetch: true,
    priority: 10,
    // Catch-all for anything that isn't a known binary format; binary files
    // are recognised on read and shown as an "unknown file" card.
    accepts: ({ format }) => isTextish(format),
    load: () => import('./text/view'),
  },
];
