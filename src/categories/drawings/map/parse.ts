/**
 * Map data → features (points, lines, areas) with their attributes:
 * KML / KMZ (Google Earth), GPX (GPS tracks and waypoints), GeoJSON, and Shapefiles
 * (.shp geometry + .dbf attributes + .prj coordinate system + .cpg code page).
 */

export type Kind = 'point' | 'line' | 'area';

export interface Feature {
  kind: Kind;
  /** Each part is a flat list x0 y0 x1 y1 … (longitude/latitude, or the file's own units). */
  parts: number[][];
  name?: string;
  /** Folder / layer / track the feature belongs to (for colours). */
  group?: string;
  props: Record<string, string>;
}

export interface MapData {
  format: 'KML' | 'GPX' | 'GeoJSON' | 'Shapefile';
  features: Feature[];
  /** True when coordinates are longitude/latitude (WGS 84). */
  lonLat: boolean;
  /** Coordinate system name for projected data (from .prj / GeoJSON crs). */
  crs?: string;
  title?: string;
}

const xml = (text: string) => {
  const parse = (t: string) => new DOMParser().parseFromString(t.replace(/^\uFEFF/, ''), 'application/xml');
  let doc = parse(text);
  // Some parsers stumble on CDATA (KML descriptions often use it): retry with it as plain text.
  if (doc.getElementsByTagName('parsererror').length)
    doc = parse(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The file is not valid XML.');
  return doc;
};
const kids = (el: Element | Document, name: string) => Array.from(el.getElementsByTagName('*')).filter((e) => e.localName === name);
const child = (el: Element, name: string) => Array.from(el.children).find((e) => e.localName === name);
const textOf = (el: Element | undefined) => el?.textContent?.trim() ?? '';
const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

/** "lon,lat[,alt] lon,lat …" → flat list. */
function kmlCoords(s: string): number[] {
  const out: number[] = [];
  for (const t of s.trim().split(/\s+/)) {
    const [x, y] = t.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push(x, y);
  }
  return out;
}

export { isGeoJson, isShp } from './sniff';

// ------------------------------------------------------------------ KML

export function parseKml(text: string): MapData {
  const doc = xml(text);
  const features: Feature[] = [];
  for (const pm of kids(doc, 'Placemark')) {
    const props: Record<string, string> = {};
    const desc = stripHtml(textOf(child(pm, 'description')));
    if (desc) props.description = desc;
    for (const d of kids(pm, 'Data')) props[d.getAttribute('name') ?? ''] = textOf(child(d, 'value'));
    for (const d of kids(pm, 'SimpleData')) props[d.getAttribute('name') ?? ''] = textOf(d);
    const name = textOf(child(pm, 'name')) || undefined;
    // The folder (or document) it sits in names its group.
    let group: string | undefined;
    for (let p = pm.parentElement; p; p = p.parentElement)
      if (p.localName === 'Folder') {
        group = textOf(child(p, 'name')) || undefined;
        break;
      }
    const add = (kind: Kind, parts: number[][]) => {
      const ok = parts.filter((q) => q.length >= 2);
      if (ok.length) features.push({ kind, parts: ok, name, group, props });
    };
    for (const g of kids(pm, 'Point')) add('point', [kmlCoords(textOf(child(g, 'coordinates')))]);
    for (const g of kids(pm, 'LineString')) add('line', [kmlCoords(textOf(child(g, 'coordinates')))]);
    for (const g of kids(pm, 'Polygon')) add('area', kids(g, 'LinearRing').map((r) => kmlCoords(textOf(child(r, 'coordinates')))));
    // Google Earth GPS tracks: <gx:Track><gx:coord>lon lat alt</gx:coord>…
    for (const g of kids(pm, 'Track')) {
      const pts: number[] = [];
      for (const c of kids(g, 'coord')) {
        const [x, y] = textOf(c).split(/\s+/).map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push(x, y);
      }
      add('line', [pts]);
    }
  }
  const title = textOf(kids(doc, 'Document')[0] ? child(kids(doc, 'Document')[0], 'name') : undefined) || undefined;
  return { format: 'KML', features, lonLat: true, title };
}

/** KMZ: the zipped KML (doc.kml, or the first .kml inside). */
export async function parseKmz(bytes: Uint8Array): Promise<MapData> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes, { filter: (f) => /\.kml$/i.test(f.name) });
  const name = Object.keys(files).sort((a, b) => Number(!/(^|\/)doc\.kml$/i.test(a)) - Number(!/(^|\/)doc\.kml$/i.test(b)))[0];
  if (!name) throw new Error('This KMZ has no KML inside.');
  return parseKml(strFromU8(files[name]));
}

// ------------------------------------------------------------------ GPX

