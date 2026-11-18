#!/usr/bin/env python3
"""Make the drawing samples in samples/drawings (all generated here, no third-party content).

    python3 scripts/make-drawing-samples.py
"""
import io
import json
import math
import os
import struct
import zipfile

OUT = os.path.join(os.path.dirname(__file__), '..', 'samples', 'drawings')
os.makedirs(OUT, exist_ok=True)


# ----------------------------------------------------------------------------- DXF

def dxf(version, codepage, encoding, labels):
    """A small site plan: layers, a turbine block inserted 3×, arcs, polyline bulges, text."""
    L = []

    def g(code, value):
        L.append(f'{code}\n{value}')

    g(0, 'SECTION'); g(2, 'HEADER')
    g(9, '$ACADVER'); g(1, version)
    g(9, '$DWGCODEPAGE'); g(3, codepage)
    g(0, 'ENDSEC')
    g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, 4)
    for name, color in [('0', 7), ('ROADS', 8), ('TURBINES', 5), ('CABLES', 1), ('TEXT', 3)]:
        g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS')
    g(0, 'ENDTAB'); g(0, 'ENDSEC')
    # Block: turbine symbol (tower circle + three blades), drawn around its base point.
    g(0, 'SECTION'); g(2, 'BLOCKS')
    g(0, 'BLOCK'); g(8, '0'); g(2, 'WTG'); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, 'WTG')
    g(0, 'CIRCLE'); g(8, '0'); g(10, 0); g(20, 0); g(30, 0); g(40, 3)
    for a in (90, 210, 330):
        r = math.radians(a)
        g(0, 'LINE'); g(8, '0'); g(10, 0); g(20, 0); g(30, 0); g(11, 20 * math.cos(r)); g(21, 20 * math.sin(r)); g(31, 0)
    g(0, 'ENDBLK'); g(8, '0')
    g(0, 'ENDSEC')
    g(0, 'SECTION'); g(2, 'ENTITIES')
    # Site boundary: closed polyline with one curved (bulge) edge.
    g(0, 'LWPOLYLINE'); g(8, 'ROADS'); g(90, 4); g(70, 1)
    for x, y, b in [(0, 0, 0), (400, 0, 0.4), (400, 250, 0), (0, 250, 0)]:
        g(10, x); g(20, y)
        if b:
            g(42, b)
    # Access road (arc + line)
    g(0, 'LINE'); g(8, 'ROADS'); g(10, 20); g(20, 125); g(30, 0); g(11, 150); g(21, 125); g(31, 0)
    g(0, 'ARC'); g(8, 'ROADS'); g(10, 150); g(20, 175); g(30, 0); g(40, 50); g(50, 270); g(51, 360)
    # Three turbines: the block inserted with different rotation and scale.
    for i, (x, y, rot, sc) in enumerate([(100, 60, 0, 1), (230, 190, 30, 1.2), (330, 80, 60, 1)]):
        g(0, 'INSERT'); g(8, 'TURBINES'); g(2, 'WTG'); g(10, x); g(20, y); g(30, 0); g(41, sc); g(42, sc); g(50, rot)
        g(0, 'TEXT'); g(8, 'TEXT'); g(10, x + 8); g(20, y - 14); g(30, 0); g(40, 6); g(1, f'WTG-0{i + 1}')
    # Cable route (spline through the turbines) and substation (ellipse).
    g(0, 'SPLINE'); g(8, 'CABLES'); g(70, 8); g(71, 3); g(72, 8); g(73, 4)
    for k in (0, 0, 0, 0, 1, 1, 1, 1):
        g(40, k)
    for x, y in [(100, 60), (160, 220), (280, 20), (330, 80)]:
        g(10, x); g(20, y); g(30, 0)
    g(0, 'ELLIPSE'); g(8, 'CABLES'); g(10, 60); g(20, 210); g(30, 0); g(11, 25); g(21, 0); g(31, 0); g(40, 0.5); g(41, 0); g(42, 2 * math.pi)
    g(0, 'TEXT'); g(8, 'TEXT'); g(10, 20); g(20, 230); g(30, 0); g(40, 10); g(1, labels[0])
    g(0, 'MTEXT'); g(8, 'TEXT'); g(10, 250); g(20, 240); g(30, 0); g(40, 7); g(41, 140); g(71, 1); g(1, labels[1])
    g(0, 'ENDSEC'); g(0, 'EOF')
    return ('\n'.join(L) + '\n').encode(encoding)


