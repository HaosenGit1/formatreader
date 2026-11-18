/** Runs the CAD engines off the page (see cad-engines.ts for why). */
import { ifcMeshes, occtMeshes, type MeshData } from './cad-engines';

self.onmessage = async (e: MessageEvent<{ kind: 'step' | 'iges' | 'brep' | 'ifc'; bytes: Uint8Array }>) => {
  try {
    const { kind, bytes } = e.data;
    const meshes: MeshData[] = kind === 'ifc' ? await ifcMeshes(bytes) : await occtMeshes(bytes, kind);
    const transfer = meshes.flatMap((m) => [m.positions.buffer, m.index.buffer, ...(m.normals ? [m.normals.buffer] : [])]) as ArrayBuffer[];
    (self as unknown as Worker).postMessage({ ok: true, meshes }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String((err as Error)?.message ?? err) });
  }
};
