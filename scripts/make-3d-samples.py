"""Writes samples/drawings/ 3D samples for the formats added with three.js loaders:
3DS, Collada (.dae), VRML (.wrl), AMF, USDZ (a ZIP holding .usda text), and point clouds
(PCD, XYZ with colours, LAS 1.2 with RGB). All are a small, simplified wind turbine
(tower, nacelle, three blades) or a scan of one — written here, no outside files."""
import math, os, random, struct, zipfile

out = os.path.join(os.path.dirname(__file__), '..', 'samples', 'drawings')
random.seed(7)

# ---- a simple turbine mesh (Z up): tower box, nacelle box, three flat blades
V, F = [], []
def box(x0, y0, z0, x1, y1, z1):
    b = len(V)
    V.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
    for a, c, d in [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]:
        F.append((b + a, b + c, b + d))
box(-1.5, -1.5, 0, 1.5, 1.5, 80)       # tower
box(-2.5, -6, 78, 2.5, 4, 84)          # nacelle
hub = (0, -6.5, 81)
for k in range(3):
    a = math.radians(90 + k * 120)
    tip = (hub[0] + 38 * math.cos(a), hub[1], hub[2] + 38 * math.sin(a))
    side = (hub[0] + 3 * math.cos(a + 1.2), hub[1], hub[2] + 3 * math.sin(a + 1.2))
    b = len(V)
    V.extend([hub, tip, side])
    F.append((b, b + 1, b + 2))
    F.append((b, b + 2, b + 1))

# ---- 3DS (binary chunks)
def chunk(cid, payload):
    return struct.pack('<HI', cid, 6 + len(payload)) + payload
verts = struct.pack('<H', len(V)) + b''.join(struct.pack('<3f', *v) for v in V)
faces = struct.pack('<H', len(F)) + b''.join(struct.pack('<4H', a, b, c, 0) for a, b, c in F)
mesh = chunk(0x4100, chunk(0x4110, verts) + chunk(0x4120, faces))
obj = chunk(0x4000, b'Turbine\0' + mesh)
open(os.path.join(out, 'turbine.3ds'), 'wb').write(chunk(0x4D4D, chunk(0x0002, struct.pack('<I', 3)) + chunk(0x3D3D, obj)))

# ---- Collada 1.4.1
pos = ' '.join(f'{x:g} {y:g} {z:g}' for x, y, z in V)
idx = ' '.join(f'{a} {b} {c}' for a, b, c in F)
open(os.path.join(out, 'turbine.dae'), 'w').write(f"""<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>
  <library_geometries><geometry id="turbine" name="turbine"><mesh>
    <source id="p"><float_array id="pa" count="{len(V) * 3}">{pos}</float_array>
      <technique_common><accessor source="#pa" count="{len(V)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
    <vertices id="v"><input semantic="POSITION" source="#p"/></vertices>
    <triangles count="{len(F)}"><input semantic="VERTEX" source="#v" offset="0"/><p>{idx}</p></triangles>
  </mesh></geometry></library_geometries>
  <library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#turbine"/></node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#s"/></scene>
</COLLADA>
""")

# ---- VRML 2.0
open(os.path.join(out, 'turbine.wrl'), 'w').write("#VRML V2.0 utf8\n# Simplified wind turbine (FormatReader sample)\nShape {\n  appearance Appearance { material Material { diffuseColor 0.85 0.88 0.92 } }\n  geometry IndexedFaceSet {\n    coord Coordinate { point [ " + ', '.join(f'{x:g} {z:g} {-y:g}' for x, y, z in V) + " ] }\n    coordIndex [ " + ', '.join(f'{a}, {b}, {c}, -1' for a, b, c in F) + " ]\n  }\n}\n")

