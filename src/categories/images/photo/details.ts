/** Photo details from EXIF: camera, lens, exposure, date taken, location. */
import { strings } from '../../../core/i18n';

const s = strings({
  size: { en: 'Size', zh: '尺寸' },
  camera: { en: 'Camera', zh: '相机' },
  lens: { en: 'Lens', zh: '镜头' },
  taken: { en: 'Taken', zh: '拍摄时间' },
  exposure: { en: 'Exposure', zh: '曝光' },
  location: { en: 'Location', zh: '位置' },
  altitude: { en: 'Altitude', zh: '海拔' },
  software: { en: 'Software', zh: '软件' },
  file: { en: 'File', zh: '文件' },
});

export type Detail = [label: string, value: string];

const fmtExposure = (t?: number) => (t ? (t >= 1 ? `${t} s` : `1/${Math.round(1 / t)} s`) : '');

export async function photoDetails(file: File, width: number, height: number, label: string): Promise<Detail[]> {
  const out: Detail[] = [[s('size'), `${width} × ${height} px${width * height >= 1e6 ? ` · ${(width * height / 1e6).toFixed(1)} MP` : ''}`], [s('file'), label]];
  let t: Record<string, unknown> | undefined;
  try {
    const { default: exifr } = await import('exifr/dist/lite.esm.mjs');
    t = await exifr.parse(file, { tiff: true, exif: true, gps: true, translateValues: true, reviveValues: true });
  } catch {
    /* no metadata, or a format exifr doesn't read */
  }
  if (!t) return out;
  const str = (k: string) => (t![k] == null ? '' : String(t![k]).trim());
  const camera = [str('Make'), str('Model')].filter(Boolean).join(' ').replace(/^(\w+) \1 /i, '$1 ');
  if (camera) out.push([s('camera'), camera]);
  if (str('LensModel')) out.push([s('lens'), str('LensModel')]);
  const date = (t.DateTimeOriginal ?? t.CreateDate) as Date | undefined;
  if (date instanceof Date && !isNaN(date.getTime())) {
    // EXIF times are the camera's local clock with no zone: show them as written.
    out.push([s('taken'), new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)]);
  }
  const exposure = [
    fmtExposure(t.ExposureTime as number),
    t.FNumber ? `f/${t.FNumber}` : '',
    t.ISO ? `ISO ${t.ISO}` : '',
    t.FocalLength ? `${t.FocalLength} mm${t.FocalLengthIn35mmFormat ? ` (${t.FocalLengthIn35mmFormat} mm eq.)` : ''}` : '',
  ].filter(Boolean);
  if (exposure.length) out.push([s('exposure'), exposure.join(' · ')]);
  const lat = t.latitude as number | undefined;
  const lon = t.longitude as number | undefined;
  if (typeof lat === 'number' && typeof lon === 'number') out.push([s('location'), `${lat.toFixed(5)}, ${lon.toFixed(5)}`]);
  if (typeof t.GPSAltitude === 'number') out.push([s('altitude'), `${Math.round(t.GPSAltitude)} m`]);
  if (str('Software')) out.push([s('software'), str('Software')]);
  return out;
}
