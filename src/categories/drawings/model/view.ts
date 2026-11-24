/**
 * 3D model viewer: STL, OBJ, PLY, glTF/GLB, 3MF, FBX, 3DS, Collada, VRML, USDZ, AMF, and
 * point clouds (PCD, XYZ, LAS), drawn with three.js
 * (downloaded only when a model is opened). Drag to turn, scroll to zoom,
 * right-drag (or two fingers) to move. Shows size and triangle count.
 */
import './model.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';

const s = strings({
  reset: { en: 'Reset view', zh: '重置视图' },
  wireframe: { en: 'Wireframe', zh: '线框' },
  triangles: { en: 'triangles', zh: '个三角形' },
  points: { en: 'points', zh: '个点' },
  size: { en: 'Size', zh: '尺寸' },
  hint: { en: 'Drag to turn · scroll to zoom · right-drag to move', zh: '拖动旋转 · 滚轮缩放 · 右键拖动平移' },
  noWebgl: { en: 'This browser cannot draw 3D (WebGL is turned off or not available).', zh: '这个浏览器无法显示 3D（WebGL 被关闭或不可用）。' },
  external: {
    en: 'This glTF file refers to other files (textures or geometry) that are not inside it. Open the .glb version, or a glTF with everything embedded.',
    zh: '这个 glTF 文件引用了不在文件内的其他文件（贴图或几何数据）。请打开 .glb 版本，或内嵌全部数据的 glTF。',
  },
});

const extOf = (name: string) => /\.([a-z0-9]{1,6})$/i.exec(name)?.[1]?.toLowerCase() ?? '';

/** Which loader a file needs. */
export type ModelKind = 'stl' | 'obj' | 'ply' | 'gltf' | 'glb' | '3mf' | 'fbx' | 'step' | 'iges' | 'brep' | 'ifc' | '3ds' | 'dae' | 'wrl' | 'usdz' | 'amf' | 'pcd' | 'xyz' | 'las';

