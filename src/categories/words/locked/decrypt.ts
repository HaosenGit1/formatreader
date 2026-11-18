/**
 * Opens password-protected Word / Excel / PowerPoint files (.docx .xlsx .pptx… saved with
 * "Encrypt with password"), following Microsoft's published format [MS-OFFCRYPTO]:
 *  - Agile encryption (Office 2010 and later): SHA-512, 100 000 rounds, AES-256-CBC
 *  - Standard encryption (Office 2007): SHA-1, 50 000 rounds, AES-128/256-ECB
 * Everything happens on this computer with the browser's own cryptography; the password
 * and the file are never sent anywhere. The result is the ordinary (zip) Office file.
 */
import * as CFB from 'cfb';

export class WrongPassword extends Error {
  constructor() {
    super('wrong password');
    this.name = 'WrongPassword';
  }
}

const subtle = () => globalThis.crypto.subtle;
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};
const u32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const utf16 = (s: string) => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) (out[i * 2] = s.charCodeAt(i) & 255), (out[i * 2 + 1] = s.charCodeAt(i) >> 8);
  return out;
};
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hash = async (alg: string, data: Uint8Array) => new Uint8Array(await subtle().digest(alg, data as BufferSource));
const fit = (b: Uint8Array, n: number, pad: number) => (b.length >= n ? b.slice(0, n) : concat(b, new Uint8Array(n - b.length).fill(pad)));
const aesKey = (raw: Uint8Array, usage: KeyUsage[]) => subtle().importKey('raw', raw as BufferSource, 'AES-CBC', false, usage);

/** Imported AES keys, reused for every 4 KB segment of a big file. */
const keyCache = new WeakMap<Uint8Array, Promise<[CryptoKey, CryptoKey]>>();
function keysFor(raw: Uint8Array) {
  let k = keyCache.get(raw);
  if (!k) keyCache.set(raw, (k = Promise.all([aesKey(raw, ['encrypt']), aesKey(raw, ['decrypt'])])));
  return k;
}

/** AES-CBC without padding (the browser only does PKCS#7): add a block that decrypts to valid padding. */
async function cbcDecrypt(raw: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (!data.length || data.length % 16) throw new Error('bad block length');
  const last = data.subarray(data.length - 16);
  const [enc, dec] = await keysFor(raw);
  // E(pad ⊕ last): CBC-encrypting the padding with "last" as IV gives exactly that as the first block.
  const extra = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: last as BufferSource }, enc, new Uint8Array(16).fill(16)), 0, 16);
  return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, dec, concat(data, extra) as BufferSource));
}

/** AES-ECB via CBC: decrypt with a zero IV, then undo the chaining (xor with the previous cipher block). */
async function ecbDecrypt(raw: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const out = await cbcDecrypt(raw, new Uint8Array(16), data);
  for (let i = out.length - 1; i >= 16; i--) out[i] ^= data[i - 16];
  return out;
}

const read = (cfb: CFB.CFB$Container, name: string) => {
  const e = CFB.find(cfb, name);
  return e?.content ? new Uint8Array(e.content as ArrayLike<number>) : null;
};

/** Is this compound file an encrypted Office document? */
export function isEncryptedOffice(bytes: Uint8Array): boolean {
  try {
    const cfb = CFB.read(bytes, { type: 'array' });
    return !!CFB.find(cfb, 'EncryptionInfo') && !!CFB.find(cfb, 'EncryptedPackage');
  } catch {
    return false;
  }
}

export async function decryptOffice(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const cfb = CFB.read(bytes, { type: 'array' });
  const info = read(cfb, 'EncryptionInfo');
  const pkg = read(cfb, 'EncryptedPackage');
  if (!info || !pkg) throw new Error('not an encrypted Office file');
  const major = info[0] | (info[1] << 8);
  const minor = info[2] | (info[3] << 8);
  const size = Number(new DataView(pkg.buffer, pkg.byteOffset).getBigUint64(0, true));
  const data = pkg.subarray(8);
  if (major === 4 && minor === 4) return agile(info, data, size, password);
  if ((major === 3 || major === 4) && minor === 2) return standard(info, data, size, password);
  throw new Error(`This kind of encryption (version ${major}.${minor}) is not supported.`);
}

// ------------------------------------------------------------- Agile (Office 2010+)

const BLOCK_VERIFIER_INPUT = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
const BLOCK_VERIFIER_VALUE = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
const BLOCK_KEY = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);
const HASHES: Record<string, string> = { SHA512: 'SHA-512', SHA384: 'SHA-384', SHA256: 'SHA-256', SHA1: 'SHA-1', 'SHA-1': 'SHA-1' };

