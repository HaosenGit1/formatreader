"""Writes samples/maps/: one small (fictional) wind-farm site in every map format —
KML, KMZ, GPX, GeoJSON and a Shapefile set (.shp + .dbf in GBK + .prj + .cpg) — with
Chinese and English names, so the map viewer and its attribute table can be tested."""
import json, math, os, struct, zipfile

root = os.path.join(os.path.dirname(__file__), '..', 'samples', 'maps')
os.makedirs(os.path.join(root, 'shapefile'), exist_ok=True)

# Fictional site in Illinois: 3 × 4 grid of turbines, 450 m apart.
lat0, lon0 = 40.48, -89.05
dlat = 450 / 111320
dlon = 450 / (111320 * math.cos(math.radians(lat0)))
turbines = []
for r in range(3):
    for c in range(4):
        n = r * 4 + c + 1
        turbines.append({'id': f'T-{n:02d}', 'name': f'风机 T-{n:02d}', 'lat': lat0 + r * dlat, 'lon': lon0 + c * dlon, 'model': 'GW 155-4.5', 'hub': 100 if n % 2 else 120})
boundary = [(lon0 - dlon / 2, lat0 - dlat / 2), (lon0 + 3.5 * dlon, lat0 - dlat / 2), (lon0 + 3.5 * dlon, lat0 + 2.5 * dlat), (lon0 - dlon / 2, lat0 + 2.5 * dlat), (lon0 - dlon / 2, lat0 - dlat / 2)]
substation = (lon0 + 4.2 * dlon, lat0 + 1 * dlat)
cable = [(t['lon'], t['lat']) for t in turbines[4:8]] + [substation]

# ---- KML
def coords(pts):
    return ' '.join(f'{x:.7f},{y:.7f},0' for x, y in pts)

placemarks = []
for t in turbines:
    placemarks.append(f"""      <Placemark><name>{t['name']}</name><ExtendedData><Data name="ID"><value>{t['id']}</value></Data><Data name="Model"><value>{t['model']}</value></Data><Data name="Hub height (m)"><value>{t['hub']}</value></Data></ExtendedData><Point><coordinates>{t['lon']:.7f},{t['lat']:.7f},0</coordinates></Point></Placemark>""")
kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Prairie Wind 风电场 (sample)</name>
    <Folder><name>Turbines 风机</name>
{chr(10).join(placemarks)}
    </Folder>
    <Folder><name>Site</name>
      <Placemark><name>Site boundary 场址边界</name><description><![CDATA[Lease area<br/>Fictional sample]]></description><Polygon><outerBoundaryIs><LinearRing><coordinates>{coords(boundary)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      <Placemark><name>Collector cable 集电线路 2</name><LineString><coordinates>{coords(cable)}</coordinates></LineString></Placemark>
      <Placemark><name>Substation 升压站</name><Point><coordinates>{substation[0]:.7f},{substation[1]:.7f},0</coordinates></Point></Placemark>
    </Folder>
  </Document>
</kml>
"""
open(os.path.join(root, 'wind-farm.kml'), 'w', encoding='utf-8').write(kml)
with zipfile.ZipFile(os.path.join(root, 'wind-farm.kmz'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('doc.kml', kml)

# ---- GPX: a site-survey drive along the turbine rows, with two waypoints.
track = []
for i, t in enumerate(turbines):
    track.append(f'      <trkpt lat="{t["lat"]:.7f}" lon="{t["lon"]:.7f}"><ele>{220 + i}</ele><time>2026-10-02T09:{i * 4:02d}:00Z</time></trkpt>')
gpx = f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FormatReader sample" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Site survey 现场踏勘</name></metadata>
  <wpt lat="{substation[1]:.7f}" lon="{substation[0]:.7f}"><name>Substation gate</name><ele>221</ele></wpt>
  <wpt lat="{turbines[0]['lat']:.7f}" lon="{turbines[0]['lon']:.7f}"><name>Met mast 测风塔</name><desc>80 m mast</desc></wpt>
  <trk><name>Survey drive</name><trkseg>
{chr(10).join(track)}
  </trkseg></trk>
</gpx>
"""
open(os.path.join(root, 'site-survey.gpx'), 'w', encoding='utf-8').write(gpx)

# ---- GeoJSON
features = [{'type': 'Feature', 'properties': {'name': t['name'], 'id': t['id'], 'model': t['model'], 'hub_m': t['hub']}, 'geometry': {'type': 'Point', 'coordinates': [round(t['lon'], 7), round(t['lat'], 7)]}} for t in turbines]
features.append({'type': 'Feature', 'properties': {'name': 'Site boundary'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[round(x, 7), round(y, 7)] for x, y in boundary]]}})
json.dump({'type': 'FeatureCollection', 'name': 'turbines', 'features': features}, open(os.path.join(root, 'turbines.geojson'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---- Shapefile (points, WGS 84), attributes in GBK with a .cpg saying so.
def shp_files(path_no_ext, pts):
    n = len(pts)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    rec = 8 + 20
    def header(length_words):
        return struct.pack('>7i', 9994, 0, 0, 0, 0, 0, length_words) + struct.pack('<2i', 1000, 1) + struct.pack('<8d', *bbox, 0, 0, 0, 0)
    body = b''.join(struct.pack('>2i', i + 1, 10) + struct.pack('<i2d', 1, x, y) for i, (x, y) in enumerate(pts))
    open(path_no_ext + '.shp', 'wb').write(header((100 + len(body)) // 2) + body)
    idx = b''.join(struct.pack('>2i', (100 + i * rec) // 2, 10) for i in range(n))
    open(path_no_ext + '.shx', 'wb').write(header((100 + len(idx)) // 2) + idx)

def dbf(path, fields, rows, enc):
    hlen = 32 + 32 * len(fields) + 1
    rlen = 1 + sum(f[2] for f in fields)
    out = bytearray(struct.pack('<BBBBIHH20x', 3, 126, 11, 19, len(rows), hlen, rlen))
    out[29] = 0x4D  # language driver: GBK
    for name, typ, size in fields:
        out += name.encode('ascii').ljust(11, b'\0') + typ.encode() + b'\0' * 4 + bytes([size, 0]) + b'\0' * 14
    out += b'\r'
    for r in rows:
        out += b' '
        for (name, typ, size), v in zip(fields, r):
            b = str(v).encode(enc)[:size]
            out += b.rjust(size) if typ == 'N' else b.ljust(size)
    out += b'\x1a'
    open(path, 'wb').write(out)

base = os.path.join(root, 'shapefile', 'turbines')
shp_files(base, [(t['lon'], t['lat']) for t in turbines])
dbf(base + '.dbf', [('ID', 'C', 8), ('NAME', 'C', 20), ('MODEL', 'C', 16), ('HUB_M', 'N', 5)], [(t['id'], t['name'], t['model'], t['hub']) for t in turbines], 'gbk')
open(base + '.cpg', 'w').write('GBK')
open(base + '.prj', 'w').write('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')
# The .shp alone (as if dropped by itself) sits next to the samples.
import shutil
shutil.copy(base + '.shp', os.path.join(root, 'turbines.shp'))
with zipfile.ZipFile(os.path.join(root, 'shapefile', 'turbines-shapefile.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    for ext in ('shp', 'shx', 'dbf', 'prj', 'cpg'):
        z.write(f'{base}.{ext}', f'turbines/turbines.{ext}')
print('wrote', os.path.normpath(root))
