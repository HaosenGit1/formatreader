/**
 * The heavy CAD engines, producing plain mesh data (no three.js here, so this
 * runs in a worker): STEP / IGES / BREP through occt-import-js (Open CASCADE,
 * LGPL-2.1) and IFC through web-ifc (MPL-2.0). Both are used unmodified.
 *
 * Both engines' glue code builds functions at run time (Emscripten embind),
 * which the page's security policy forbids; so on the website they run in a
 * worker (see cad-worker.ts), where that policy does not apply.
 */
export interface MeshData {
  positions: Float32Array;
  normals?: Float32Array;
  index: Uint32Array;
  /** r, g, b (0–1) and opacity. */
  color: [number, number, number, number] | null;
  /** Per-face colours (STEP/IGES faces): ranges of the index buffer. */
  groups?: Array<{ start: number; count: number; color: [number, number, number] | null }>;
  /** Column-major 4×4 placement (IFC). */
  matrix?: number[];
}

interface OcctMesh {
  color?: [number, number, number];
  brep_faces?: Array<{ first: number; last: number; color: [number, number, number] | null }>;
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
}

export async function occtMeshes(bytes: Uint8Array, kind: 'step' | 'iges' | 'brep'): Promise<MeshData[]> {
  const [{ default: factory }, { default: wasmUrl }] = await Promise.all([import('occt-import-js'), import('occt-import-js/dist/occt-import-js.wasm?url')]);
  const occt = await (factory as (o: { locateFile: () => string }) => Promise<Record<string, (b: Uint8Array, p: null) => { success: boolean; meshes: OcctMesh[] }>>)({ locateFile: () => wasmUrl });
  const read = kind === 'step' ? occt.ReadStepFile : kind === 'iges' ? occt.ReadIgesFile : occt.ReadBrepFile;
  const result = read(bytes, null);
  if (!result?.success) throw new Error(`This ${kind.toUpperCase()} file could not be read (it may be damaged, or hold only 2D data).`);
  return result.meshes.map((m) => {
    const faces = m.brep_faces ?? [];
    return {
      positions: new Float32Array(m.attributes.position.array),
      normals: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : undefined,
      index: new Uint32Array(m.index.array),
      color: m.color ? [m.color[0], m.color[1], m.color[2], 1] : null,
      groups: faces.some((f) => f.color) ? faces.map((f) => ({ start: f.first * 3, count: (f.last - f.first + 1) * 3, color: f.color ?? m.color ?? null })) : undefined,
    };
  });
}

export async function ifcMeshes(bytes: Uint8Array): Promise<MeshData[]> {
  const [{ IfcAPI }, { default: wasmUrl }] = await Promise.all([import('web-ifc'), import('web-ifc/web-ifc.wasm?url')]);
  const api = new IfcAPI();
  // Single-threaded: the multi-threaded build needs cross-origin isolation, which a static site doesn't have.
  await api.Init(() => wasmUrl, true);
  const id = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  const out: MeshData[] = [];
  try {
    api.StreamAllMeshes(id, (mesh) => {
      const placed = mesh.geometries;
      for (let i = 0; i < placed.size(); i++) {
        const pg = placed.get(i);
        const geom = api.GetGeometry(id, pg.geometryExpressID);
        const data = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()); // x y z nx ny nz …
        const index = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        const n = data.length / 6;
        const positions = new Float32Array(n * 3);
        const normals = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          positions.set(data.subarray(k * 6, k * 6 + 3), k * 3);
          normals.set(data.subarray(k * 6 + 3, k * 6 + 6), k * 3);
        }
        out.push({ positions, normals, index: new Uint32Array(index), color: [pg.color.x, pg.color.y, pg.color.z, pg.color.w], matrix: [...pg.flatTransformation] });
        geom.delete();
      }
    });
  } finally {
    api.CloseModel(id);
  }
  if (!out.length) throw new Error('This IFC file has no 3D geometry to show.');
  return out;
}
