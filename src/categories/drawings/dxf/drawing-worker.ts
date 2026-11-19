/** Opens a DXF or DWG off the page (see drawing-job.ts). */
import { buildDwgBytes, buildDxfBytes, buildGerberBytes, buildHpglBytes, pack, type Report } from './drawing-job';

const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);

self.onmessage = async (e: MessageEvent<{ bytes: Uint8Array; dwg: boolean; kind?: 'dxf' | 'dwg' | 'hpgl' | 'gerber'; name?: string }>) => {
  const report: Report = (step, fraction) => post({ progress: [step, fraction] });
  try {
    const kind = e.data.kind ?? (e.data.dwg ? 'dwg' : 'dxf');
    const built = kind === 'gerber' ? await buildGerberBytes(e.data.bytes, report, e.data.name) : await (kind === 'dwg' ? buildDwgBytes : kind === 'hpgl' ? buildHpglBytes : buildDxfBytes)(e.data.bytes, report);
    report('pack');
    const { packed, transfer } = pack(built);
    post({ ok: true, result: packed }, transfer);
  } catch (err) {
    post({ ok: false, error: String((err as Error)?.message ?? err) });
  }
};
