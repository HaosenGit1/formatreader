/**
 * Drawings: CAD, 3D models and diagrams.
 * DXF drawn in full; 3D models in a three.js viewer; DWG, ODG and Visio shown
 * through what the file carries (preview picture, pages and texts); XMind as an outline.
 */
import type { ViewerEntry } from '../../core/viewer';

const text = (head: Uint8Array, n = 4096) => new TextDecoder('latin1').decode(head.subarray(0, n));

export const drawingsViewers: ViewerEntry[] = [
  {
    id: 'drawings/dxf',
    category: 'drawings',
    layout: 'fill',
    mimes: /dxf/,
    accepts: ({ format, ext, head }) => (format?.id === 'dxf' || ext === 'dxf') && /(^|\n)\s*0\s*\r?\n\s*SECTION|^AutoCAD Binary DXF/.test(text(head)),
    load: () => import('./dxf/view'),
  },
  {
    id: 'drawings/model',
    category: 'drawings',
    layout: 'fill',
    mimes: /^model\//,
    accepts: ({ format, ext, head }) => {
      const id = format?.id ?? '';
      if (['glb', '3mf', 'fbx', 'stl'].includes(id)) return true;
      if (ext === 'stl' || ext === 'glb' || ext === 'fbx') return true;
      // STEP and IFC are both "ISO-10303-21" text; the schema line tells them apart.
      if (['step', 'stp', 'p21', 'ifc'].includes(ext)) return /ISO-10303-21/.test(text(head, 200));
      if (ext === 'iges' || ext === 'igs') return /^.{72}S\s*1\s*$/m.test(text(head, 400)) || /S\s+1\r?\n/.test(text(head, 400));
      if (ext === 'brep') return /DBRep_DrawableShape|CASCADE Topology/.test(text(head, 300));
      if (ext === 'ply') return text(head, 3) === 'ply';
      if (ext === 'gltf') return /"asset"/.test(text(head));
      // .obj is also a compiler's object file: only Wavefront geometry text.
      if (ext === 'obj') return /(^|\n)\s*(v|vn|vt|f|o|g|mtllib)\s/.test(text(head)) && !/\0/.test(text(head, 512));
      return false;
    },
    load: () => import('./model/view'),
  },
  {
    id: 'drawings/preview',
    category: 'drawings',
    accepts: ({ format }) => ['dwg', 'odg', 'vsdx'].includes(format?.id ?? ''),
    load: () => import('./preview/view'),
  },
  {
    id: 'drawings/mindmap',
    category: 'drawings',
    accepts: ({ format }) => format?.id === 'xmind',
    load: () => import('./mindmap/view'),
  },
];
