/** Cheap checks on a file's first bytes (kept apart so the viewer list stays small). */

export function isGeoJson(text: string): boolean {
  return /"type"\s*:\s*"(FeatureCollection|Feature|Point|LineString|Polygon|MultiPoint|MultiLineString|MultiPolygon|GeometryCollection)"/.test(text.slice(0, 4096)) && /"coordinates"|"features"/.test(text.slice(0, 65536));
}

export function isShp(head: Uint8Array): boolean {
  return head.length >= 100 && head[0] === 0 && head[1] === 0 && head[2] === 0x27 && head[3] === 0x0a;
}