/** The attributes of the first <prefix:name …> element. */
function element(xml: string, name: string): { getAttribute(a: string): string | null } | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*)>`).exec(xml);
  if (!m) return null;
  const attrs = new Map<string, string>();
  for (const a of m[1].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs.set(a[1], a[2]);
  return { getAttribute: (a) => attrs.get(a) ?? null };
}

async function agile(info: Uint8Array, data: Uint8Array, size: number, password: string): Promise<Uint8Array> {
  // A small fixed XML header: read the two elements' attributes directly (no DOM needed, works in workers).
  const xml = new TextDecoder().decode(info.subarray(8));
  const keyData = element(xml, 'keyData');
  const enc = element(xml, 'encryptedKey');
  if (!keyData || !enc) throw new Error('unreadable encryption header');
  if (enc.getAttribute('cipherAlgorithm') !== 'AES') throw new Error(`Cipher ${enc.getAttribute('cipherAlgorithm')} is not supported.`);
  const alg = HASHES[enc.getAttribute('hashAlgorithm') ?? 'SHA512'] ?? 'SHA-512';
  const keyBytes = Number(enc.getAttribute('keyBits')) / 8;
  const blockSize = Number(enc.getAttribute('blockSize') || 16);
  const salt = b64(enc.getAttribute('saltValue')!);
  const spin = Number(enc.getAttribute('spinCount') || 100000);

  // H0 = H(salt + password), then H(i + H) spinCount times.
  let h = await hash(alg, concat(salt, utf16(password)));
  const buf = new Uint8Array(4 + h.length);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < spin; i++) {
    view.setUint32(0, i, true);
    buf.set(h, 4);
    h = await hash(alg, buf);
  }
  const keyFor = async (block: Uint8Array) => fit(await hash(alg, concat(h, block)), keyBytes, 0x36);
  const iv = fit(salt, blockSize, 0x36);

  // Check the password with the verifier before decrypting anything.
  const verifierInput = (await cbcDecrypt(await keyFor(BLOCK_VERIFIER_INPUT), iv, b64(enc.getAttribute('encryptedVerifierHashInput')!))).subarray(0, Number(enc.getAttribute('saltSize') || 16));
  const verifierHash = (await cbcDecrypt(await keyFor(BLOCK_VERIFIER_VALUE), iv, b64(enc.getAttribute('encryptedVerifierHashValue')!))).subarray(0, Number(enc.getAttribute('hashSize') || 64));
  const expected = await hash(alg, verifierInput);
  if (expected.some((b, i) => b !== verifierHash[i])) throw new WrongPassword();

  const secret = (await cbcDecrypt(await keyFor(BLOCK_KEY), iv, b64(enc.getAttribute('encryptedKeyValue')!))).subarray(0, Number(keyData.getAttribute('keyBits')) / 8);
  const dataSalt = b64(keyData.getAttribute('saltValue')!);
  const dataAlg = HASHES[keyData.getAttribute('hashAlgorithm') ?? 'SHA512'] ?? 'SHA-512';
  const dataBlock = Number(keyData.getAttribute('blockSize') || 16);

  // The package is encrypted in 4096-byte segments, each with its own IV.
  const out = new Uint8Array(Math.ceil(data.length / 16) * 16);
  for (let seg = 0, at = 0; at < data.length; seg++, at += 4096) {
    let chunk = data.subarray(at, Math.min(data.length, at + 4096));
    if (chunk.length % 16) chunk = concat(chunk, new Uint8Array(16 - (chunk.length % 16)));
    const segIv = fit(await hash(dataAlg, concat(dataSalt, u32(seg))), dataBlock, 0x36);
    out.set(await cbcDecrypt(secret, segIv, chunk), at);
  }
  return out.subarray(0, size);
}

// ------------------------------------------------------------- Standard (Office 2007)

async function standard(info: Uint8Array, data: Uint8Array, size: number, password: string): Promise<Uint8Array> {
  const v = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const headerSize = v.getUint32(8, true);
  const header = 12;
  const algId = v.getUint32(header + 8, true);
  const keyBits = v.getUint32(header + 16, true) || 128;
  if (algId !== 0x660e && algId !== 0x660f && algId !== 0x6610) throw new Error('Only AES encryption is supported (this file uses RC4).');
  const ver = header + headerSize;
  const salt = info.subarray(ver + 4, ver + 20);
  const encVerifier = info.subarray(ver + 20, ver + 36);
  const encVerifierHash = info.subarray(ver + 40, ver + 72);

  let h = await hash('SHA-1', concat(salt, utf16(password)));
  const buf = new Uint8Array(24);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < 50000; i++) {
    view.setUint32(0, i, true);
    buf.set(h, 4);
    h = await hash('SHA-1', buf);
  }
  const hFinal = await hash('SHA-1', concat(h, u32(0)));
  const x1 = new Uint8Array(64).fill(0x36);
  const x2 = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < hFinal.length; i++) (x1[i] ^= hFinal[i]), (x2[i] ^= hFinal[i]);
  const key = concat(await hash('SHA-1', x1), await hash('SHA-1', x2)).subarray(0, keyBits / 8);

  const verifier = await ecbDecrypt(key, encVerifier);
  const verifierHash = await ecbDecrypt(key, encVerifierHash);
  const expected = await hash('SHA-1', verifier);
  if (expected.some((b, i) => b !== verifierHash[i])) throw new WrongPassword();

  const usable = data.subarray(0, data.length - (data.length % 16));
  return (await ecbDecrypt(key, usable)).subarray(0, size);
}