open(os.path.join(OUT, 'site-plan-2018.dxf'), 'wb').write(
    dxf('AC1032', 'ANSI_1252', 'utf-8', ['Wind farm site plan · 风电场总平面图', '{\\fArial|b1;Substation} 升压站\\PScale 1:2000 · 縮尺']))
open(os.path.join(OUT, 'site-plan-gbk-r12.dxf'), 'wb').write(
    dxf('AC1009', 'ANSI_936', 'gbk', ['风电场总平面图 Site plan', '升压站\\P比例 1:2000']))


# ----------------------------------------------------------------------------- 3D: a turbine mesh

def turbine():
    """Triangles (and vertices) of a simple turbine: tower (cylinder), nacelle (box), three blades."""
    tris = []

    def quad(a, b, c, d):
        tris.extend([(a, b, c), (a, c, d)])

    n = 24
    for i in range(n):  # tower, radius 2→1.2, height 0→60
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        b0 = (2 * math.cos(a0), 0, 2 * math.sin(a0)); b1 = (2 * math.cos(a1), 0, 2 * math.sin(a1))
        t0 = (1.2 * math.cos(a0), 60, 1.2 * math.sin(a0)); t1 = (1.2 * math.cos(a1), 60, 1.2 * math.sin(a1))
        quad(b0, t0, t1, b1)
    # nacelle box
    x0, x1, y0, y1, z0, z1 = -3, 7, 59, 63, -2, 2
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
        quad(*(v[i] for i in f))
    # blades in the x = -3.5 plane around the hub (0, 61)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        d = (math.cos(a), math.sin(a))
        p = (-d[1], d[0])
        root, tip = 1.5, 30
        w0, w1 = 1.6, 0.4
        c = (-3.5, 61, 0)
        def pt(r, w):
            return (c[0], c[1] + d[1] * r + p[1] * w, c[2] + d[0] * r + p[0] * w)
        quad(pt(root, -w0), pt(root, w0), pt(tip, w1), pt(tip, -w1))
        quad(pt(root, w0), pt(root, -w0), pt(tip, -w1), pt(tip, w1))
    return tris


T = turbine()


def normal(a, b, c):
    u = [b[i] - a[i] for i in range(3)]; w = [c[i] - a[i] for i in range(3)]
    nx, ny, nz = u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]
    m = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
    return (nx / m, ny / m, nz / m)


# STL and 3MF are "Z is up" (3D printing / CAD convention): turn the Y-up model to Z-up for them.
zup = lambda p: (p[0], -p[2], p[1])
TZ = [tuple(zup(p) for p in t) for t in T]

with open(os.path.join(OUT, 'turbine-binary.stl'), 'wb') as f:
    f.write(b'FormatReader sample turbine'.ljust(80, b' ') + struct.pack('<I', len(TZ)))
    for t in TZ:
        f.write(struct.pack('<12fH', *normal(*t), *t[0], *t[1], *t[2], 0))

with open(os.path.join(OUT, 'turbine-ascii.stl'), 'w') as f:
    f.write('solid turbine\n')
    for t in TZ:
        f.write('  facet normal %f %f %f\n    outer loop\n' % normal(*t))
        for p in t:
            f.write('      vertex %f %f %f\n' % p)
        f.write('    endloop\n  endfacet\n')
    f.write('endsolid turbine\n')

verts = []
index = {}
faces = []
for t in T:
    ids = []
    for p in t:
        key = tuple(round(c, 6) for c in p)
        if key not in index:
            index[key] = len(verts); verts.append(key)
        ids.append(index[key])
    faces.append(ids)

with open(os.path.join(OUT, 'turbine.obj'), 'w') as f:
    f.write('# FormatReader sample turbine\no turbine\n')
    f.writelines('v %f %f %f\n' % v for v in verts)
    f.writelines('f %d %d %d\n' % tuple(i + 1 for i in fc) for fc in faces)

with open(os.path.join(OUT, 'turbine.ply'), 'w') as f:
    f.write(f'ply\nformat ascii 1.0\ncomment FormatReader sample\nelement vertex {len(verts)}\nproperty float x\nproperty float y\nproperty float z\nelement face {len(faces)}\nproperty list uchar int vertex_indices\nend_header\n')
    f.writelines('%f %f %f\n' % v for v in verts)
    f.writelines('3 %d %d %d\n' % tuple(fc) for fc in faces)

