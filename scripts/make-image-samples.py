#!/usr/bin/env python3
"""Make the HDR / TGA / DICOM samples in samples/images (generated here, no third-party content).

    python3 scripts/make-image-samples.py
"""
import math
import os
import struct

OUT = os.path.join(os.path.dirname(__file__), '..', 'samples', 'images')
W, H = 192, 128


def sky(x, y):
    """Linear-light RGB: blue sky gradient, green ground, and a 'sun' (far brighter than white) top-left."""
    if y > H * 0.7:
        r, g, b = 0.05, 0.25, 0.05
    else:
        t = y / (H * 0.7)
        r, g, b = 0.15 + 0.4 * t, 0.3 + 0.4 * t, 0.9
    d = math.hypot(x - 30, y - 25)
    if d < 12:
        r = g = b = 40.0  # HDR: 40× brighter than "white"
    elif d < 20:
        k = 4.0 * (20 - d) / 8
        r, g, b = r + k, g + k * 0.9, b + k * 0.6
    return r, g, b


# --------------------------------------------------------------------------- OpenEXR (scanline, uncompressed, half)
def attr(name, typ, data):
    return name.encode() + b'\0' + typ.encode() + b'\0' + struct.pack('<i', len(data)) + data


chlist = b''.join(c.encode() + b'\0' + struct.pack('<iB3xii', 1, 0, 1, 1) for c in 'BGR') + b'\0'
header = b'\x76\x2f\x31\x01' + struct.pack('<i', 2)
header += attr('channels', 'chlist', chlist)
header += attr('compression', 'compression', b'\0')
header += attr('dataWindow', 'box2i', struct.pack('<4i', 0, 0, W - 1, H - 1))
header += attr('displayWindow', 'box2i', struct.pack('<4i', 0, 0, W - 1, H - 1))
header += attr('lineOrder', 'lineOrder', b'\0')
header += attr('pixelAspectRatio', 'float', struct.pack('<f', 1))
header += attr('screenWindowCenter', 'v2f', struct.pack('<2f', 0, 0))
header += attr('screenWindowWidth', 'float', struct.pack('<f', 1))
header += b'\0'
blocks = []
for y in range(H):
    px = [sky(x, y) for x in range(W)]
    data = b''.join(struct.pack(f'<{W}e', *[p[c] for p in px]) for c in (2, 1, 0))  # B, G, R
    blocks.append(struct.pack('<ii', y, len(data)) + data)
offset = len(header) + 8 * H
table = b''
for blk in blocks:
    table += struct.pack('<Q', offset)
    offset += len(blk)
open(os.path.join(OUT, 'sky.exr'), 'wb').write(header + table + b''.join(blocks))


# --------------------------------------------------------------------------- Radiance HDR (RGBE, flat scanlines)
def rgbe(r, g, b):
    m = max(r, g, b)
    if m < 1e-32:
        return bytes(4)
    e = math.frexp(m)[1]
    s = 256.0 / 2 ** e
    return bytes([int(r * s), int(g * s), int(b * s), e + 128])


hdr = f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {H} +X {W}\n'.encode()
hdr += b''.join(rgbe(*sky(x, y)) for y in range(H) for x in range(W))
open(os.path.join(OUT, 'sky.hdr'), 'wb').write(hdr)


# --------------------------------------------------------------------------- TGA (24-bit, uncompressed, top-left origin)
tga = struct.pack('<BBBHHBHHHHBB', 0, 0, 2, 0, 0, 0, 0, 0, 96, 64, 24, 0x20)
for y in range(64):
    for x in range(96):
        r, g, b = (230, 60, 60) if x < 32 else (60, 180, 60) if x < 64 else (60, 90, 230)
        if y < 16:
            r, g, b = 255, 255, 255  # white band on top: shows the picture is the right way up
        tga += bytes([b, g, r])
open(os.path.join(OUT, 'pattern.tga'), 'wb').write(tga)


# --------------------------------------------------------------------------- DICOM (synthetic CT slice)
R = C = 128


