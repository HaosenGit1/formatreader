"""Writes samples/drawings/sensor-board.gtl (Gerber X2 top copper) and sensor-board.drl
(Excellon drill): a small board with pads, traces (straight and arc), a ground pour region
with a clear-polarity cut-out, and plated holes."""
import os
out = os.path.join(os.path.dirname(__file__), '..', 'samples', 'drawings')
def c(v): return f'{round(v * 1e6):d}'   # FSLAX46Y46, mm
g = ['G04 FormatReader sample: wind-sensor interface board, top copper*', '%TF.FileFunction,Copper,L1,Top*%', '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%',
     '%ADD10C,0.300*%', '%ADD11R,1.600X1.600*%', '%ADD12C,1.700*%', '%ADD13O,1.200X2.000*%', '%ADD14P,2.000X8*%']
# ground pour region with a clear cut-out
g += ['G36*', f'X{c(2)}Y{c(2)}D02*', 'G01*', f'X{c(48)}Y{c(2)}D01*', f'X{c(48)}Y{c(12)}D01*', f'X{c(2)}Y{c(12)}D01*', f'X{c(2)}Y{c(2)}D01*', 'G37*']
g += ['%LPC*%', 'G36*', f'X{c(20)}Y{c(5)}D02*', f'X{c(30)}Y{c(5)}D01*', f'X{c(30)}Y{c(9)}D01*', f'X{c(20)}Y{c(9)}D01*', f'X{c(20)}Y{c(5)}D01*', 'G37*', '%LPD*%']
# pads
g += ['D11*'] + [f'X{c(6 + 2.54 * i)}Y{c(30)}D03*' for i in range(6)]
g += ['D12*'] + [f'X{c(40)}Y{c(22 + 2.54 * i)}D03*' for i in range(4)]
g += ['D13*', f'X{c(25)}Y{c(40)}D03*', 'D14*', f'X{c(10)}Y{c(42)}D03*']
# traces: straight, then a counter-clockwise arc
g += ['D10*', 'G01*', f'X{c(6)}Y{c(30)}D02*', f'X{c(6)}Y{c(36)}D01*', f'X{c(20)}Y{c(36)}D01*',
      f'X{c(18.7)}Y{c(30)}D02*', f'X{c(30)}Y{c(30)}D01*', f'X{c(40)}Y{c(22)}D01*',
      '%LPD*%', 'G75*', f'X{c(25)}Y{c(36)}D02*', 'G03*', f'X{c(35)}Y{c(36)}I{c(5)}J{c(0)}D01*', 'G01*', 'M02*']
open(os.path.join(out, 'sensor-board.gtl'), 'w', newline='\n').write('\n'.join(g) + '\n')
d = ['M48', 'METRIC,LZ', 'T1C0.800', 'T2C1.000', '%', 'T1'] + [f'X{6 + 2.54 * i:.3f}Y30.000' for i in range(6)] + ['T2'] + [f'X40.000Y{22 + 2.54 * i:.3f}' for i in range(4)] + ['M30']
open(os.path.join(out, 'sensor-board.drl'), 'w', newline='\n').write('\n'.join(d) + '\n')
# Board layers share one format and differ only by name (.gbr generic, .gbl bottom copper,
# .gto top silkscreen, .gts top solder mask): the same drawing under each name.
import shutil
for ext in ('gbr', 'gbl', 'gto', 'gts'):
    shutil.copy(os.path.join(out, 'sensor-board.gtl'), os.path.join(out, f'sensor-board.{ext}'))
print('wrote Gerber + drill samples')
