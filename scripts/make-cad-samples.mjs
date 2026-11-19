// Writes samples/drawings/ stand-ins for closed CAD formats, each holding a preview picture
// the way the real programs store it (the geometry part is just filler bytes):
//   tower.rvt   — OLE compound file, "RevitPreview4.0" stream with a header + PNG (Revit)
//   tower.skp   — "SketchUp Model" header (UTF-16) then a PNG (SketchUp)
//   tower.3dm   — Rhino header, then a raw 24-bit Windows bitmap (DIB) preview
//   tower.sldprt — filler then a JPEG preview (SolidWorks 2015+ stores JPEG/PNG previews)
// The preview is a simple drawing of a wind turbine, generated here.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import CFB from 'cfb';

const out = new URL('../samples/drawings/', import.meta.url);
const W = 160;
const H = 120;

// ---- the picture: sky gradient, ground, tower and three blades
const px = new Uint8Array(W * H * 3);
const set = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  px[o] = r; px[o + 1] = g; px[o + 2] = b;
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) y < 90 ? set(x, y, 120 + y, 170 + y / 2, 230) : set(x, y, 90, 140, 70);
for (let y = 40; y < 92; y++) for (let x = 78 - (y - 40) / 26; x <= 82 + (y - 40) / 26; x++) set(Math.round(x), y, 240, 240, 245);
for (const a of [-90, 30, 150]) {
  const r = (a * Math.PI) / 180;
  for (let t = 0; t < 34; t += 0.5) for (let w = -1; w <= 1; w++) set(Math.round(80 + t * Math.cos(r) - w * Math.sin(r)), Math.round(38 + t * Math.sin(r) + w * Math.cos(r)), 245, 245, 250);
}

function png() {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(px.subarray(y * W * 3, (y + 1) * W * 3)).copy(raw, y * (W * 3 + 1) + 1);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function dib() {
  const stride = Math.ceil((W * 24) / 32) * 4;
  const b = Buffer.alloc(40 + stride * H);
  b.writeUInt32LE(40, 0); b.writeInt32LE(W, 4); b.writeInt32LE(H, 8); b.writeUInt16LE(1, 12); b.writeUInt16LE(24, 14);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((H - 1 - y) * W + x) * 3; // bottom-up rows
    const o = 40 + y * stride + x * 3;
    b[o] = px[s + 2]; b[o + 1] = px[s + 1]; b[o + 2] = px[s];
  }
  return b;
}
const filler = (n) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0x7f));
const pngBytes = png();

// Revit: OLE file; the preview stream starts with a small header before the PNG.
const doc = CFB.utils.cfb_new();
CFB.utils.cfb_add(doc, 'BasicFileInfo', Buffer.from('Revit Architecture 2024\0', 'utf16le'));
CFB.utils.cfb_add(doc, 'RevitPreview4.0', Buffer.concat([filler(300), pngBytes]));
CFB.utils.cfb_add(doc, 'Global/Latest', filler(4096));
writeFileSync(new URL('tower.rvt', out), CFB.write(doc, { type: 'buffer' }));

writeFileSync(new URL('tower.skp', out), Buffer.concat([Buffer.from([0xff, 0xfe, 0xff, 0x0e]), Buffer.from('SketchUp Model', 'utf16le'), filler(200), pngBytes, filler(2000)]));
writeFileSync(new URL('tower.3dm', out), Buffer.concat([Buffer.from('3D Geometry File Format        7'), filler(120), dib(), filler(1500)]));

// SolidWorks: a JPEG preview (made from the PNG with ffmpeg) inside filler.
const tmpPng = new URL('tower-preview.tmp.png', out);
const tmpJpg = new URL('tower-preview.tmp.jpg', out);
writeFileSync(tmpPng, pngBytes);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmpPng.pathname, '-q:v', '4', tmpJpg.pathname]);
const { readFileSync, rmSync } = await import('node:fs');
writeFileSync(new URL('tower.sldprt', out), Buffer.concat([filler(800), readFileSync(tmpJpg), filler(3000)]));
rmSync(tmpPng);
rmSync(tmpJpg);
console.log('wrote CAD stand-in samples');