export function parseGpx(text: string): MapData {
  const doc = xml(text);
  const features: Feature[] = [];
  const ll = (p: Element) => [Number(p.getAttribute('lon')), Number(p.getAttribute('lat'))];
  const info = (el: Element) => {
    const props: Record<string, string> = {};
    for (const k of ['desc', 'cmt', 'ele', 'time', 'type', 'sym']) {
      const v = textOf(child(el, k));
      if (v) props[k] = v;
    }
    return props;
  };
  for (const w of kids(doc, 'wpt')) {
    const props = info(w);
    const [x, y] = ll(w);
    props.lat = String(y);
    props.lon = String(x);
    features.push({ kind: 'point', parts: [[x, y]], name: textOf(child(w, 'name')) || undefined, group: 'Waypoints', props });
  }
  for (const t of kids(doc, 'trk')) {
    const parts = kids(t, 'trkseg').map((seg) => kids(seg, 'trkpt').flatMap(ll));
    const pts = kids(t, 'trkpt');
    const props = info(t);
    props.points = String(pts.length);
    const times = pts.map((p) => textOf(child(p, 'time'))).filter(Boolean);
    if (times.length) (props.start = times[0]), (props.end = times[times.length - 1]);
    features.push({ kind: 'line', parts: parts.filter((p) => p.length >= 4), name: textOf(child(t, 'name')) || 'Track', group: 'Tracks', props });
  }
  for (const r of kids(doc, 'rte')) features.push({ kind: 'line', parts: [kids(r, 'rtept').flatMap(ll)], name: textOf(child(r, 'name')) || 'Route', group: 'Routes', props: info(r) });
  return { format: 'GPX', features: features.filter((f) => f.parts.length), lonLat: true, title: textOf(kids(doc, 'metadata')[0] ? child(kids(doc, 'metadata')[0], 'name') : undefined) || undefined };
}

// ------------------------------------------------------------------ GeoJSON

type Json = Record<string, unknown>;

export function parseGeoJson(text: string): MapData {
  const root = JSON.parse(text) as Json;
  const features: Feature[] = [];
  const flat = (c: number[][]) => c.flatMap((p) => [p[0], p[1]]);
  const geom = (g: Json | null | undefined, props: Record<string, string>, name?: string) => {
    if (!g) return;
    const c = g.coordinates as never;
    const push = (kind: Kind, parts: number[][]) => features.push({ kind, parts, name, props });
    switch (g.type) {
      case 'Point': push('point', [[(c as number[])[0], (c as number[])[1]]]); break;
      case 'MultiPoint': for (const p of c as number[][]) push('point', [[p[0], p[1]]]); break;
      case 'LineString': push('line', [flat(c)]); break;
      case 'MultiLineString': push('line', (c as number[][][]).map(flat)); break;
      case 'Polygon': push('area', (c as number[][][]).map(flat)); break;
      case 'MultiPolygon': for (const poly of c as number[][][][]) push('area', poly.map(flat)); break;
      case 'GeometryCollection': for (const sub of (g.geometries as Json[]) ?? []) geom(sub, props, name);
    }
  };
  const feature = (f: Json) => {
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries((f.properties as Json) ?? {})) props[k] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    const name = props.name ?? props.Name ?? props.NAME ?? props.title ?? props.id;
    geom(f.geometry as Json, props, name);
  };
  if (root.type === 'FeatureCollection') for (const f of (root.features as Json[]) ?? []) feature(f);
  else if (root.type === 'Feature') feature(root);
  else geom(root, {});
  const crs = ((root.crs as Json)?.properties as Json)?.name as string | undefined;
  return { format: 'GeoJSON', features, lonLat: looksLonLat(features) && !(crs && !/4326|CRS84/i.test(crs)), crs, title: root.name as string | undefined };
}

// ------------------------------------------------------------------ Shapefile

export interface ShapeParts {
  shp: ArrayBuffer;
  dbf?: ArrayBuffer;
  prj?: string;
  cpg?: string;
}

