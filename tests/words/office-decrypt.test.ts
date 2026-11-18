// @vitest-environment happy-dom
/**
 * Password-protected Office files: a reference encryptor written from [MS-OFFCRYPTO]
 * (Agile §2.3.4.10–2.3.4.15, Standard §2.3.4.5–2.3.4.9) produces files that the reader
 * must open with the right password and refuse with a wrong one.
 */
import * as CFB from 'cfb';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { describe, expect, test } from 'vitest';
import { WrongPassword, decryptOffice, isEncryptedOffice } from '../../src/categories/words/locked/decrypt';

const subtle = globalThis.crypto.subtle;
const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };
const u32 = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
const utf16 = (s: string) => new Uint8Array(new Uint16Array([...s].map((c) => c.charCodeAt(0))).buffer);
const H = async (alg: string, d: Uint8Array) => new Uint8Array(await subtle.digest(alg, d as BufferSource));
const fit = (b: Uint8Array, n: number) => (b.length >= n ? b.slice(0, n) : cat(b, new Uint8Array(n - b.length).fill(0x36)));
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
/** AES-CBC encrypt of whole blocks, without the padding block the browser adds. */
const cbc = async (key: Uint8Array, iv: Uint8Array, data: Uint8Array) => {
  const k = await subtle.importKey('raw', key as BufferSource, 'AES-CBC', false, ['encrypt']);
  return new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, data as BufferSource)).slice(0, data.length);
};
const ecb = async (key: Uint8Array, data: Uint8Array) => {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 16) out.set(await cbc(key, new Uint8Array(16), data.subarray(i, i + 16)), i);
  return out;
};
const pad16 = (d: Uint8Array) => (d.length % 16 ? cat(d, new Uint8Array(16 - (d.length % 16))) : d);

function container(info: Uint8Array, pkg: Uint8Array): Uint8Array {
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/EncryptionInfo', info);
  CFB.utils.cfb_add(cfb, '/EncryptedPackage', pkg);
  return new Uint8Array(CFB.write(cfb, { type: 'array' }) as number[]);
}

export async function encryptAgile(plain: Uint8Array, password: string, spin = 100000): Promise<Uint8Array> {
  const alg = 'SHA-512';
  const keySalt = rand(16);
  const dataSalt = rand(16);
  const secret = rand(32);
  let h = await H(alg, cat(keySalt, utf16(password)));
  for (let i = 0; i < spin; i++) h = await H(alg, cat(u32(i), h));
  const keyFor = async (block: number[]) => fit(await H(alg, cat(h, new Uint8Array(block))), 32);
  const verifier = rand(16);
  const encInput = await cbc(await keyFor([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]), keySalt, verifier);
  const encValue = await cbc(await keyFor([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]), keySalt, await H(alg, verifier));
  const encKey = await cbc(await keyFor([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]), keySalt, secret);
  const parts: Uint8Array[] = [];
  for (let seg = 0, at = 0; at < plain.length; seg++, at += 4096) {
    const iv = fit(await H(alg, cat(dataSalt, u32(seg))), 16);
    parts.push(await cbc(secret, iv, pad16(plain.subarray(at, at + 4096))));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${b64(dataSalt)}"/><dataIntegrity encryptedHmacKey="" encryptedHmacValue=""/><keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><p:encryptedKey spinCount="${spin}" saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${b64(keySalt)}" encryptedVerifierHashInput="${b64(encInput)}" encryptedVerifierHashValue="${b64(encValue)}" encryptedKeyValue="${b64(encKey)}"/></keyEncryptor></keyEncryptors></encryption>`;
  const info = cat(new Uint8Array([4, 0, 4, 0]), u32(0x40), strToU8(xml));
  const size = new Uint8Array(8);
  new DataView(size.buffer).setUint32(0, plain.length, true);
  return container(info, cat(size, ...parts));
}

async function encryptStandard(plain: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = rand(16);
  let h = await H('SHA-1', cat(salt, utf16(password)));
  for (let i = 0; i < 50000; i++) h = await H('SHA-1', cat(u32(i), h));
  const hf = await H('SHA-1', cat(h, u32(0)));
  const x1 = new Uint8Array(64).fill(0x36);
  for (let i = 0; i < 20; i++) x1[i] ^= hf[i];
  const key = (await H('SHA-1', x1)).slice(0, 16);
  const verifier = rand(16);
  const encVerifier = await ecb(key, verifier);
  const encHash = await ecb(key, pad16(await H('SHA-1', verifier)));
  // EncryptionHeader: flags, sizeExtra, algID AES-128, algIDHash SHA-1, keySize, providerType, 2 reserved, CSP name.
  const csp = utf16('Microsoft Enhanced RSA and AES Cryptographic Provider\0');
  const header = cat(u32(0x24), u32(0), u32(0x660e), u32(0x8004), u32(128), u32(0x18), u32(0), u32(0), csp);
  const info = cat(new Uint8Array([3, 0, 2, 0]), u32(0x24), u32(header.length), header, u32(16), salt, encVerifier, u32(20), encHash);
  const size = new Uint8Array(8);
  new DataView(size.buffer).setUint32(0, plain.length, true);
  return container(info, cat(size, await ecb(key, pad16(plain))));
}

const workbook = () => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook>风机 2310 kW</workbook>'), 'big.bin': rand(20000) });

describe('password-protected Office files', () => {
  test('Agile (Office 2010+): right password opens, wrong one is refused', async () => {
    const plain = workbook();
    const file = await encryptAgile(plain, '风场2026!', 1000);
    expect(isEncryptedOffice(file)).toBe(true);
    const out = await decryptOffice(file, '风场2026!');
    expect(out).toEqual(plain);
    expect(strFromU8(unzipSync(out)['xl/workbook.xml'])).toContain('风机');
    await expect(decryptOffice(file, 'wrong')).rejects.toBeInstanceOf(WrongPassword);
  });

  test('Agile with the real 100 000 rounds', async () => {
    const plain = workbook();
    const file = await encryptAgile(plain, 'secret');
    expect(await decryptOffice(file, 'secret')).toEqual(plain);
  }, 30000);

  test('Standard (Office 2007)', async () => {
    const plain = workbook();
    const file = await encryptStandard(plain, 'pass');
    expect(await decryptOffice(file, 'pass')).toEqual(plain);
    await expect(decryptOffice(file, 'nope')).rejects.toBeInstanceOf(WrongPassword);
  }, 30000);

  test('an ordinary old Office file is not taken for an encrypted one', () => {
    const cfb = CFB.utils.cfb_new();
    CFB.utils.cfb_add(cfb, '/WordDocument', new Uint8Array(600));
    expect(isEncryptedOffice(new Uint8Array(CFB.write(cfb, { type: 'array' }) as number[]))).toBe(false);
  });
});