export function modelKind(formatId: string | undefined, ext: string): ModelKind | null {
  // IFC first: it is "ISO-10303-21" text too, so the detector may call it STEP.
  if (ext === 'ifc' || formatId === 'ifc') return 'ifc';
  if (ext === 'step' || ext === 'stp' || ext === 'p21' || formatId === 'step') return 'step';
  if (ext === 'iges' || ext === 'igs' || formatId === 'iges') return 'iges';
  if (ext === 'brep') return 'brep';
  if (formatId === 'glb' || ext === 'glb') return 'glb';
  if (formatId === '3mf' || ext === '3mf') return '3mf';
  if (formatId === 'fbx' || ext === 'fbx') return 'fbx';
  if (ext === 'stl' || formatId === 'stl') return 'stl';
  if (ext === 'obj') return 'obj';
  if (ext === 'ply') return 'ply';
  if (ext === 'gltf') return 'gltf';
  if (ext === '3ds') return '3ds';
  if (ext === 'dae') return 'dae';
  if (ext === 'wrl' || ext === 'vrml') return 'wrl';
  if (ext === 'usdz') return 'usdz';
  if (ext === 'amf') return 'amf';
  if (ext === 'pcd') return 'pcd';
  if (ext === 'xyz' || ext === 'pts') return 'xyz';
  if (ext === 'las' || ext === 'laz') return 'las';
  return null;
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = extOf(file.name);
  const kind = modelKind(ctx.format?.id, ext);
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const data = await file.arrayBuffer();

  // ---- load into a scene object
  let object: import('three').Object3D;
  let pointNote: string | undefined;
  if (kind === 'stl' || kind === 'ply') {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
    const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
    const geometry = kind === 'stl' ? new STLLoader().parse(data) : new PLYLoader().parse(data);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const vertexColors = !!geometry.attributes.color;
    object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: vertexColors ? 0xffffff : 0x8fa8d8, vertexColors, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide }));
  } else if (kind === 'obj') {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    object = new OBJLoader().parse(new TextDecoder().decode(data));
    // OBJ materials live in a separate .mtl file: give every part a neutral material.
    object.traverse((o) => {
      const mesh = o as import('three').Mesh;
      if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: 0x8fa8d8, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
    });
  } else if (kind === 'gltf' || kind === 'glb') {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    if (kind === 'gltf') {
      const json = JSON.parse(new TextDecoder().decode(data)) as { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
      const external = [...(json.buffers ?? []), ...(json.images ?? [])].some((b) => b.uri && !b.uri.startsWith('data:'));
      if (external) throw new Error(s('external'));
    }
    const gltf = await new GLTFLoader().parseAsync(data, '');
    object = gltf.scene;
  } else if (kind === '3mf') {
    const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js');
    object = new ThreeMFLoader().parse(data);
  } else if (kind === 'fbx') {
    const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
    object = new FBXLoader().parse(data, '');
  } else if (kind === '3ds') {
    const { TDSLoader } = await import('three/addons/loaders/TDSLoader.js');
    object = new TDSLoader().parse(data, '');
  } else if (kind === 'dae') {
    const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
    const dae = new ColladaLoader().parse(new TextDecoder().decode(data), '');
    if (!dae?.scene) throw new Error('This Collada file has no scene.');
    object = dae.scene;
  } else if (kind === 'wrl') {
    const { VRMLLoader } = await import('three/addons/loaders/VRMLLoader.js');
    object = new VRMLLoader().parse(new TextDecoder().decode(data), '');
  } else if (kind === 'usdz') {
    const { USDZLoader } = await import('three/addons/loaders/USDZLoader.js');
    object = new USDZLoader().parse(data);
  } else if (kind === 'amf') {
    const { AMFLoader } = await import('three/addons/loaders/AMFLoader.js');
    object = new AMFLoader().parse(data);
  } else if (kind === 'pcd') {
    const { PCDLoader } = await import('three/addons/loaders/PCDLoader.js');
    object = new PCDLoader().parse(data);
  } else if (kind === 'xyz' || kind === 'las') {
    const { readXyz, readLas } = await import('./points');
    const cloud = kind === 'las' ? readLas(data) : readXyz(new TextDecoder().decode(data));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    if (cloud.colors) geometry.setAttribute('color', new THREE.BufferAttribute(cloud.colors, 3));
    object = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 1, vertexColors: !!cloud.colors, color: cloud.colors ? 0xffffff : 0x4d79c7 }));
    pointNote = cloud.note;
  } else if (kind === 'step' || kind === 'iges' || kind === 'brep' || kind === 'ifc') {
    const { loadCad } = await import('./cad');
    object = await loadCad(THREE, new Uint8Array(data.slice(0)), kind);
  } else {
    throw new Error('Unknown 3D model type.');
  }

  // 3D printing and CAD formats (STL, 3MF, STEP, IGES) use "Z is up"; three.js uses "Y is up": stand them upright.
  if (kind === 'stl' || kind === '3mf' || kind === 'step' || kind === 'iges' || kind === 'brep' || kind === 'amf' || kind === 'las' || kind === 'xyz' || kind === 'pcd' || kind === '3ds') {
    object.rotation.x = -Math.PI / 2;
    object.updateMatrixWorld(true);
  }

  // ---- renderer
  const canvas = document.createElement('canvas');
  let renderer: import('three').WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }) /* readable for printing */;
  } catch {
    throw new Error(s('noWebgl'));
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  scene.add(sun);
  scene.add(object);

  // Size, centre, and how many triangles.
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1e-6);
  let triangles = 0;
  let points = 0;
  object.traverse((o) => {
    const g = (o as import('three').Mesh).geometry;
    if (!g) return;
    if ((o as import('three').Points).isPoints) {
      points += g.attributes.position?.count ?? 0;
      // Point size relative to the cloud, so dense scans and sparse surveys both read well.
      const m = (o as import('three').Points).material as import('three').PointsMaterial;
      m.size = radius / 250;
      m.sizeAttenuation = true;
      if (!m.vertexColors) m.color.set(0x3f6fc4); // uncoloured scans: a clear blue, not white on white
    } else triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
  });

  // A floor grid under the model.
  const grid = new THREE.GridHelper(radius * 4, 20, 0x9aa3b5, 0xd5d9e2);
  grid.position.set(center.x, box.min.y, center.z);
  (grid.material as import('three').Material).transparent = true;
  (grid.material as import('three').Material).opacity = 0.6;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const resetView = () => {
    const dir = new THREE.Vector3(1, 0.7, 1.2).normalize();
    camera.position.copy(center).addScaledVector(dir, radius / Math.tan((camera.fov * Math.PI) / 360) * 1.15);
    controls.target.copy(center);
    controls.update();
  };

  const stage = h('div', { class: 'md-stage' }, canvas, h('div', { class: 'md-hint' }, s('hint')));
  ctx.mount.replaceChildren(h('div', { class: 'view view-model' }, stage));

  // Draw only when something changes (saves battery), with damping frames after a move.
  let frame = 0;
  let damping = 0;
  const render = () => {
    frame = 0;
    const moving = controls.update();
    sun.position.copy(camera.position);
    renderer.render(scene, camera);
    if (moving || damping-- > 0) frame = requestAnimationFrame(render);
  };
  const requestRender = () => {
    damping = 20;
    if (!frame) frame = requestAnimationFrame(render);
  };
  controls.addEventListener('change', requestRender);

  const resize = () => {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resetView();
  resize();

  let wire = false;
  const wireBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'aria-pressed': 'false',
      onclick: () => {
        wire = !wire;
        wireBtn.setAttribute('aria-pressed', String(wire));
        object.traverse((o) => {
          const m = (o as import('three').Mesh).material as import('three').MeshStandardMaterial | import('three').MeshStandardMaterial[] | undefined;
          for (const mat of ([] as import('three').MeshStandardMaterial[]).concat(m ?? [])) if ('wireframe' in mat) mat.wireframe = wire;
        });
        requestRender();
      },
    },
    s('wireframe'),
  );
  const tools = [
    h('button', { type: 'button', class: 'btn', onclick: () => { resetView(); requestRender(); } }, s('reset')),
    wireBtn,
  ];

  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toPrecision(2));
  return {
    meta: () => [
      kind!.toUpperCase(),
      ...(triangles ? [`${Math.round(triangles).toLocaleString()} ${s('triangles')}`] : []),
      ...(points ? [`${points.toLocaleString()} ${s('points')}`] : []),
      `${s('size')} ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}${kind === 'ifc' ? ' m' : kind === 'step' || kind === 'iges' || kind === 'amf' ? ' mm' : ''}`,
    ],
    notices: () => (pointNote ? [h('div', { class: 'notice subtle' }, pointNote)] : []),
    tools: () => tools,
    destroy: () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const mesh = o as import('three').Mesh;
        mesh.geometry?.dispose();
      });
    },
  };
}
