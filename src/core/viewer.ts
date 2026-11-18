/**
 * The contract between the app shell (core) and every viewer module.
 *
 * Each category (words, images, drawings, sounds, videos, archives) exports a
 * list of ViewerEntry. The shell asks each entry, in order, whether it accepts
 * a file; the first that does is loaded (as its own code chunk) and asked to
 * open the file. Viewers never touch the shell's DOM, and the shell never
 * reaches into a viewer: a bug in one viewer cannot break another.
 */
import type { Category, FormatInfo } from './detect-format';

export interface AcceptContext {
  /** Format identified from the file's bytes, or null (usually: text). */
  format: FormatInfo | null;
  /** File name and lower-case extension without the dot ('' if none). */
  name: string;
  ext: string;
  /** First bytes of the file, for content sniffing. */
  head: Uint8Array;
}

export interface OpenContext {
  /** Element already in the page; the viewer renders into it and must not move it. */
  mount: HTMLElement;
  /** What the file was identified as (null for plain text). */
  format: FormatInfo | null;
  /** Current reading-size multiplier (A− / A+). */
  fontScale(): number;
  /** Ask the shell to redraw the toolbar and notices (e.g. after the viewer's state changed). */
  refreshChrome(): void;
  /**
   * Open another file in FormatReader (e.g. an email attachment or a file
   * inside an archive). The toolbar then shows the way back ("Opened from").
   * `replace`: show this file *instead of* the current one, with no step
   * back to it (for viewers that only unwrap, like .gz or CBR → CBZ).
   */
  openFile(file: File, options?: { replace?: boolean }): void;
}

/** Facts a viewer knows about the file, for the "About this file" panel. */
export interface AboutFacts {
  /** Text: the character encoding the file is really in (WHATWG label, e.g. 'gb18030'). */
  encoding?: string;
  /** Text: starts with a byte-order mark. */
  bom?: boolean;
  lineEnding?: 'CRLF' | 'LF' | 'CR' | 'mixed';
  /** Text that was mis-decoded and saved: the encodings undone, e.g. ['gb18030'] or ['windows-1252→windows-1251']. */
  repaired?: string[];
  /** Text written as escapes (URL %…, \\u…, Base64…). */
  escapes?: string[];
  /** Characters already destroyed in the file. */
  damage?: 'question' | 'lost' | 'memory';
  /** Video/sound codec. */
  codec?: string;
}

export interface OpenedView {
  /** Facts for the "About this file" panel (encoding, codec…). */
  about?(): AboutFacts;
  /** Shown in the toolbar instead of the file name (e.g. a book's title). */
  title?: string;
  /** Short facts for the toolbar's second line, e.g. ['Excel', '3 sheets']. */
  meta?(): string[];
  /** Extra toolbar controls; rebuilt on every refresh so labels follow the language. */
  tools?(): HTMLElement[];
  /** Messages shown under the toolbar (encoding notes, repairs, warnings). */
  notices?(): HTMLElement[];
  /** Show the A− / A+ buttons; called when the size changes. */
  onFontScale?(scale: number): void;
  /** Custom full-screen behaviour (e.g. slideshow). Default: the page goes full screen. */
  fullscreen?(): void;
  /** Label for the full-screen button when custom (e.g. 'Present'). */
  fullscreenLabel?(): string;
  /** Called after the interface language changes. */
  onLangChange?(): void;
  /** Release resources (object URLs, observers, listeners). */
  destroy?(): void;
}

export interface ViewerModule {
  open(file: File, ctx: OpenContext): Promise<OpenedView>;
  /** Optional: open pasted text instead of a file. */
  openText?(text: string, ctx: OpenContext): Promise<OpenedView>;
  /**
   * Optional: start downloading heavy libraries (spreadsheet engine, ebook
   * engine…) before open() is called — e.g. while a file is being dragged.
   */
  preload?(): Promise<unknown>;
}

export interface ViewerEntry {
  /** Unique id, e.g. 'words/sheets'. */
  id: string;
  category: Category;
  /**
   * Higher runs first. Specific viewers use the default (50); catch-alls go
   * last: Code 20, Text 10, the shell's "unknown file" card 0.
   */
  priority?: number;
  /**
   * A new or replacement version under test. Ignored unless the page is
   * opened with ?try=<id> (comma-separated for several); then it takes
   * precedence over the stable viewer for the same files. Visitors never see it.
   */
  experimental?: boolean;
  /** 'fill': the viewer takes the whole window height (books). Default: the page scrolls. */
  layout?: 'fill';
  /** Fetch this viewer's code in the background while the front page is idle (common formats). */
  prefetch?: boolean;
  /**
   * MIME types this viewer probably handles. While a file is dragged over the
   * page the browser reveals only its MIME type, so matching viewers start
   * loading before the drop.
   */
  mimes?: RegExp;
  accepts(ctx: AcceptContext): boolean;
  /** Loads the implementation on demand (dynamic import → separate chunk). */
  load(): Promise<ViewerModule>;
}
