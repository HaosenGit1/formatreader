"""Synthetic COMTRADE fault recordings (run: python3 scripts/make-comtrade-samples.py).

A 0.3 s record at 4 kHz on a 50 Hz feeder: phase-A-to-ground fault at 100 ms
(current x8, voltage dip), protection trip at 120 ms, breaker opens at 160 ms.
Written as 1999 ASCII, 1999 BINARY, and a 2013 single-file .cff (BINARY32).
"""
import math, os, struct

OUT = os.path.join(os.path.dirname(__file__), '..', 'samples', 'data')
RATE, F, DUR = 4000, 50.0, 0.30
N = int(RATE * DUR)
FAULT, TRIP, OPEN = 0.100, 0.120, 0.160

def sample(k):
    t = k / RATE
    w = 2 * math.pi * F * t
    faulted = FAULT <= t < OPEN
    opened = t >= OPEN
    va = (0.35 if faulted else 1.0) * (0 if opened else 1) * 8165 * math.sin(w)
    vb = 8165 * math.sin(w - 2 * math.pi / 3) * (0 if opened else 1)
    vc = 8165 * math.sin(w + 2 * math.pi / 3) * (0 if opened else 1)
    ia = (8 if faulted else 1) * (0 if opened else 1) * 420 * math.sin(w - 0.5 - (1.1 if faulted else 0))
    ib = 420 * math.sin(w - 0.5 - 2 * math.pi / 3) * (0 if opened else 1)
    ic = 420 * math.sin(w - 0.5 + 2 * math.pi / 3) * (0 if opened else 1)
    trip = 1 if t >= TRIP else 0
    brk_open = 1 if t >= OPEN else 0
    return [va, vb, vc, ia, ib, ic], [trip, brk_open]

CH = [('VA', 'A', 'kV', 'V'), ('VB', 'B', 'kV', 'V'), ('VC', 'C', 'kV', 'V'), ('IA', 'A', 'A', 'I'), ('IB', 'B', 'A', 'I'), ('IC', 'C', 'A', 'I')]
# a = scale so int16 covers the range comfortably
SCALE = {'V': 0.5, 'I': 0.25}

def cfg_text(ftype, rev='1999'):
    lines = [f'Wind Farm Substation,REL-670 Feeder 3,{rev}', '8,6A,2D']
    for i, (name, ph, unit, kind) in enumerate(CH, 1):
        a = SCALE[kind] if ftype in ('ASCII', 'BINARY', 'BINARY32') else 1
        u = unit
        lines.append(f'{i},{name},{ph},Feeder 3,{u},{a},0,0,-32767,32767,{"110000" if kind == "V" else "1200"},{"100" if kind == "V" else "1"},P')
    lines += ['1,TRIP,,Feeder 3,0', '2,CB OPEN,,Feeder 3,0', '50', '1', f'{RATE},{N}',
              '17/11/2026,02:10:15.000000', '17/11/2026,02:10:15.100000', ftype, '1']
    return '\r\n'.join(lines) + '\r\n'

def rows(ftype):
    for k in range(N):
        an, dg = sample(k)
        raw = []
        for (name, ph, unit, kind), v in zip(CH, an):
            if kind == 'V':
                v = v / 1000 * 1000  # volts → keep in V but unit says kV: scale below
            raw.append(v)
        yield k, raw, dg

def to_counts(v, kind, ftype):
    # store kV for voltages, A for currents, as integer counts with factor a
    val = v / 1000 if kind == 'V' else v
    if ftype == 'FLOAT32':
        return val
    return int(round(val / SCALE[kind]))

def write(base, ftype):
    cfg = cfg_text(ftype)
    if ftype == 'ASCII':
        lines = []
        for k, raw, dg in rows(ftype):
            vals = [to_counts(v, kind, ftype) for (_, _, _, kind), v in zip(CH, raw)]
            lines.append(','.join([str(k + 1), str(int(k * 1e6 / RATE))] + [str(v) for v in vals] + [str(d) for d in dg]))
        dat = ('\r\n'.join(lines) + '\r\n').encode('ascii')
    else:
        fmt = {'BINARY': 'h', 'BINARY32': 'i', 'FLOAT32': 'f'}[ftype]
        out = bytearray()
        for k, raw, dg in rows(ftype):
            vals = [to_counts(v, kind, ftype) for (_, _, _, kind), v in zip(CH, raw)]
            word = sum(b << i for i, b in enumerate(dg))
            out += struct.pack('<II', k + 1, int(k * 1e6 / RATE)) + struct.pack('<' + fmt * len(vals), *vals) + struct.pack('<H', word)
        dat = bytes(out)
    return cfg, dat

cfg, dat = write('fault-ascii', 'ASCII')
open(os.path.join(OUT, 'fault-ascii.cfg'), 'w', encoding='utf-8', newline='').write(cfg)
open(os.path.join(OUT, 'fault-ascii.dat'), 'wb').write(dat)
cfg, dat = write('fault-binary', 'BINARY')
open(os.path.join(OUT, 'fault-binary.cfg'), 'w', encoding='utf-8', newline='').write(cfg)
open(os.path.join(OUT, 'fault-binary.dat'), 'wb').write(dat)
cfg, dat = write('fault-2013', 'BINARY32')
cfg = cfg.replace(',1999\r\n', ',2013\r\n', 1)
cff = (b'--- file type: CFG ---\r\n' + cfg.encode('utf-8') + b'--- file type: INF ---\r\n\r\n--- file type: HDR ---\r\nSynthetic phase-A fault for FormatReader\r\n'
       + f'--- file type: DAT BINARY: {len(dat)} ---\r\n'.encode() + dat)
open(os.path.join(OUT, 'fault-2013.cff'), 'wb').write(cff)
# The usual way records are shared: the .cfg/.dat pair in one ZIP.
import zipfile
with zipfile.ZipFile(os.path.join(OUT, 'fault-record.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(OUT, 'fault-binary.cfg'), 'REL670_F3_20261117_021015.cfg')
    z.write(os.path.join(OUT, 'fault-binary.dat'), 'REL670_F3_20261117_021015.dat')
for name in ('fault-binary.cfg', 'fault-binary.dat', 'fault-ascii.dat'):  # a lone .dat can't be read without its .cfg
    os.remove(os.path.join(OUT, name))
print('written', N, 'samples per record')
