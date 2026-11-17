/** Fixed-layout pages (XPS, OFD) as positioned text, paths and images. */

export interface FixedText {
  kind: 'text';
  x: number;
  y: number; // baseline
  size: number;
  text: string;
  fill?: string;
  /** Per-character x positions when the format gives them. */
  xs?: number[];
  bold?: boolean;
  transform?: string;
}
export interface FixedPath {
  kind: 'path';
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  transform?: string;
}
export interface FixedImage {
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  href: string; // data: URL
  transform?: string;
}
export type FixedItem = FixedText | FixedPath | FixedImage;

export interface FixedPage {
  width: number;
  height: number;
  items: FixedItem[];
}

export interface FixedDocument {
  kind: 'XPS' | 'OFD';
  pages: FixedPage[];
  title?: string;
}

/** Elements by local name, ignoring namespace prefixes (ofd:, xps…). */
export function els(root: ParentNode, name: string): Element[] {
  return Array.from(root.querySelectorAll('*')).filter((e) => e.localName === name);
}

export function children(root: Element, name: string): Element[] {
  return Array.from(root.children).filter((e) => e.localName === name);
}

export function toDataUrl(bytes: Uint8Array, path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : ext === 'tif' || ext === 'tiff' ? 'image/tiff' : 'image/jpeg';
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(bin)}`;
}
