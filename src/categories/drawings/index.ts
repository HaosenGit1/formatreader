/**
 * Drawings: CAD, 3D models and diagrams.
 * DXF drawn in full; 3D models in a three.js viewer; DWG, ODG and Visio shown
 * through what the file carries (preview picture, pages and texts); XMind as an outline.
 */
import type { ViewerEntry } from '../../core/viewer';
import { isGeoJson, isShp } from './map/sniff';

const text = (head: Uint8Array, n = 4096) => new TextDecoder('latin1').decode(head.subarray(0, n));

export const drawingsViewers: ViewerEntry[] = [
  {
    id: 'drawings/dxf',
    // DXF: 150 MB (2.7 million objects) opened in 6 s, 400 MB crashed the tab. DWG is packed
    // several times smaller and its engine needs extra memory (estimate, no big DWG to test).
    heavyAbove: (format) => (format?.id === 'dwg' ? 60 : 250) * 1024 * 1024,
    category: 'drawings',
    layout: 'fill',
    mimes: /dxf/,
    // DXF, and DWG (read with LibreDWG, then drawn by the same renderer).
    accepts: ({ format, ext, head }) => format?.id === 'dwg' || ((format?.id === 'dxf' || ext === 'dxf') && /(^|\n)\s*0\s*\r?\n\s*SECTION|^AutoCAD Binary DXF/.test(text(head))),
    load: () => import('./dxf/view'),
  },
  {
    id: 'drawings/model',
    heavyAbove: () => 300 * 1024 * 1024,
    priority: 55, // ahead of the archive viewer (USDZ and zipped AMF are ZIPs)
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
      if (ext === '3ds') return head[0] === 0x4d && head[1] === 0x4d;
      if (ext === 'dae') return /<COLLADA[\s>]/.test(text(head));
      if (ext === 'wrl' || ext === 'vrml') return /^#VRML V2/.test(text(head, 20));
      if (ext === 'usdz') return head[0] === 0x50 && head[1] === 0x4b;
      if (ext === 'amf') return /<amf[\s>]/.test(text(head)) || (head[0] === 0x50 && head[1] === 0x4b);
      if (ext === 'pcd') return /^(#.*\n)*\s*(VERSION|FIELDS)\s/m.test(text(head, 600));
      if (ext === 'las' || ext === 'laz') return text(head, 4) === 'LASF';
      // XYZ / PTS point lists: lines of 3+ numbers (a chemistry .xyz has element symbols instead).
      if (ext === 'xyz' || ext === 'pts') {
        const lines = text(head).split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
        return lines.filter((l) => /^\s*-?[\d.]+(e[-+]?\d+)?([\s,;]+-?[\d.]+(e[-+]?\d+)?){2,}\s*$/i.test(l)).length >= Math.min(3, lines.length - 1);
      }
      // .obj is also a compiler's object file: only Wavefront geometry text.
      if (ext === 'obj') return /(^|\n)\s*(v|vn|vt|f|o|g|mtllib)\s/.test(text(head)) && !/\0/.test(text(head, 512));
      return false;
    },
    load: () => import('./model/view'),
  },
  {
    // Maps: Google Earth KML/KMZ, GPS tracks (GPX), GeoJSON, Shapefiles. Ahead of the code viewer.
    id: 'drawings/map',
    category: 'drawings',
    layout: 'fill',
    priority: 60,
    mimes: /vnd\.google-earth|gpx|geo\+json/,
    accepts: ({ format, ext, head }) => {
      if (format?.id === 'kmz') return true;
      const t = text(head, 8192);
      if (ext === 'kml') return /<kml[\s>]/.test(t);
      if (ext === 'gpx') return /<gpx[\s>]/.test(t);
      if (ext === 'geojson' || ext === 'json' || ext === 'topojson') return isGeoJson(t);
      if (ext === 'shp') return isShp(head);
      return false;
    },
    load: () => import('./map/view'),
  },
  {
    id: 'drawings/preview',
    category: 'drawings',
    accepts: ({ format }) => ['odg', 'vsdx'].includes(format?.id ?? ''),
    load: () => import('./preview/view'),
  },
  {
    id: 'drawings/mindmap',
    category: 'drawings',
    accepts: ({ format }) => format?.id === 'xmind',
    load: () => import('./mindmap/view'),
  },
];
