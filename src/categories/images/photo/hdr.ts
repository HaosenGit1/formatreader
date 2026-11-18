/**
 * High-dynamic-range images (OpenEXR, Radiance HDR) hold light values far
 * brighter than a screen can show. This maps them to a normal picture: an
 * automatic exposure from the scene's average brightness (like a camera),
 * Reinhard tone mapping, then the sRGB curve. Decoders come from three.js.
 */
import type { Picture } from './decode';

/** Float RGBA (linear light) → 8-bit sRGB canvas. `flip`: rows are stored bottom-up. */
export function toneMap(data: ArrayLike<number>, width: number, height: number, flip: boolean, exposureStops = 0): Picture {
  const n = width * height;
  // Log-average luminance from a sample of pixels (fast on huge images).
  const step = Math.max(1, Math.floor(n / 200_000));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += step) {
    const l = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    if (Number.isFinite(l) && l >= 0) {
      sum += Math.log(1e-6 + l);
      count++;
    }
  }
  const avg = Math.exp(sum / Math.max(1, count));
  const exposure = (0.18 / Math.max(avg, 1e-6)) * 2 ** exposureStops;
  const lut = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < height; y++) {
    const src = (flip ? height - 1 - y : y) * width;
    for (let x = 0; x < width; x++) {
      const i = (src + x) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] * exposure;
        out[o + c] = lut(Number.isFinite(v) && v > 0 ? v / (1 + v) : 0);
      }
      const a = data[i + 3];
      out[o + 3] = Number.isFinite(a) ? Math.max(0, Math.min(255, Math.round(a * 255))) : 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(out, width, height), 0, 0);
  return { element: canvas, width, height };
}

export async function decodeExr(buf: ArrayBuffer): Promise<Picture> {
  const [THREE, { EXRLoader }] = await Promise.all([import('three'), import('three/addons/loaders/EXRLoader.js')]);
  const tex = new EXRLoader().setDataType(THREE.FloatType).parse(buf) as unknown as { width: number; height: number; data: Float32Array; format: number };
  const rgba = tex.format === THREE.RGBAFormat ? tex.data : expand(tex.data, tex.width * tex.height, tex.format === THREE.RedFormat ? 1 : 3);
  // three.js returns EXR rows bottom-up (GPU order).
  return toneMap(rgba, tex.width, tex.height, true);
}

export async function decodeHdr(buf: ArrayBuffer): Promise<Picture> {
  const [THREE, { HDRLoader }] = await Promise.all([import('three'), import('three/addons/loaders/HDRLoader.js')]);
  const tex = new HDRLoader().setDataType(THREE.FloatType).parse(buf) as unknown as { width: number; height: number; data: Float32Array };
  return toneMap(tex.data, tex.width, tex.height, false);
}

/** Grey (1 channel) or RGB (3) → RGBA. */
function expand(src: Float32Array, n: number, channels: number): Float32Array {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const r = src[i * channels];
    out[i * 4] = r;
    out[i * 4 + 1] = channels === 3 ? src[i * 3 + 1] : r;
    out[i * 4 + 2] = channels === 3 ? src[i * 3 + 2] : r;
    out[i * 4 + 3] = 1;
  }
  return out;
}
