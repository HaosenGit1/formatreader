/**
 * DWG support: LibreDWG reads the file (in a worker on the website), and this
 * maps its objects onto the same shapes dxf-parser produces, so DWG drawings are
 * drawn by the same renderer as DXF (layers, blocks, text, dimensions…).
 */
import ACI from 'dxf-parser/dist/AutoCadColorIndex.js';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function load(bytes: Uint8Array): Promise<Obj> {
  if (import.meta.env.MODE === 'portable') {
    const { readDwg } = await import('./dwg-engine');
    return (await readDwg(bytes)) as Obj;
  }
  const { startDwgWorker } = await import('./dwg-worker-host');
  const worker = startDwgWorker();
  try {
    return await new Promise<Obj>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ ok: boolean; db?: Obj; error?: string }>) => (e.data.ok ? resolve(e.data.db!) : reject(new Error(e.data.error)));
      worker.onerror = (e) => reject(new Error(e.message || 'The DWG engine could not start.'));
      worker.postMessage(bytes, [bytes.buffer]);
    });
  } finally {
    worker.terminate();
  }
}

const deg = (rad: number | undefined) => ((rad ?? 0) * 180) / Math.PI;
const aci = (i: number | undefined) => (i !== undefined && i > 0 && i < 256 ? (ACI as number[])[i] : undefined);

/** One LibreDWG entity → dxf-parser-shaped entities (some become several: attributes, hatch outlines). */
function convert(e: Obj, out: Obj[]) {
  const base = { type: e.type, layer: e.layer, colorIndex: e.colorIndex, color: aci(e.colorIndex) };
  switch (e.type) {
    case 'LINE':
      out.push({ ...base, vertices: [e.startPoint, e.endPoint] });
      break;
    case 'LWPOLYLINE':
      out.push({ ...base, vertices: e.vertices ?? [], shape: !!(e.flag & 1) || !!(e.flag & 512) });
      break;
    case 'POLYLINE2D':
    case 'POLYLINE3D':
      out.push({ ...base, type: 'POLYLINE', vertices: e.vertices ?? [], shape: !!(e.flag & 1) });
      break;
    case 'CIRCLE':
    case 'ARC':
    case 'POINT':
      out.push({ ...base, ...e, colorIndex: e.colorIndex, color: aci(e.colorIndex) });
      break;
    case 'ELLIPSE':
      out.push({ ...base, center: e.center, majorAxisEndPoint: e.majorAxisEndPoint, axisRatio: e.axisRatio, startAngle: e.startAngle, endAngle: e.endAngle });
      break;
    case 'SPLINE':
      out.push({ ...base, controlPoints: e.controlPoints, knotValues: e.knots, degreeOfSplineCurve: e.degree, fitPoints: e.fitPoints, closed: !!(e.flag & 1) });
      break;
    case 'TEXT':
      out.push({ ...base, startPoint: e.startPoint, endPoint: e.endPoint, textHeight: e.textHeight, rotation: deg(e.rotation), text: e.text, halign: e.halign, valign: e.valign });
      break;
    case 'MTEXT': {
      const dir = e.direction;
      const rot = dir && (dir.x || dir.y) ? (Math.atan2(dir.y, dir.x) * 180) / Math.PI : deg(e.rotation);
      out.push({ ...base, position: e.insertionPoint, height: e.textHeight, width: e.rectWidth, attachmentPoint: e.attachmentPoint, rotation: rot, text: e.text });
      break;
    }
    case 'INSERT':
      out.push({
        ...base, name: e.name, position: e.insertionPoint, xScale: e.xScale ?? 1, yScale: e.yScale ?? 1, rotation: deg(e.rotation),
        columnCount: Math.max(1, e.columnCount ?? 1), rowCount: Math.max(1, e.rowCount ?? 1), columnSpacing: e.columnSpacing, rowSpacing: e.rowSpacing,
      });
      // Attribute values (texts on the block reference) are already placed in drawing coordinates.
      for (const a of e.attribs ?? []) {
        const t = a.text ?? {};
        if (t.text) out.push({ type: 'TEXT', layer: a.layer ?? e.layer, colorIndex: a.colorIndex, color: aci(a.colorIndex), startPoint: t.startPoint, endPoint: t.endPoint, textHeight: t.textHeight, rotation: deg(t.rotation), text: t.text, halign: t.halign, valign: t.valign });
      }
      break;
    case 'DIMENSION':
      out.push({ ...base, block: e.name });
      break;
    case 'SOLID':
    case '3DFACE':
      out.push({ ...base, points: [e.corner1, e.corner2, e.corner3, e.corner4].filter(Boolean) });
      break;
    case 'MLINE':
      out.push({ ...base, type: 'LWPOLYLINE', vertices: (e.vertices ?? []).map((v: Obj) => v.vertex), shape: !!(e.flags & 2) });
      break;
    case 'HATCH':
      // Outline of each boundary (fill patterns are not drawn).
      for (const path of e.boundaryPaths ?? []) {
        if (path.vertices?.length) {
          out.push({ ...base, type: 'LWPOLYLINE', vertices: path.vertices, shape: true });
          continue;
        }
        for (const edge of path.edges ?? []) {
          if (edge.type === 1 && edge.start && edge.end) out.push({ ...base, type: 'LINE', vertices: [edge.start, edge.end] });
          else if (edge.type === 2 && edge.center) out.push({ ...base, type: 'ARC', center: edge.center, radius: edge.radius, startAngle: edge.isCCW === false ? -edge.endAngle : edge.startAngle, endAngle: edge.isCCW === false ? -edge.startAngle : edge.endAngle });
        }
      }
      break;
    case 'XLINE':
    case 'RAY':
      break; // infinite construction lines: drawing them would make the extents infinite
    default:
      out.push({ type: e.type }); // counted as "not drawn yet"
  }
}

export async function readDwgAsDxf(bytes: Uint8Array): Promise<Obj> {
  return dwgToDxf(await load(bytes));
}

/** LibreDWG's database → the dxf-parser shape the renderer understands. */
export function dwgToDxf(db: Obj): Obj {
  const layers: Obj = {};
  for (const l of db.tables?.LAYER?.entries ?? []) layers[l.name] = { color: aci(Math.abs(l.colorIndex)) ?? l.color, colorIndex: Math.abs(l.colorIndex), visible: !l.off && l.colorIndex >= 0, frozen: l.frozen };
  const blocks: Obj = {};
  for (const b of db.tables?.BLOCK_RECORD?.entries ?? []) {
    if (/^\*(Model|Paper)_Space/i.test(b.name)) continue;
    const ents: Obj[] = [];
    for (const e of b.entities ?? []) convert(e, ents);
    blocks[b.name] = { name: b.name, position: b.basePoint, entities: ents };
  }
  // Model space only (paper-space layouts hold title blocks and viewports, not the drawing).
  const owner = new Map<string, string>((db.tables?.BLOCK_RECORD?.entries ?? []).map((b: Obj) => [b.handle, b.name]));
  const entities: Obj[] = [];
  for (const e of db.entities ?? []) {
    const name = owner.get(e.ownerBlockRecordSoftId);
    if (!name || /^\*Model_Space/i.test(name)) convert(e, entities);
  }
  return { tables: { layer: { layers } }, blocks, entities };
}