# ---- AMF
amf_v = ''.join(f'<vertex><coordinates><x>{x:g}</x><y>{y:g}</y><z>{z:g}</z></coordinates></vertex>' for x, y, z in V)
amf_t = ''.join(f'<triangle><v1>{a}</v1><v2>{b}</v2><v3>{c}</v3></triangle>' for a, b, c in F)
open(os.path.join(out, 'turbine.amf'), 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<amf unit="meter"><object id="0"><mesh><vertices>{amf_v}</vertices><volume>{amf_t}</volume></mesh></object></amf>\n')

# ---- USDZ: a ZIP (stored, as the format requires) holding USDA text, Y up
usda = '#usda 1.0\n(\n    upAxis = "Y"\n)\n\ndef Xform "Turbine"\n{\n    def Mesh "Body"\n    {\n        int[] faceVertexCounts = [' + ', '.join('3' for _ in F) + ']\n        int[] faceVertexIndices = [' + ', '.join(f'{a}, {b}, {c}' for a, b, c in F) + ']\n        point3f[] points = [' + ', '.join(f'({x:g}, {z:g}, {-y:g})' for x, y, z in V) + ']\n    }\n}\n'
with zipfile.ZipFile(os.path.join(out, 'turbine.usdz'), 'w', zipfile.ZIP_STORED) as z:
    z.writestr('turbine.usda', usda)

# ---- point clouds: a tower scanned from the ground, over gently rolling terrain
pts = []
for _ in range(6000):
    x, y = random.uniform(-40, 40), random.uniform(-40, 40)
    z = 1.5 * math.sin(x / 12) * math.cos(y / 15) + random.gauss(0, 0.05)
    pts.append((x, y, z, (90, 120, 70)))
for _ in range(3000):
    a = random.uniform(0, 2 * math.pi)
    z = random.uniform(0, 80)
    r = 2.2 - z * 0.009
    pts.append((r * math.cos(a), r * math.sin(a), z, (225, 228, 232)))

pcd = ['# .PCD v0.7 - Point Cloud Data file format', 'VERSION 0.7', 'FIELDS x y z', 'SIZE 4 4 4', 'TYPE F F F', 'COUNT 1 1 1', f'WIDTH {len(pts)}', 'HEIGHT 1', 'VIEWPOINT 0 0 0 1 0 0 0', f'POINTS {len(pts)}', 'DATA ascii']
pcd += [f'{x:.3f} {y:.3f} {z:.3f}' for x, y, z, _ in pts]
open(os.path.join(out, 'turbine-scan.pcd'), 'w').write('\n'.join(pcd) + '\n')

# XYZ with colours, at map-like coordinates (UTM-style eastings/northings).
E0, N0 = 312450.0, 4482100.0
open(os.path.join(out, 'turbine-scan.xyz'), 'w').write(''.join(f'{E0 + x:.3f} {N0 + y:.3f} {220 + z:.3f} {c[0]} {c[1]} {c[2]}\n' for x, y, z, c in pts))

# LAS 1.2, point format 2 (with RGB), scale 0.001.
scale = 0.001
xs = [E0 + p[0] for p in pts]; ys = [N0 + p[1] for p in pts]; zs = [220 + p[2] for p in pts]
hdr = bytearray(227)
hdr[0:4] = b'LASF'
hdr[24], hdr[25] = 1, 2
hdr[26:58] = b'FormatReader sample'.ljust(32, b'\0')
hdr[58:90] = b'make-3d-samples.py'.ljust(32, b'\0')
struct.pack_into('<HIIBHI', hdr, 94, 227, 227, 0, 2, 26, len(pts))
struct.pack_into('<3d3d', hdr, 131, scale, scale, scale, E0, N0, 220.0)
struct.pack_into('<6d', hdr, 179, max(xs), min(xs), max(ys), min(ys), max(zs), min(zs))
body = b''.join(struct.pack('<3iHBBbBH3H', round((x - E0) / scale), round((y - N0) / scale), round((z - 220) / scale), 0, 0, 2, 0, 0, 0, c[0] * 257, c[1] * 257, c[2] * 257) for (x, y, z), c in zip(zip(xs, ys, zs), [p[3] for p in pts]))
open(os.path.join(out, 'turbine-scan.las'), 'wb').write(bytes(hdr) + body)
print('wrote 3D samples to', os.path.normpath(out))
