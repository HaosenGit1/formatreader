#!/usr/bin/env python3
"""Animation samples in samples/animations:
- turbine.json   Lottie: three turbine blades turning (2 s, 30 fps), written by hand
- turbine.lottie the same as a dotLottie package (zip with manifest.json)
- turbine.tgs    the same as a Telegram sticker (gzip of the Lottie JSON)
- sky.swf        a minimal Flash file: blue background, a white square, 2 frames
"""
import gzip, json, os, struct, zipfile

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'samples', 'animations')
os.makedirs(OUT, exist_ok=True)

def blade(angle):
    return {"ty": "gr", "it": [
        {"ty": "rc", "d": 1, "s": {"a": 0, "k": [14, 80]}, "p": {"a": 0, "k": [0, -40]}, "r": {"a": 0, "k": 7}},
        {"ty": "fl", "c": {"a": 0, "k": [0.18, 0.36, 0.92, 1]}, "o": {"a": 0, "k": 100}},
        {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": angle}, "o": {"a": 0, "k": 100}},
    ]}

anim = {"v": "5.7.4", "fr": 30, "ip": 0, "op": 60, "w": 200, "h": 200, "nm": "turbine", "ddd": 0, "assets": [], "layers": [
    {"ddd": 0, "ind": 1, "ty": 4, "nm": "rotor", "sr": 1, "ao": 0, "ip": 0, "op": 60, "st": 0, "bm": 0,
     "ks": {"o": {"a": 0, "k": 100}, "p": {"a": 0, "k": [100, 100, 0]}, "a": {"a": 0, "k": [0, 0, 0]}, "s": {"a": 0, "k": [100, 100, 100]},
            "r": {"a": 1, "k": [{"t": 0, "s": [0], "i": {"x": [1], "y": [1]}, "o": {"x": [0], "y": [0]}}, {"t": 60, "s": [120]}]}},
     "shapes": [blade(0), blade(120), blade(240)]},
]}
text = json.dumps(anim, separators=(',', ':'))
open(os.path.join(OUT, 'turbine.json'), 'w').write(text)
with zipfile.ZipFile(os.path.join(OUT, 'turbine.lottie'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json', json.dumps({"version": "1", "generator": "FormatReader sample", "animations": [{"id": "turbine"}]}))
    z.writestr('animations/turbine.json', text)
open(os.path.join(OUT, 'turbine.tgs'), 'wb').write(gzip.compress(text.encode(), mtime=0))

# --- SWF: bits are packed most-significant first.
class Bits:
    def __init__(self): self.v, self.n = 0, 0
    def put(self, value, bits):
        self.v = (self.v << bits) | (value & ((1 << bits) - 1)); self.n += bits
    def bytes(self):
        pad = (-self.n) % 8
        return (self.v << pad).to_bytes((self.n + pad) // 8, 'big')

def rect(x0, x1, y0, y1):
    b = Bits(); nb = 15; b.put(nb, 5)
    for v in (x0, x1, y0, y1): b.put(v, nb)
    return b.bytes()

def tag(code, body):
    return struct.pack('<H', (code << 6) | 0x3F) + struct.pack('<I', len(body)) + body if len(body) >= 0x3F else struct.pack('<H', (code << 6) | len(body)) + body

tw = 20  # twips per pixel
square = rect(0, 100 * tw, 0, 100 * tw)
# DefineShape: id 1, bounds, one solid white fill, a square drawn with straight edges.
shape = Bits()
shape.put(0, 1); shape.put(0, 1); shape.put(0, 1); shape.put(1, 1); shape.put(1, 1)  # StyleChangeRecord: moveTo + fill0
shape.put(15, 5); shape.put(0, 15); shape.put(0, 15)                                 # move to 0,0
shape.put(1, 1)                                                                      # fill style 1 (FillBits=1)
for dx, dy in ((100, 0), (0, 100), (-100, 0), (0, -100)):
    shape.put(1, 1); shape.put(1, 1); shape.put(13, 4)                                # straight edge, 15-bit deltas
    if dx and dy: shape.put(1, 1)
    else: shape.put(0, 1); shape.put(0 if dx else 1, 1)
    shape.put((dx or dy) * tw, 15)
shape.put(0, 6)                                                                       # end
body = struct.pack('<H', 1) + square + bytes([1, 0x00, 255, 255, 255]) + bytes([0]) + bytes([0x10]) + shape.bytes()
place = struct.pack('<H', 1) + struct.pack('<H', 1)  # PlaceObject2 below
tags = tag(9, bytes([30, 90, 200]))                    # SetBackgroundColor
tags += tag(2, body)                                   # DefineShape
po = Bits(); po.put(1, 1); po.put(0, 6); po.put(1, 1); po.put(0, 1); po.put(0, 1); po.put(0, 1); po.put(1, 1)  # translate
m = Bits(); m.put(0, 1); m.put(0, 1); m.put(13, 5); m.put(50 * tw, 13); m.put(50 * tw, 13)
tags += tag(26, bytes([0x06]) + struct.pack('<H', 1) + struct.pack('<H', 1) + m.bytes())  # PlaceObject2: char 1, depth 1, matrix
tags += tag(1, b'') + tag(1, b'') + tag(0, b'')
header = rect(0, 200 * tw, 0, 200 * tw) + struct.pack('<HH', 12 << 8, 2)
swf = b'FWS' + bytes([10]) + struct.pack('<I', 8 + len(header) + len(tags)) + header + tags
open(os.path.join(OUT, 'sky.swf'), 'wb').write(swf)
print('samples/animations: turbine.json turbine.lottie turbine.tgs sky.swf')