# GLB: one mesh, positions + indices, a blue-grey material.
pos = b''.join(struct.pack('<3f', *v) for v in verts)
idx = b''.join(struct.pack('<3I', *fc) for fc in faces)
mins = [min(v[i] for v in verts) for i in range(3)]; maxs = [max(v[i] for v in verts) for i in range(3)]
gltf = {
    'asset': {'version': '2.0', 'generator': 'FormatReader samples'},
    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'turbine'}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'material': 0}]}],
    'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [0.85, 0.88, 0.95, 1], 'metallicFactor': 0.1, 'roughnessFactor': 0.6}}],
    'buffers': [{'byteLength': len(pos) + len(idx)}],
    'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(pos), 'target': 34962}, {'buffer': 0, 'byteOffset': len(pos), 'byteLength': len(idx), 'target': 34963}],
    'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(verts), 'type': 'VEC3', 'min': mins, 'max': maxs},
                  {'bufferView': 1, 'componentType': 5125, 'count': len(faces) * 3, 'type': 'SCALAR'}],
}
js = json.dumps(gltf).encode(); js += b' ' * (-len(js) % 4)
bin_ = pos + idx; bin_ += b'\0' * (-len(bin_) % 4)
glb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bin_), b'BIN\0') + bin_
open(os.path.join(OUT, 'turbine.glb'), 'wb').write(glb)

