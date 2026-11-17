/**
 * A simple document model shared by the document viewers that convert a
 * format themselves (RTF, OpenDocument text, HWPX…), drawn by paper.ts.
 */

export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  strike?: boolean;
  sizePt?: number;
  color?: string;
  sup?: boolean;
  sub?: boolean;
}
export interface Para {
  type: 'para';
  align?: 'left' | 'center' | 'right' | 'justify';
  runs: Run[];
  pageBreakBefore?: boolean;
  /** 1–6 for headings. */
  heading?: number;
  /** Bullet or number shown before a list item, e.g. '•' or '3.'. */
  listItem?: string;
}
export interface Picture {
  type: 'picture';
  mime: string;
  data: Uint8Array;
  widthPt?: number;
}
export interface Table {
  type: 'table';
  rows: Para[][][]; // rows → cells → paragraphs
}
export type Block = Para | Picture | Table;
