"""Writes samples/drawings/site-plan.dwf (DWF V6: header + ZIP with a manifest naming two
sheets, each with a preview picture) and site-plan.dwfx (DWFx is an XPS package: a copy of
the XPS sample under the DWFx name, which is how the format is built)."""
import os, shutil, struct, zipfile, zlib, io
out = os.path.join(os.path.dirname(__file__), '..', 'samples', 'drawings')

def png(w, h, color, stripe):
    raw = b''.join(b'\0' + b''.join(bytes(stripe if (x // 12 + y // 12) % 2 else color) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

manifest = '''<?xml version="1.0" encoding="UTF-8"?>
<dwf:Manifest xmlns:dwf="DWF-Manifest:6.0" version="6.0" objectId="m1">
  <dwf:Sections>
    <dwf:Section type="com.autodesk.dwf.ePlot" title="A-101 Site Plan" objectId="s1" version="1.0" name="com.autodesk.dwf.ePlot_1"/>
    <dwf:Section type="com.autodesk.dwf.ePlot" title="A-102 Foundation" objectId="s2" version="1.0" name="com.autodesk.dwf.ePlot_2"/>
  </dwf:Sections>
</dwf:Manifest>'''
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.xml', manifest)
    z.writestr('com.autodesk.dwf.ePlot_1/thumbnail.png', png(40, 30, (230, 236, 242), (200, 210, 220)))
    z.writestr('com.autodesk.dwf.ePlot_1/preview.png', png(240, 170, (240, 244, 248), (60, 110, 190)))
    z.writestr('com.autodesk.dwf.ePlot_2/preview.png', png(240, 170, (246, 242, 236), (200, 140, 60)))
    z.writestr('com.autodesk.dwf.ePlot_1/graphics.w2d', b'(W2D V06.00)' + bytes(64))
open(os.path.join(out, 'site-plan.dwf'), 'wb').write(b'(DWF V06.00)' + buf.getvalue())
src = os.path.join(os.path.dirname(__file__), '..', 'samples')
xps = next(os.path.join(d, f) for d, _, fs in os.walk(src) for f in fs if f == 'wind-report.xps')
shutil.copy(xps, os.path.join(out, 'site-plan.dwfx'))
print('wrote DWF + DWFx samples')
