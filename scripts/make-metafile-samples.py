"""Writes samples/images/turbine-diagram.emf and .wmf: a small vector drawing (ground,
tower, nacelle, three blades, a label) encoded by hand in each format's records."""
import os, struct

out = os.path.join(os.path.dirname(__file__), '..', 'samples', 'images')

# ---------------------------------------------------------------- WMF (placeable)
recs = []
def rec(fn, *words, raw=b''):
    body = struct.pack(f'<{len(words)}H', *[w & 0xFFFF for w in words]) + raw
    recs.append(struct.pack('<IH', 3 + len(body) // 2, fn) + body)
W, H = 400, 300
rec(0x020B, 0, 0)                 # SetWindowOrg(y, x)
rec(0x020C, H, W)                 # SetWindowExt(y, x)
rec(0x02FC, 0, 0x8c50, 0x0050, 0)        # CreateBrushIndirect: style, COLORREF 0x00BBGGRR as 2 words, hatch
rec(0x012D, 0)                    # SelectObject 0
rec(0x041B, H, W, 230, 0)         # Rectangle(bottom, right, top, left)
rec(0x02FA, 0, 2, 0, 0x2020, 0x0020)     # CreatePenIndirect: solid, width 2, colour dark
rec(0x012D, 1)
rec(0x02FC, 0, 0xF0EE, 0x00F2, 0)        # light grey brush
rec(0x012D, 2)
rec(0x0324, 4, 194, 230, 206, 230, 203, 90, 197, 90)   # Polygon tower: n, then x,y pairs
rec(0x041B, 98, 222, 80, 186)     # Rectangle nacelle
rec(0x0418, 95, 186, 79, 170)     # Ellipse hub (bottom,right,top,left)
for pts in [(178, 87, 120, 20, 128, 18), (178, 87, 110, 130, 116, 136), (178, 87, 250, 112, 248, 120)]:
    rec(0x0324, 3, *pts)
rec(0x02FB, 16, 0, 0, 0, 400, 0, 0, 0, 0, raw=b'Arial'.ljust(32, b'\0'))  # CreateFontIndirect, 16 units high
rec(0x012D, 3)
text = b'Turbine T-07'
rec(0x0521, len(text), raw=text + struct.pack('<hh', 270, 20))    # TextOut: count, string, y, x
rec(0x0000)                       # EOF
body = b''.join(recs)
maxrec = max(len(r) // 2 for r in recs)
hdr = struct.pack('<HHHIHIH', 1, 9, 0x300, (18 + len(body)) // 2, 4, maxrec, 0)
placeable = struct.pack('<IHhhhhHI', 0x9AC6CDD7, 0, 0, 0, W, H, 96, 0)
chk = 0
for i in range(0, 20, 2): chk ^= struct.unpack('<H', placeable[i:i + 2])[0]
placeable += struct.pack('<H', chk)
open(os.path.join(out, 'turbine-diagram.wmf'), 'wb').write(placeable + hdr + body)

# ---------------------------------------------------------------- EMF
recs = []
def emr(t, payload):
    recs.append(struct.pack('<II', t, 8 + len(payload)) + payload)
emr(39, struct.pack('<IIIi', 1, 0, 0x00508c50, 0))          # CREATEBRUSHINDIRECT ih=1 green
emr(37, struct.pack('<I', 1))                                 # SELECTOBJECT
emr(43, struct.pack('<4i', 0, 230, W, H))                     # RECTANGLE ground
emr(38, struct.pack('<IIiiI', 2, 0, 2, 0, 0x00202020))       # CREATEPEN ih=2
emr(37, struct.pack('<I', 2))
emr(39, struct.pack('<IIIi', 3, 0, 0x00f2f0ee, 0))           # white brush
emr(37, struct.pack('<I', 3))
def poly16(pts):
    xs, ys = pts[0::2], pts[1::2]
    emr(86, struct.pack('<4iI', min(xs), min(ys), max(xs), max(ys), len(xs)) + struct.pack(f'<{len(pts)}h', *pts))
poly16([194, 230, 206, 230, 203, 90, 197, 90])
emr(43, struct.pack('<4i', 186, 80, 222, 98))
emr(42, struct.pack('<4i', 170, 79, 186, 95))                 # ELLIPSE hub
for pts in [[178, 87, 120, 20, 128, 18], [178, 87, 110, 130, 116, 136], [178, 87, 250, 112, 248, 120]]:
    poly16(pts)
emr(14, struct.pack('<III', 0, 16, 20))                       # EOF
body = b''.join(recs)
desc = 'FormatReader sample\0\0'.encode('utf-16le')
desc += b'\0' * (-len(desc) % 4)  # records (and the header) are multiples of 4 bytes
hsize = 108
header = struct.pack('<II4i4iIIIIHHIII2i2iIII2i', 1, hsize + len(desc),
                     0, 0, W, H,                               # bounds (pixels)
                     0, 0, W * 2646 // 100, H * 2646 // 100,   # frame in 0.01 mm at 96 dpi
                     0x464D4520, 0x10000, hsize + len(desc) + len(body), len(recs) + 1, 4, 0,
                     len(desc) // 2, hsize, 0,
                     1024, 768, 270, 203,                      # device px, device mm
                     0, 0, 0, 270000, 203000)
header = header[:hsize]
open(os.path.join(out, 'turbine-diagram.emf'), 'wb').write(header + desc + body)
print('wrote EMF and WMF samples')
