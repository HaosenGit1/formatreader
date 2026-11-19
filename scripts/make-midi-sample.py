"""Writes a short original MIDI sample: piano melody, bass and drums, 100 BPM, 4/4."""
import struct

TPQ = 480


def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(out)


def track(name, events):
    """events: (tick, bytes) absolute; returns an MTrk chunk."""
    data = vlq(0) + b'\xff\x03' + vlq(len(name)) + name.encode()
    last = 0
    for tick, ev in sorted(events, key=lambda e: e[0]):
        data += vlq(tick - last) + ev
        last = tick
    data += vlq(0) + b'\xff\x2f\x00'
    return b'MTrk' + struct.pack('>I', len(data)) + data


def notes(ch, seq, start=0, vel=90):
    ev, t = [], start
    for pitch, beats in seq:
        dur = int(beats * TPQ)
        if pitch is not None:
            ev.append((t, bytes([0x90 | ch, pitch, vel])))
            ev.append((t + dur - 20, bytes([0x80 | ch, pitch, 0])))
        t += dur
    return ev


tempo = [(0, b'\xff\x51\x03' + (600000).to_bytes(3, 'big')), (0, b'\xff\x58\x04\x04\x02\x18\x08'), (0, b'\xff\x02\x0bSample tune')]
melody = [(67, 1), (69, .5), (71, .5), (72, 1), (71, 1), (69, 1), (67, .5), (64, .5), (67, 2),
          (72, 1), (74, .5), (76, .5), (74, 1), (72, 1), (71, 1.5), (69, .5), (67, 2)] * 2
bass = [(43, 2), (40, 2), (45, 2), (43, 2), (48, 2), (47, 2), (45, 2), (43, 2)] * 2
drums = []
for bar in range(16):
    for beat in range(4):
        t = (bar * 4 + beat) * TPQ
        drums += [(t, bytes([0x99, 36 if beat % 2 == 0 else 38, 100])), (t + 100, bytes([0x89, 36 if beat % 2 == 0 else 38, 0]))]
        for half in (0, TPQ // 2):
            drums += [(t + half, bytes([0x99, 42, 70])), (t + half + 60, bytes([0x89, 42, 0]))]
chunks = [
    track('Conductor', tempo),
    track('Piano', [(0, b'\xc0\x00')] + notes(0, melody)),
    track('Bass', [(0, b'\xc1\x21')] + notes(1, bass, vel=100)),
    track('Drums', drums),
]
with open('samples/midi/sample-tune.mid', 'wb') as f:
    f.write(b'MThd' + struct.pack('>IHHH', 6, 1, len(chunks), TPQ) + b''.join(chunks))
