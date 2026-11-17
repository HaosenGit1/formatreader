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
}

export interface OpenedView {
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
  /** 'fill': the viewer takes the whole window height (books). Default: the page scrolls. */
  layout?: 'fill';
  /** Fetch this viewer's code in the background while the front page is idle (common formats). */
  prefetch?: boolean;
  accepts(ctx: AcceptContext): boolean;
  /** Loads the implementation on demand (dynamic import → separate chunk). */
  load(): Promise<ViewerModule>;
}
