#!/usr/bin/env python3
"""Copy H.264 video + AAC audio from a fragmented MP4 (like Chrome's MediaRecorder output) into
an FLV file, without re-encoding. Used to make samples/videos/turbine-h264.flv:

    python3 scripts/mp4-to-flv.py samples/videos/turbine.mp4 samples/videos/turbine-h264.flv
"""
import struct
import sys

src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read()


def boxes(start, end):
    i = start
    while i + 8 <= end:
        size, typ = struct.unpack('>I4s', d[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack('>Q', d[i + 8:i + 16])[0]
            hdr = 16
        yield typ.decode('latin1'), i + hdr, i + size, i
        i += size


def find(start, end, path):
    for typ, b, e, _ in boxes(start, end):
        if typ == path[0]:
            return (b, e) if len(path) == 1 else find(b, e, path[1:])
    return None


def full(start, end, path):
    """Like find, but for boxes inside stsd entries (fixed headers to skip)."""
    return find(start, end, path)


tracks = {}
moov = find(0, len(d), ['moov'])
for typ, b, e, _ in boxes(*moov):
    if typ != 'trak':
        continue
    tkhd = find(b, e, ['tkhd'])
    version = d[tkhd[0]]
    track_id = struct.unpack('>I', d[tkhd[0] + (20 if version else 12):][:4])[0]
    mdhd = find(b, e, ['mdia', 'mdhd'])
    mv = d[mdhd[0]]
    timescale = struct.unpack('>I', d[mdhd[0] + (20 if mv else 12):][:4])[0]
    hdlr = find(b, e, ['mdia', 'hdlr'])
    handler = d[hdlr[0] + 8:hdlr[0] + 12].decode()
    stsd = find(b, e, ['mdia', 'minf', 'stbl', 'stsd'])
    entry = stsd[0] + 8  # version/flags + entry count
    esize, etype = struct.unpack('>I4s', d[entry:entry + 8])
    if handler == 'vide':
        avcc = find(entry + 8 + 78, entry + esize, ['avcC'])
        tracks[track_id] = {'kind': 'video', 'timescale': timescale, 'config': d[avcc[0]:avcc[1]], 'samples': []}
    elif handler == 'soun':
        esds = find(entry + 8 + 28, entry + esize, ['esds'])
        body = d[esds[0] + 4:esds[1]]
        # Walk the ES descriptor to DecoderSpecificInfo (tag 5) = AudioSpecificConfig.
        i = 0
        asc = b''
        while i < len(body):
            tag = body[i]; i += 1
            n = 0
            while True:
                c = body[i]; i += 1
                n = (n << 7) | (c & 0x7f)
                if not c & 0x80:
                    break
            if tag == 3:
                i += 3
            elif tag == 4:
                i += 13
            elif tag == 5:
                asc = body[i:i + n]
                break
            else:
                i += n
        tracks[track_id] = {'kind': 'audio', 'timescale': timescale, 'config': asc, 'samples': []}

# Fragments: each traf's trun lists sample sizes/durations; data follows in mdat.
for typ, b, e, start in boxes(0, len(d)):
    if typ != 'moof':
        continue
    for t2, tb, te, _ in boxes(b, e):
        if t2 != 'traf':
            continue
        tfhd = find(tb, te, ['tfhd'])
        flags = struct.unpack('>I', d[tfhd[0]:tfhd[0] + 4])[0] & 0xffffff
        track_id = struct.unpack('>I', d[tfhd[0] + 4:tfhd[0] + 8])[0]
        p = tfhd[0] + 8
        base = start
        if flags & 0x1:
            base = struct.unpack('>Q', d[p:p + 8])[0]; p += 8
        if flags & 0x2: p += 4
        default_dur = default_size = 0
        if flags & 0x8:
            default_dur = struct.unpack('>I', d[p:p + 4])[0]; p += 4
        if flags & 0x10:
            default_size = struct.unpack('>I', d[p:p + 4])[0]; p += 4
        tfdt = find(tb, te, ['tfdt'])
        t = struct.unpack('>Q' if d[tfdt[0]] else '>I', d[tfdt[0] + 4:tfdt[0] + (12 if d[tfdt[0]] else 8)])[0]
        trun = find(tb, te, ['trun'])
        tf = struct.unpack('>I', d[trun[0]:trun[0] + 4])[0] & 0xffffff
        count = struct.unpack('>I', d[trun[0] + 4:trun[0] + 8])[0]
        q = trun[0] + 8
        offset = 0
        if tf & 0x1:
            offset = struct.unpack('>i', d[q:q + 4])[0]; q += 4
        if tf & 0x4: q += 4
        pos = base + offset
        for _ in range(count):
            dur, size, sflags, cto = default_dur, default_size, 0, 0
            if tf & 0x100: dur = struct.unpack('>I', d[q:q + 4])[0]; q += 4
            if tf & 0x200: size = struct.unpack('>I', d[q:q + 4])[0]; q += 4
            if tf & 0x400: sflags = struct.unpack('>I', d[q:q + 4])[0]; q += 4
            if tf & 0x800: cto = struct.unpack('>i', d[q:q + 4])[0]; q += 4
            tr = tracks[track_id]
            key = not (sflags & 0x10000)
            tr['samples'].append((t, cto, d[pos:pos + size], key))
            pos += size
            t += dur


def tag(kind, ms, body):
    return struct.pack('>B', kind) + struct.pack('>I', len(body))[1:] + struct.pack('>I', ms & 0xffffff)[1:] + bytes([(ms >> 24) & 0xff]) + b'\0\0\0' + body + struct.pack('>I', 11 + len(body))


out = bytearray(b'FLV\x01\x05\0\0\0\x09' + b'\0\0\0\0')
events = []
for tr in tracks.values():
    ts = tr['timescale']
    if tr['kind'] == 'video':
        events.append((0, 0, tag(9, 0, bytes([0x17, 0, 0, 0, 0]) + tr['config'])))
        for t, cto, data, key in tr['samples']:
            ms = t * 1000 // ts
            body = bytes([0x17 if key else 0x27, 1]) + struct.pack('>i', cto * 1000 // ts)[1:] + data
            events.append((ms, 2, tag(9, ms, body)))
    else:
        events.append((0, 1, tag(8, 0, bytes([0xAF, 0]) + tr['config'])))
        for t, _cto, data, _key in tr['samples']:
            ms = t * 1000 // ts
            events.append((ms, 3, tag(8, ms, bytes([0xAF, 1]) + data)))
for _ms, _order, chunk in sorted(events, key=lambda x: (x[0], x[1])):
    out += chunk
open(dst, 'wb').write(out)
print(f'{dst}: {len(out)} bytes, ' + ', '.join(f"{tr['kind']} {len(tr['samples'])} samples" for tr in tracks.values()))
