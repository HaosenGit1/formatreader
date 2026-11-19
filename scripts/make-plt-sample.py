"""Writes samples/drawings/turbine-elevation.plt: an HP-GL/2 plot as a plotter driver would send
it (PJL/PCL wrapper around HP-GL/2): sheet border, a turbine elevation (pen 2 tower,
pen 3 blades), a foundation circle, filled title-block rectangles, labels, and one polyline
in HP-GL/2's compact PE encoding."""
import os

U = 40  # plotter units per mm

def pe_num(v):
    # base-64 PE number: sign in the low bit, least significant digit first
    v = (abs(v) << 1) | (1 if v < 0 else 0)
    out = []
    while True:
        d = v % 64
        v //= 64
        if v:
            out.append(chr(63 + d))
        else:
            out.append(chr(191 + d))
            break
    return ''.join(out)

cmds = ['\x1b%-12345X@PJL ENTER LANGUAGE=HPGL2\r\n', '\x1bE\x1b%0B', 'IN;', 'SP1;']
W, H = 420 * U, 297 * U
cmds.append(f'PU0,0;PD{W},0,{W},{H},0,{H},0,0;')                       # sheet border
cmds.append(f'PU{300*U},0;EA{W},{40*U};')                                # title block frame
cmds.append(f'PU{300*U},{30*U};RA{305*U},{35*U};')                       # filled mark
cmds.append('SI0.35,0.5;DT$;')
cmds.append(f'PU{310*U},{18*U};LBTURBINE ELEVATION  1:500$')
cmds.append(f'PU{310*U},{8*U};LBPLOT T-07$')
cmds.append('SP2;')
cmds.append(f'PU{196*U},{40*U};PD{198*U},{200*U},{202*U},{200*U},{204*U},{40*U},{196*U},{40*U};')  # tower
cmds.append(f'PU{193*U},{200*U};PD{207*U},{200*U},{207*U},{208*U},{193*U},{208*U},{193*U},{200*U};')  # nacelle
cmds.append(f'PU{200*U},{40*U};CI{14*U};')                                # foundation (plan circle)
cmds.append('SP3;PA;')
for dx, dy in [(0, 80), (-69, -40), (69, -40)]:                           # blades
    cmds.append(f'PU{200*U},{204*U};PD{(200+dx)*U},{(204+dy)*U};')
# HP-GL/2 encoded polyline: ground line, relative steps
cmds.append(f'SP1;PU{20*U},{40*U};')
steps = [(60, 3), (60, -2), (60, 1), (60, -2), (60, 0)]
cmds.append('PE<' + pe_num(0) + pe_num(0) + ''.join(pe_num(dx * U) + pe_num(dy * U) for dx, dy in steps) + ';')
cmds.append('PU0,0;SP0;')
cmds.append('\x1b%0A\x1bE\x1b%-12345X')
path = os.path.join(os.path.dirname(__file__), '..', 'samples', 'drawings', 'turbine-elevation.plt')
open(path, 'w', encoding='latin1', newline='').write(''.join(cmds))
print('wrote', os.path.normpath(path))
