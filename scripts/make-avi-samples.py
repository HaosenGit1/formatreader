#!/usr/bin/env python3
"""Make the AVI samples in samples/videos (needs Pillow):

    python3 scripts/make-avi-samples.py

- camera-mjpeg.avi      MJPEG frames + 16-bit PCM tone, with an idx1 index (old digital cameras)
- cctv-mjpeg-nodht.avi  MJPEG frames without Huffman tables ("AVI1" style, many webcams/CCTV),
                        8-bit mu-law sound, no index (must be found by scanning)
- turbine-h264.avi      the H.264 frames of turbine.mp4 copied into AVI (no re-encoding), IMA ADPCM tone
"""
import io
import math
import os
import struct

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'samples', 'videos')


def chunk(fcc, data):
    pad = b'\0' if len(data) % 2 else b''
    return fcc.encode() + struct.pack('<I', len(data)) + data + pad


def lst(kind, body):
    return b'LIST' + struct.pack('<I', len(body) + 4) + kind.encode() + body


def write_avi(path, w, h, fps, frames, handler, compression, audio=None, index=True):
    """frames: [(bytes, keyframe)]; audio: (WAVEFORMATEX bytes, [chunk bytes per frame], bytes_per_sec, block_align)."""
    n = len(frames)
    streams = 2 if audio else 1
    avih = struct.pack('<IIIIIIIIIIIIII', int(1e6 / fps), 0, 0, 0x10, n, 0, streams, 0, w, h, 0, 0, 0, 0)
    bih = struct.pack('<IiiHH4sIiiII', 40, w, h, 1, 24, compression.encode(), w * h * 3, 0, 0, 0, 0)
    strh_v = struct.pack('<4s4sIHHIIIIIIIIhhhh', b'vids', handler.encode(), 0, 0, 0, 0, 1, fps, 0, n, 0, 0xFFFFFFFF, 0, 0, 0, w, h)
    hdrl = chunk('avih', avih) + lst('strl', chunk('strh', strh_v) + chunk('strf', bih))
    if audio:
        fmt, achunks, bps, align = audio
        total = sum(len(c) for c in achunks)
        strh_a = struct.pack('<4s4sIHHIIIIIIIIhhhh', b'auds', b'\0\0\0\0', 0, 0, 0, 0, align, bps, 0, total // align, 0, 0xFFFFFFFF, align, 0, 0, 0, 0)
        hdrl += lst('strl', chunk('strh', strh_a) + chunk('strf', fmt))
    movi = b''
    idx = b''
    for i, (data, key) in enumerate(frames):
        off = len(movi) + 4  # relative to the 'movi' fourcc
        fcc = '00dc'
        movi += chunk(fcc, data)
        idx += struct.pack('<4sIII', fcc.encode(), 0x10 if key else 0, off, len(data))
        if audio and i < len(audio[1]):
            off = len(movi) + 4
            movi += chunk('01wb', audio[1][i])
            idx += struct.pack('<4sIII', b'01wb', 0x10, off, len(audio[1][i]))
    body = b'AVI ' + lst('hdrl', hdrl) + lst('movi', movi) + (chunk('idx1', idx) if index else b'')
    data = b'RIFF' + struct.pack('<I', len(body)) + body
    open(path, 'wb').write(data)
    print(f'{os.path.relpath(path)}: {len(data)} bytes, {n} frames')


def jpeg_frames(n, w, h, strip_dht=False):
    out = []
    for i in range(n):
        im = Image.new('RGB', (w, h), (127, 178, 240))
        d = ImageDraw.Draw(im)
        d.rectangle([0, h * 3 // 4, w, h], fill=(92, 158, 74))
        x = (i * 7) % w
        d.rectangle([x, h // 3, x + 24, h // 3 + 24], fill=(230, 80, 40))
        d.text((6, 6), f'frame {i + 1}', fill=(0, 0, 0))
        b = io.BytesIO()
        im.save(b, 'JPEG', quality=80, optimize=False)
        jpg = b.getvalue()
        if strip_dht:
            # Remove every DHT (FFC4) segment: decoders must supply the standard tables.
            res = bytearray(jpg[:2])
            p = 2
            while p < len(jpg):
                m = jpg[p + 1]
                if m == 0xDA:
                    res += jpg[p:]
                    break
                ln = struct.unpack('>H', jpg[p + 2:p + 4])[0]
                if m != 0xC4:
                    res += jpg[p:p + 2 + ln]
                p += 2 + ln
            jpg = bytes(res)
        out.append((jpg, True))
    return out


def tone(seconds, rate, freq=440):
    return [math.sin(2 * math.pi * freq * t / rate) * 0.3 for t in range(int(seconds * rate))]


def split(data, parts, align=1):
    per = (len(data) // parts) // align * align
    return [data[i * per:(i + 1) * per] if i < parts - 1 else data[i * per:] for i in range(parts)]


def mulaw(x):
    s = max(-32635, min(32635, int(x * 32767)))
    sign = 0x80 if s < 0 else 0
    s = abs(s) + 0x84
    exp = 7
    for e in range(7, -1, -1):
        if s & (0x4000 >> (7 - e)):
            exp = e
            break
    mant = (s >> (exp + 3)) & 0x0F
    return ~(sign | (exp << 4) | mant) & 0xFF


IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767]
IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8]


def ima_blocks(samples, block_align=256):
    """Mono IMA ADPCM (WAV format 0x11): 4-byte header + nibbles; (block_align-4)*2+1 samples per block."""
    per = (block_align - 4) * 2 + 1
    blocks = []
    pred, index = 0, 0
    for start in range(0, len(samples) - per + 1, per):
        s = [int(v * 32767) for v in samples[start:start + per]]
        pred = s[0]
        out = bytearray(struct.pack('<hBB', pred, index, 0))
        nibbles = []
        for v in s[1:]:
            step = IMA_STEP[index]
            diff = v - pred
            code = 0
            if diff < 0:
                code = 8
                diff = -diff
            delta = step >> 3
            if diff >= step: code |= 4; diff -= step; delta += step
            if diff >= step >> 1: code |= 2; diff -= step >> 1; delta += step >> 1
            if diff >= step >> 2: code |= 1; delta += step >> 2
            pred = max(-32768, min(32767, pred - delta if code & 8 else pred + delta))
            index = max(0, min(88, index + IMA_INDEX[code & 7]))
            nibbles.append(code)
        for k in range(0, len(nibbles), 2):
            out.append(nibbles[k] | (nibbles[k + 1] << 4))
        blocks.append(bytes(out))
    return blocks, per


def mp4_h264(path):
    """(width, height, fps, [(annexb bytes, keyframe)]) from a (fragmented) MP4 with one H.264 track."""
    d = open(path, 'rb').read()

    def boxes(start, end):
        i = start
        while i + 8 <= end:
            size, typ = struct.unpack('>I4s', d[i:i + 8])
            hdr = 8
            if size == 1:
                size = struct.unpack('>Q', d[i + 8:i + 16])[0]
                hdr = 16
            if size == 0:
                size = end - i
            yield typ.decode('latin1'), i + hdr, i + size, i
            i += size

    def find(start, end, path):
        for typ, b, e, _ in boxes(start, end):
            if typ == path[0]:
                return (b, e) if len(path) == 1 else find(b, e, path[1:])
        return None

    moov = find(0, len(d), ['moov'])
    vid = None
    for typ, b, e, _ in boxes(*moov):
        if typ != 'trak':
            continue
        hdlr = find(b, e, ['mdia', 'hdlr'])
        if d[hdlr[0] + 8:hdlr[0] + 12] != b'vide':
            continue
        tkhd = find(b, e, ['tkhd'])
        version = d[tkhd[0]]
        tid = struct.unpack('>I', d[tkhd[0] + (20 if version else 12):][:4])[0]
        stsd = find(b, e, ['mdia', 'minf', 'stbl', 'stsd'])
        entry = stsd[0] + 8
        esize = struct.unpack('>I', d[entry:entry + 4])[0]
        w, h = struct.unpack('>HH', d[entry + 32:entry + 36])
        avcc = find(entry + 8 + 78, entry + esize, ['avcC'])
        c = d[avcc[0]:avcc[1]]
        nal_len = (c[4] & 3) + 1
        p = 6
        ps = []
        for _ in range(c[5] & 0x1f):
            n = struct.unpack('>H', c[p:p + 2])[0]; ps.append(c[p + 2:p + 2 + n]); p += 2 + n
        for _ in range(c[p]):
            p += 1
            n = struct.unpack('>H', c[p:p + 2])[0]; ps.append(c[p + 2:p + 2 + n]); p += n + 1
        vid = {'id': tid, 'w': w, 'h': h, 'nal_len': nal_len, 'ps': ps}
    samples = []
    durs = []
    for typ, b, e, start in boxes(0, len(d)):
        if typ != 'moof':
            continue
        for t2, tb, te, _ in boxes(b, e):
            if t2 != 'traf':
                continue
            tfhd = find(tb, te, ['tfhd'])
            flags = struct.unpack('>I', d[tfhd[0]:tfhd[0] + 4])[0] & 0xffffff
            tid = struct.unpack('>I', d[tfhd[0] + 4:tfhd[0] + 8])[0]
            p = tfhd[0] + 8
            base = start
            if flags & 1: base = struct.unpack('>Q', d[p:p + 8])[0]; p += 8
            if flags & 2: p += 4
            ddur = dsize = dflags = 0
            if flags & 8: ddur = struct.unpack('>I', d[p:p + 4])[0]; p += 4
            if flags & 0x10: dsize = struct.unpack('>I', d[p:p + 4])[0]; p += 4
            if flags & 0x20: dflags = struct.unpack('>I', d[p:p + 4])[0]; p += 4
            trun = find(tb, te, ['trun'])
            tf = struct.unpack('>I', d[trun[0]:trun[0] + 4])[0] & 0xffffff
            count = struct.unpack('>I', d[trun[0] + 4:trun[0] + 8])[0]
            q = trun[0] + 8
            off = 0
            if tf & 1: off = struct.unpack('>i', d[q:q + 4])[0]; q += 4
            first_flags = None
            if tf & 4: first_flags = struct.unpack('>I', d[q:q + 4])[0]; q += 4
            pos = base + off
            for k in range(count):
                dur, size, sflags = ddur, dsize, (first_flags if k == 0 and first_flags is not None else dflags)
                if tf & 0x100: dur = struct.unpack('>I', d[q:q + 4])[0]; q += 4
                if tf & 0x200: size = struct.unpack('>I', d[q:q + 4])[0]; q += 4
                if tf & 0x400: sflags = struct.unpack('>I', d[q:q + 4])[0]; q += 4
                if tf & 0x800: q += 4
                if tid == vid['id']:
                    data = d[pos:pos + size]
                    key = not (sflags & 0x10000)
                    out = b''.join(b'\0\0\0\1' + x for x in vid['ps']) if key else b''
                    i = 0
                    while i < len(data):
                        n = int.from_bytes(data[i:i + vid['nal_len']], 'big')
                        out += b'\0\0\0\1' + data[i + vid['nal_len']:i + vid['nal_len'] + n]
                        i += vid['nal_len'] + n
                    samples.append((out, key))
                    durs.append(dur)
                pos += size
    mdhd_ts = 90000
    for typ, b, e, _ in boxes(*moov):
        if typ == 'trak' and find(b, e, ['mdia', 'hdlr']) and d[find(b, e, ['mdia', 'hdlr'])[0] + 8:find(b, e, ['mdia', 'hdlr'])[0] + 12] == b'vide':
            mdhd = find(b, e, ['mdia', 'mdhd'])
            mdhd_ts = struct.unpack('>I', d[mdhd[0] + (20 if d[mdhd[0]] else 12):][:4])[0]
    avg = sum(durs) / max(1, len(durs))
    fps = max(1, round(mdhd_ts / avg)) if avg else 30
    return vid['w'], vid['h'], fps, samples


# 1. Old digital camera: MJPEG + PCM, indexed.
fps, n, w, h = 10, 30, 160, 120
rate = 8000
pcm = b''.join(struct.pack('<h', int(v * 32767)) for v in tone(n / fps, rate))
fmt = struct.pack('<HHIIHH', 1, 1, rate, rate * 2, 2, 16)
write_avi(os.path.join(OUT, 'camera-mjpeg.avi'), w, h, fps, jpeg_frames(n, w, h), 'MJPG', 'MJPG', (fmt, split(pcm, n, 2), rate * 2, 2))

# 2. CCTV / webcam: MJPEG without Huffman tables, mu-law sound, no index.
mu = bytes(mulaw(v) for v in tone(n / fps, rate, 660))
fmt = struct.pack('<HHIIHHH', 7, 1, rate, rate, 1, 8, 0)
write_avi(os.path.join(OUT, 'cctv-mjpeg-nodht.avi'), w, h, fps, jpeg_frames(n, w, h, strip_dht=True), 'MJPG', 'MJPG', (fmt, split(mu, n), rate, 1), index=False)

# 3. H.264 in AVI (security cameras, dashcams), with IMA ADPCM sound.
vw, vh, vfps, frames = mp4_h264(os.path.join(OUT, 'turbine.mp4'))
blocks, per = ima_blocks(tone(len(frames) / vfps, rate), 256)
fmt = struct.pack('<HHIIHHHH', 0x11, 1, rate, rate * 256 // per, 256, 4, 2, per)
groups = [b''.join(blocks[i * len(blocks) // len(frames):(i + 1) * len(blocks) // len(frames)]) for i in range(len(frames))]
write_avi(os.path.join(OUT, 'turbine-h264.avi'), vw, vh, vfps, frames, 'H264', 'H264', (fmt, groups, rate * 256 // per, 256))