def hu(x, y):
    """Hounsfield units: air outside, soft-tissue body, two lungs, a spine."""
    cx, cy = (x - 64) / 52, (y - 64) / 40
    if cx * cx + cy * cy > 1:
        return -1000
    if ((x - 42) / 16) ** 2 + ((y - 60) / 22) ** 2 < 1 or ((x - 86) / 16) ** 2 + ((y - 60) / 22) ** 2 < 1:
        return -800
    if math.hypot(x - 64, y - 92) < 8:
        return 700
    return 40


pixels = [hu(x, y) + 1024 for y in range(R) for x in range(C)]  # stored = HU − intercept (−1024)


def el(group, elem, vr, value):
    if isinstance(value, str):
        value = value.encode()
        if len(value) % 2:
            value += b'\0' if vr == 'UI' else b' '
    if vr in ('OB', 'OW', 'UN', 'SQ', 'UT'):
        return struct.pack('<HH2s2xI', group, elem, vr.encode(), len(value)) + value
    return struct.pack('<HH2sH', group, elem, vr.encode(), len(value)) + value


def dicom(syntax, pixel_element):
    meta = el(0x0002, 0x0001, 'OB', b'\0\1') + el(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2') + el(0x0002, 0x0003, 'UI', '1.2.826.0.1.3680043.10.1418.1')
    meta += el(0x0002, 0x0010, 'UI', syntax) + el(0x0002, 0x0012, 'UI', '1.2.826.0.1.3680043.10.1418')
    ds = b''.join([
        el(0x0008, 0x0020, 'DA', '20261118'), el(0x0008, 0x0060, 'CS', 'CT'), el(0x0008, 0x0070, 'LO', 'FormatReader'),
        el(0x0008, 0x1030, 'LO', 'Synthetic chest phantom'), el(0x0010, 0x0010, 'PN', 'Sample^Phantom'),
        el(0x0018, 0x0015, 'CS', 'CHEST'),
        el(0x0028, 0x0002, 'US', struct.pack('<H', 1)), el(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
        el(0x0028, 0x0010, 'US', struct.pack('<H', R)), el(0x0028, 0x0011, 'US', struct.pack('<H', C)),
        el(0x0028, 0x0100, 'US', struct.pack('<H', 16)), el(0x0028, 0x0101, 'US', struct.pack('<H', 12)),
        el(0x0028, 0x0102, 'US', struct.pack('<H', 11)), el(0x0028, 0x0103, 'US', struct.pack('<H', 0)),
        el(0x0028, 0x1050, 'DS', '-300'), el(0x0028, 0x1051, 'DS', '1600'),
        el(0x0028, 0x1052, 'DS', '-1024'), el(0x0028, 0x1053, 'DS', '1'),
    ])
    group_len = el(0x0002, 0x0000, 'UL', struct.pack('<I', len(meta)))
    return bytes(128) + b'DICM' + group_len + meta + ds + pixel_element


raw = struct.pack(f'<{R * C}H', *pixels)
open(os.path.join(OUT, 'ct-phantom.dcm'), 'wb').write(dicom('1.2.840.10008.1.2.1', el(0x7FE0, 0x0010, 'OW', raw)))


def packbits(data):
    out = bytearray()
    for i in range(0, len(data), 128):
        chunk = data[i:i + 128]
        out.append(len(chunk) - 1)
        out += chunk
    return bytes(out)


high = bytes(p >> 8 for p in pixels)
low = bytes(p & 0xFF for p in pixels)
seg1, seg2 = packbits(high), packbits(low)
if len(seg1) % 2:
    seg1 += b'\0'
frame = struct.pack('<16I', 2, 64, 64 + len(seg1), *([0] * 13)) + seg1 + seg2
if len(frame) % 2:
    frame += b'\0'
encapsulated = struct.pack('<HH2s2xI', 0x7FE0, 0x0010, b'OB', 0xFFFFFFFF)
encapsulated += struct.pack('<HHI', 0xFFFE, 0xE000, 0)  # empty basic offset table
encapsulated += struct.pack('<HHI', 0xFFFE, 0xE000, len(frame)) + frame
encapsulated += struct.pack('<HHI', 0xFFFE, 0xE0DD, 0)
open(os.path.join(OUT, 'ct-phantom-rle.dcm'), 'wb').write(dicom('1.2.840.10008.1.2.5', encapsulated))

print('made sky.exr, sky.hdr, pattern.tga, ct-phantom.dcm, ct-phantom-rle.dcm')