export function parseShapefile(p: ShapeParts): MapData {
  const v = new DataView(p.shp);
  if (v.getInt32(0) !== 9994) throw new Error('This is not a Shapefile (.shp).');
  const shapes: Array<{ kind: Kind; parts: number[][] } | null> = [];
  const end = Math.min(p.shp.byteLength, v.getInt32(24) * 2);
  for (let at = 100; at + 12 <= end; ) {
    const len = v.getInt32(at + 4) * 2;
    const o = at + 8;
    at = o + len;
    if (o + 4 > p.shp.byteLength) break;
    const type = v.getInt32(o, true);
    const base = type % 10; // 1/11/21 point, 3/13/23 line, 5/15/25 polygon, 8/18/28 multipoint
    if (base === 1) shapes.push({ kind: 'point', parts: [[v.getFloat64(o + 4, true), v.getFloat64(o + 12, true)]] });
    else if (base === 3 || base === 5) {
      const nParts = v.getInt32(o + 36, true);
      const nPts = v.getInt32(o + 40, true);
      const ptsAt = o + 44 + nParts * 4;
      const starts = Array.from({ length: nParts }, (_, i) => v.getInt32(o + 44 + i * 4, true));
      const parts = starts.map((s, i) => {
        const e = i + 1 < nParts ? starts[i + 1] : nPts;
        const out: number[] = [];
        for (let k = s; k < e; k++) out.push(v.getFloat64(ptsAt + k * 16, true), v.getFloat64(ptsAt + k * 16 + 8, true));
        return out;
      });
      shapes.push({ kind: base === 3 ? 'line' : 'area', parts });
    } else if (base === 8) {
      const n = v.getInt32(o + 36, true);
      const out: number[] = [];
      for (let k = 0; k < n; k++) out.push(v.getFloat64(o + 40 + k * 16, true), v.getFloat64(o + 48 + k * 16, true));
      shapes.push({ kind: 'point', parts: [out] });
    } else shapes.push(null); // null shape
  }
  const rows = p.dbf ? readDbf(p.dbf, p.cpg) : [];
  const features: Feature[] = [];
  shapes.forEach((sh, i) => {
    if (!sh) return;
    const props = rows[i] ?? {};
    const name = props.NAME ?? props.Name ?? props.name ?? props.ID ?? props.Id ?? props.id;
    // A multipoint's points are separate dots.
    if (sh.kind === 'point' && sh.parts[0].length > 2) for (let k = 0; k < sh.parts[0].length; k += 2) features.push({ kind: 'point', parts: [[sh.parts[0][k], sh.parts[0][k + 1]]], name, props });
    else features.push({ ...sh, name, props });
  });
  const projected = !!p.prj && /PROJCS|PROJCRS/i.test(p.prj);
  const crs = p.prj ? /^(?:PROJCS|GEOGCS|PROJCRS|GEOGCRS)\["([^"]+)"/i.exec(p.prj.trim())?.[1] : undefined;
  return { format: 'Shapefile', features, lonLat: !projected && looksLonLat(features), crs };
}

/** dBASE attributes; text in the .cpg code page (or the file's language byte), else UTF-8 / GBK. */
export function readDbf(buf: ArrayBuffer, cpg?: string): Array<Record<string, string>> {
  const b = new Uint8Array(buf);
  const v = new DataView(buf);
  const n = v.getUint32(4, true);
  const headLen = v.getUint16(8, true);
  const recLen = v.getUint16(10, true);
  const fields: Array<{ name: string; len: number }> = [];
  for (let at = 32; at + 32 <= headLen && b[at] !== 0x0d; at += 32) {
    const name = String.fromCharCode(...b.subarray(at, at + 11)).replace(/\0.*$/, '').trim();
    fields.push({ name, len: b[at + 16] });
  }
  const LDID: Record<number, string> = { 0x4d: 'gbk', 0x7a: 'gbk', 0x4e: 'euc-kr', 0x4f: 'big5', 0x13: 'shift_jis', 0x7b: 'shift_jis', 0x57: 'windows-1252', 0x03: 'windows-1252', 0x65: 'ibm866', 0xc9: 'windows-1251', 0xc8: 'windows-1250' };
  const label = cpgLabel(cpg) ?? LDID[b[29]];
  let decoder: TextDecoder;
  if (label) decoder = new TextDecoder(label);
  else {
    // No hint: UTF-8 if every record decodes cleanly, else GBK (the common Chinese GIS default).
    const sample = b.subarray(headLen, Math.min(b.length, headLen + recLen * 2000));
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample);
      decoder = new TextDecoder('utf-8');
    } catch {
      decoder = new TextDecoder('gbk');
    }
  }
  const rows: Array<Record<string, string>> = [];
  for (let r = 0; r < n; r++) {
    const at = headLen + r * recLen;
    if (at + recLen > b.length) break;
    const row: Record<string, string> = {};
    let o = at + 1; // deletion flag
    for (const f of fields) {
      row[f.name] = decoder.decode(b.subarray(o, o + f.len)).replace(/\0/g, '').trim();
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

function cpgLabel(cpg?: string): string | undefined {
  const c = cpg?.trim().toLowerCase();
  if (!c) return undefined;
  if (/^(utf-?8|65001)$/.test(c)) return 'utf-8';
  if (/^(936|gbk|gb2312|cp936|gb18030)$/.test(c)) return 'gb18030';
  if (/^(950|big5)$/.test(c)) return 'big5';
  if (/^(932|sjis|shift_jis)$/.test(c)) return 'shift_jis';
  if (/^\d{4}$/.test(c)) return `windows-${c}`;
  if (/^(88591|iso-?8859-?1|latin1)$/.test(c)) return 'windows-1252';
  try {
    new TextDecoder(c);
    return c;
  } catch {
    return undefined;
  }
}

function looksLonLat(features: Feature[]): boolean {
  let any = false;
  for (const f of features)
    for (const p of f.parts)
      for (let i = 0; i < p.length; i += 2) {
        if (Math.abs(p[i]) > 180.0001 || Math.abs(p[i + 1]) > 90.0001) return false;
        any = true;
      }
  return any;
}
