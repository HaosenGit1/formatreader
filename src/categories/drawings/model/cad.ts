/**
 * STEP / IGES / BREP / IFC → three.js objects. The engines run in a worker on
 * the website (their glue needs run-time code generation, which the page's
 * policy blocks); the portable single file runs them on the page instead.
 */
import type { MeshData } from './cad-engines';

type Three = typeof import('three');
export type CadKind = 'step' | 'iges' | 'brep' | 'ifc';

async function meshes(bytes: Uint8Array, kind: CadKind): Promise<MeshData[]> {
  if (import.meta.env.MODE === 'portable') {
    const { ifcMeshes, occtMeshes } = await import('./cad-engines');
    return kind === 'ifc' ? ifcMeshes(bytes) : occtMeshes(bytes, kind);
  }
  const { startCadWorker } = await import('./cad-worker-host');
  const worker = startCadWorker();
  try {
    return await new Promise<MeshData[]>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ ok: boolean; meshes?: MeshData[]; error?: string }>) => (e.data.ok ? resolve(e.data.meshes!) : reject(new Error(e.data.error)));
      worker.onerror = (e) => reject(new Error(e.message || 'The CAD engine could not start.'));
      worker.postMessage({ kind, bytes }, [bytes.buffer]);
    });
  } finally {
    worker.terminate();
  }
}

export async function loadCad(THREE: Three, bytes: Uint8Array, kind: CadKind): Promise<import('three').Object3D> {
  const group = new THREE.Group();
  const materials = new Map<string, import('three').Material>();
  const material = (c: readonly number[] | null) => {
    const key = c ? c.join(',') : 'default';
    if (!materials.has(key)) {
      const opacity = c?.[3] ?? 1;
      materials.set(key, new THREE.MeshStandardMaterial({ color: c ? new THREE.Color(c[0], c[1], c[2]) : 0xa9b4c8, opacity, transparent: opacity < 1, depthWrite: opacity >= 1, metalness: kind === 'ifc' ? 0 : 0.2, roughness: kind === 'ifc' ? 0.8 : 0.55, side: THREE.DoubleSide }));
    }
    return materials.get(key)!;
  };
  for (const m of await meshes(bytes, kind)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    if (m.normals) g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    if (!m.normals) g.computeVertexNormals();
    let mesh: import('three').Mesh;
    if (m.groups?.length) {
      m.groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
      mesh = new THREE.Mesh(g, m.groups.map((gr) => material(gr.color ? [...gr.color, 1] : m.color)));
    } else mesh = new THREE.Mesh(g, material(m.color));
    if (m.matrix) mesh.applyMatrix4(new THREE.Matrix4().fromArray(m.matrix));
    group.add(mesh);
  }
  return group;
}
