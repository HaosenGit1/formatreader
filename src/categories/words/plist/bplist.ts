/**
 * Apple binary property lists ("bplist00": app settings, iOS backups, .webloc, Info.plist in
 * built apps) turned into the standard XML plist text, which the code viewer shows.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const EPOCH_2001 = Date.UTC(2001, 0, 1);

export const isBplist = (b: Uint8Array) => b.length >= 40 && String.fromCharCode(...b.subarray(0, 6)) === 'bplist';

export function bplistToXml(b: Uint8Array): string {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const t = b.length - 32;
  const offSize = b[t + 6];
  const refSize = b[t + 7];
  const count = Number(v.getBigUint64(t + 8));
  const top = Number(v.getBigUint64(t + 16));
  const table = Number(v.getBigUint64(t + 24));
  if (!offSize || !refSize || count > 50_000_000 || table + count * offSize > t) throw new Error('This binary property list is damaged.');

  const uint = (o: number, n: number) => {
    let x = 0;
    for (let i = 0; i < n; i++) x = x * 256 + b[o + i];
    return x;
  };
  const offsetOf = (ref: number) => uint(table + ref * offSize, offSize);
  const lenAt = (o: number): [number, number] => {
    const low = b[o] & 0x0f;
    if (low !== 0x0f) return [low, o + 1];
    const n = 1 << (b[o + 1] & 0x0f);
    return [uint(o + 2, n), o + 2 + n];
  };
  const out: string[] = [];
  const stack = new Set<number>();
  const pad = (d: number) => '\t'.repeat(d);

  const obj = (ref: number, d: number): void => {
    if (ref >= count || stack.has(ref) || d > 200) {
      out.push(`${pad(d)}<string>(loop)</string>`);
      return;
    }
    const o = offsetOf(ref);
    const m = b[o];
    const hi = m >> 4;
    switch (hi) {
      case 0x0:
        out.push(pad(d) + (m === 0x08 ? '<false/>' : m === 0x09 ? '<true/>' : '<string></string>'));
        return;
      case 0x1: {
        const n = 1 << (m & 0x0f);
        const x = n === 8 ? v.getBigInt64(o + 1) : n === 16 ? v.getBigInt64(o + 9) : BigInt(uint(o + 1, n));
        out.push(`${pad(d)}<integer>${x}</integer>`);
        return;
      }
      case 0x2:
        out.push(`${pad(d)}<real>${(m & 0x0f) === 2 ? v.getFloat32(o + 1) : v.getFloat64(o + 1)}</real>`);
        return;
      case 0x3:
        out.push(`${pad(d)}<date>${new Date(EPOCH_2001 + v.getFloat64(o + 1) * 1000).toISOString().replace(/\.\d+Z$/, 'Z')}</date>`);
        return;
      case 0x4: {
        const [n, p] = lenAt(o);
        let bin = '';
        for (const c of b.subarray(p, p + n)) bin += String.fromCharCode(c);
        const b64 = btoa(bin).replace(/(.{68})/g, `$1\n${pad(d)}`);
        out.push(`${pad(d)}<data>\n${pad(d)}${b64}\n${pad(d)}</data>`);
        return;
      }
      case 0x5: {
        const [n, p] = lenAt(o);
        out.push(`${pad(d)}<string>${esc(new TextDecoder('latin1').decode(b.subarray(p, p + n)))}</string>`);
        return;
      }
      case 0x6: {
        const [n, p] = lenAt(o);
        out.push(`${pad(d)}<string>${esc(new TextDecoder('utf-16be').decode(b.subarray(p, p + n * 2)))}</string>`);
        return;
      }
      case 0x8: // UID (NSKeyedArchiver)
        out.push(`${pad(d)}<dict>\n${pad(d + 1)}<key>CF$UID</key>\n${pad(d + 1)}<integer>${uint(o + 1, (m & 0x0f) + 1)}</integer>\n${pad(d)}</dict>`);
        return;
      case 0xa:
      case 0xc: {
        const [n, p] = lenAt(o);
        if (!n) return void out.push(`${pad(d)}<array/>`);
        stack.add(ref);
        out.push(`${pad(d)}<array>`);
        for (let i = 0; i < n; i++) obj(uint(p + i * refSize, refSize), d + 1);
        out.push(`${pad(d)}</array>`);
        stack.delete(ref);
        return;
      }
      case 0xd: {
        const [n, p] = lenAt(o);
        if (!n) return void out.push(`${pad(d)}<dict/>`);
        stack.add(ref);
        out.push(`${pad(d)}<dict>`);
        for (let i = 0; i < n; i++) {
          const k = offsetOf(uint(p + i * refSize, refSize));
          const [kn, kp] = lenAt(k);
          const key = b[k] >> 4 === 0x6 ? new TextDecoder('utf-16be').decode(b.subarray(kp, kp + kn * 2)) : new TextDecoder('latin1').decode(b.subarray(kp, kp + kn));
          out.push(`${pad(d + 1)}<key>${esc(key)}</key>`);
          obj(uint(p + (n + i) * refSize, refSize), d + 1);
        }
        out.push(`${pad(d)}</dict>`);
        stack.delete(ref);
        return;
      }
      default:
        out.push(`${pad(d)}<string>(unknown 0x${m.toString(16)})</string>`);
    }
  };
  obj(top, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${out.join('\n')}\n</plist>\n`;
}