# 3MF: zip with the model XML.
model = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>']
model += ['<vertex x="%f" y="%f" z="%f"/>' % zup(v) for v in verts]
model += ['</vertices><triangles>'] + ['<triangle v1="%d" v2="%d" v3="%d"/>' % tuple(fc) for fc in faces]
model += ['</triangles></mesh></object></resources><build><item objectid="1"/></build></model>']
with zipfile.ZipFile(os.path.join(OUT, 'turbine.3mf'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
    z.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
    z.writestr('3D/3dmodel.model', ''.join(model))


# ----------------------------------------------------------------------------- XMind, ODG, Visio, DWG preview

def topic(title, *kids):
    t = {'id': title, 'title': title}
    if kids:
        t['children'] = {'attached': list(kids)}
    return t

xmind = [{'id': 's1', 'title': 'Wind farm O&M', 'rootTopic': topic('风电场运维 Wind farm O&M',
         topic('SCADA', topic('OPC UA server'), topic('Historian'), topic('Alarms 告警')),
         topic('Turbines 风机', topic('WTG-01'), topic('WTG-02'), topic('WTG-03 gearbox fault')),
         topic('Substation 升压站', topic('Protection relays'), topic('COMTRADE records')))}]
with zipfile.ZipFile(os.path.join(OUT, 'operations.xmind'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('content.json', json.dumps(xmind, ensure_ascii=False))
    z.writestr('metadata.json', '{"creator":{"name":"FormatReader samples"}}')

logo = open(os.path.join(OUT, '..', 'images', 'logo.png'), 'rb').read()
with zipfile.ZipFile(os.path.join(OUT, 'layout.odg'), 'w') as z:
    z.writestr(zipfile.ZipInfo('mimetype'), 'application/vnd.oasis.opendocument.graphics')
    z.writestr('content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"><office:body><office:drawing><draw:page draw:name="page1"/><draw:page draw:name="page2"/></office:drawing></office:body></office:document-content>')
    z.writestr('Thumbnails/thumbnail.png', logo)
    z.writestr('META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.graphics"/></manifest:manifest>')

def vpage(shapes):
    body = ''.join(f'<Shape ID="{i + 1}" Type="Shape"><Text>{t}</Text></Shape>' for i, t in enumerate(shapes))
    return f'<?xml version="1.0" encoding="utf-8"?><PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main"><Shapes>{body}</Shapes></PageContents>'

with zipfile.ZipFile(os.path.join(OUT, 'network.vsdx'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('visio/document.xml', '<?xml version="1.0" encoding="utf-8"?><VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main"/>')
    z.writestr('visio/pages/pages.xml', '<?xml version="1.0" encoding="utf-8"?><Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main"><Page ID="0" NameU="SCADA network" Name="SCADA network"/><Page ID="1" NameU="Power" Name="电气 Power"/></Pages>')
    z.writestr('visio/pages/page1.xml', vpage(['SCADA server', 'Firewall', 'Turbine switch &amp; ring', 'OPC UA gateway']))
    z.writestr('visio/pages/page2.xml', vpage(['33 kV collector', '升压站 Substation', 'Grid connection']))

# DWG-style file: AC1032 header, the preview address at 0x0D, the sentinel and one PNG entry.
sentinel = bytes([0x1f, 0x25, 0x6d, 0x07, 0xd4, 0x36, 0x28, 0x28, 0x9d, 0x57, 0xca, 0x3f, 0x9d, 0x44, 0x10, 0x2b])
head = bytearray(b'AC1032' + b'\0' * 122)
table_at = len(head)
png_at = table_at + 16 + 4 + 1 + 9
struct.pack_into('<I', head, 0x0d, table_at)
table = sentinel + struct.pack('<IB', 1 + 9 + len(logo), 1) + struct.pack('<BII', 6, png_at, len(logo))
open(os.path.join(OUT, 'preview-only.dwg'), 'wb').write(bytes(head) + table + logo)

print('samples/drawings:', ', '.join(sorted(os.listdir(OUT))))


# ----------------------------------------------------------------------------- STEP and IFC (small, hand-written)

def step_box():
    """A 20×10×5 mm box as an advanced B-rep (STEP AP214)."""
    P = [(0, 0, 0), (20, 0, 0), (20, 10, 0), (0, 10, 0), (0, 0, 5), (20, 0, 5), (20, 10, 5), (0, 10, 5)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    L, n = [], [0]
    def e(text):
        n[0] += 1
        L.append(f'#{n[0]}={text};')
        return n[0]
    # Advanced B-rep (as CAD programs export): vertices, straight edges, planar faces.
    def pt(p):
        return e(f"CARTESIAN_POINT('',({p[0]:.1f},{p[1]:.1f},{p[2]:.1f}))")
    def direction(d):
        return e(f"DIRECTION('',({d[0]:.1f},{d[1]:.1f},{d[2]:.1f}))")
    verts = [e(f"VERTEX_POINT('',#{pt(p)})") for p in P]
    edges = {}
    def edge(a, b):
        if (a, b) in edges:
            return edges[(a, b)], '.T.'
        if (b, a) in edges:
            return edges[(b, a)], '.F.'
        d = [P[b][k] - P[a][k] for k in range(3)]
        ln = math.sqrt(sum(c * c for c in d))
        line = e(f"LINE('',#{pt(P[a])},#{e(f'VECTOR({chr(39)}{chr(39)},#{direction([c / ln for c in d])},{ln:.1f})')})")
        edges[(a, b)] = e(f"EDGE_CURVE('',#{verts[a]},#{verts[b]},#{line},.T.)")
        return edges[(a, b)], '.T.'
    face_ids = []
    for f in faces:
        oes = []
        for k in range(4):
            ec, sense = edge(f[k], f[(k + 1) % 4])
            oes.append(e(f"ORIENTED_EDGE('',*,*,#{ec},{sense})"))
        loop = e("EDGE_LOOP('',(" + ','.join(f'#{o}' for o in oes) + '))')
        bound = e(f"FACE_OUTER_BOUND('',#{loop},.T.)")
        a, b, c = (P[f[0]], P[f[1]], P[f[2]])
        u = [b[k] - a[k] for k in range(3)]; v = [c[k] - b[k] for k in range(3)]
        nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        nl = math.sqrt(sum(x * x for x in nrm))
        ul = math.sqrt(sum(x * x for x in u))
        plane = e(f"PLANE('',#{e(f'AXIS2_PLACEMENT_3D({chr(39)}{chr(39)},#{pt(a)},#{direction([x / nl for x in nrm])},#{direction([x / ul for x in u])})')})")
        face_ids.append(e(f"ADVANCED_FACE('',(#{bound}),#{plane},.T.)"))
    shell = e('CLOSED_SHELL(\'\',(' + ','.join(f'#{i}' for i in face_ids) + '))')
    brep = e(f"MANIFOLD_SOLID_BREP('box',#{shell})")
    origin = e("CARTESIAN_POINT('',(0.,0.,0.))")
    axis = e(f"AXIS2_PLACEMENT_3D('',#{origin},$,$)")
    mm = e('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )')
    rad = e('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )')
    sr = e('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )')
    unc = e(f"UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#{mm},'distance_accuracy_value','')")
    ctx = e(f"( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#{unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#{mm},#{rad},#{sr})) REPRESENTATION_CONTEXT('','') )")
    rep = e(f"ADVANCED_BREP_SHAPE_REPRESENTATION('',(#{axis},#{brep}),#{ctx})")
    # Product structure: how STEP readers find the shape (product → definition → shape → representation).
    app = e("APPLICATION_CONTEXT('automotive_design')")
    e(f"APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#{app})")
    pctx = e(f"PRODUCT_CONTEXT('',#{app},'mechanical')")
    prod = e(f"PRODUCT('box','Sample box','',(#{pctx}))")
    form = e(f"PRODUCT_DEFINITION_FORMATION('','',#{prod})")
    dctx = e(f"PRODUCT_DEFINITION_CONTEXT('part definition',#{app},'design')")
    pdef = e(f"PRODUCT_DEFINITION('design','',#{form},#{dctx})")
    pds = e(f"PRODUCT_DEFINITION_SHAPE('','',#{pdef})")
    e(f"SHAPE_DEFINITION_REPRESENTATION(#{pds},#{rep})")
    head = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('FormatReader sample box'),'2;1');\nFILE_NAME('box.step','2026-11-18T00:00:00',(''),(''),'FormatReader samples','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n"
    return head + '\n'.join(L) + '\nENDSEC;\nEND-ISO-10303-21;\n'


open(os.path.join(OUT, 'box.step'), 'w').write(step_box())

IFC = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('wall.ifc','2026-11-18T00:00:00',(''),(''),'FormatReader samples','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCDIRECTION((0.,0.,1.));
#3=IFCDIRECTION((1.,0.,0.));
#4=IFCAXIS2PLACEMENT3D(#1,#2,#3);
#5=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#4,$);
#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#7=IFCUNITASSIGNMENT((#6));
#8=IFCOWNERHISTORY($,$,$,.NOCHANGE.,$,$,$,0);
#9=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'FormatReader sample',$,$,$,$,(#5),#7);
#10=IFCLOCALPLACEMENT($,#4);
#11=IFCSITE('1YvctVUKr0kugbFTf53O9L',$,'Site',$,$,#10,$,$,.ELEMENT.,$,$,$,$,$);
#12=IFCBUILDING('2YvctVUKr0kugbFTf53O9L',$,'Substation building',$,$,#10,$,$,.ELEMENT.,$,$,$);
#13=IFCBUILDINGSTOREY('3YvctVUKr0kugbFTf53O9L',$,'Ground floor',$,$,#10,$,$,.ELEMENT.,0.);
#20=IFCCARTESIANPOINT((0.,0.));
#21=IFCAXIS2PLACEMENT2D(#20,$);
#22=IFCRECTANGLEPROFILEDEF(.AREA.,'Wall',#21,6.,0.3);
#23=IFCEXTRUDEDAREASOLID(#22,#4,#2,3.);
#24=IFCSHAPEREPRESENTATION(#5,'Body','SweptSolid',(#23));
#25=IFCPRODUCTDEFINITIONSHAPE($,$,(#24));
#26=IFCWALL('4YvctVUKr0kugbFTf53O9L',$,'Wall',$,$,#10,#25,$,.STANDARD.);
#27=IFCCARTESIANPOINT((0.,2.,0.));
#28=IFCAXIS2PLACEMENT3D(#27,#2,#3);
#29=IFCLOCALPLACEMENT($,#28);
#30=IFCRECTANGLEPROFILEDEF(.AREA.,'Slab',#21,6.,4.);
#31=IFCEXTRUDEDAREASOLID(#30,#4,#2,0.25);
#32=IFCSHAPEREPRESENTATION(#5,'Body','SweptSolid',(#31));
#33=IFCPRODUCTDEFINITIONSHAPE($,$,(#32));
#34=IFCSLAB('5YvctVUKr0kugbFTf53O9L',$,'Floor slab',$,$,#29,#33,$,.FLOOR.);
#40=IFCRELAGGREGATES('6YvctVUKr0kugbFTf53O9L',$,$,$,#9,(#11));
#41=IFCRELAGGREGATES('7YvctVUKr0kugbFTf53O9L',$,$,$,#11,(#12));
#42=IFCRELAGGREGATES('8YvctVUKr0kugbFTf53O9L',$,$,$,#12,(#13));
#43=IFCRELCONTAINEDINSPATIALSTRUCTURE('9YvctVUKr0kugbFTf53O9L',$,$,$,(#26,#34),#13);
ENDSEC;
END-ISO-10303-21;
"""
open(os.path.join(OUT, 'substation.ifc'), 'w').write(IFC)
print('also made box.step, substation.ifc')
