"""Writes samples/drawings/turbine-pad-features.dxf: a small drawing using the DXF objects
added in the drawing upgrade — solid and pattern hatches (with an arc boundary), a leader,
a multileader, a wipeout, a block with an attribute value, a construction line, and a
paper-space layout ("Sheet A1") with a title block and a viewport onto the model."""
import math, os

out = []
def g(code, value):
    out.append(f"{code:>3}\n{value}\n")

def sec(name):
    g(0, 'SECTION'); g(2, name)

def endsec():
    g(0, 'ENDSEC')

# ---- header
sec('HEADER')
g(9, '$ACADVER'); g(1, 'AC1015')
g(9, '$INSUNITS'); g(70, 6)
endsec()

# ---- layers
sec('TABLES')
g(0, 'TABLE'); g(2, 'LAYER')
for name, color in [('0', 7), ('PAD', 7), ('HATCH', 8), ('NOTES', 2), ('TITLE', 7), ('CONSTRUCTION', 1)]:
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS')
g(0, 'ENDTAB')
endsec()

# ---- blocks: a turbine tag with an attribute; paper space
sec('BLOCKS')
g(0, 'BLOCK'); g(8, '0'); g(2, 'TAG'); g(70, 2); g(10, 0); g(20, 0); g(30, 0); g(3, 'TAG')
g(0, 'CIRCLE'); g(8, '0'); g(10, 0); g(20, 0); g(30, 0); g(40, 1.5)
g(0, 'ATTDEF'); g(8, '0'); g(10, -1); g(20, -0.4); g(30, 0); g(40, 0.8); g(1, '?'); g(3, 'Turbine'); g(2, 'ID'); g(70, 0)
g(0, 'ENDBLK'); g(8, '0')
g(0, 'BLOCK'); g(8, '0'); g(330, '1F'); g(2, '*Paper_Space'); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, '*Paper_Space')
g(0, 'ENDBLK'); g(8, '0')
endsec()

sec('ENTITIES')
# Pad outline 20 x 20 with a centre circle.
for (x1, y1, x2, y2) in [(0, 0, 20, 0), (20, 0, 20, 20), (20, 20, 0, 20), (0, 20, 0, 0)]:
    g(0, 'LINE'); g(8, 'PAD'); g(10, x1); g(20, y1); g(30, 0); g(11, x2); g(21, y2); g(31, 0)
g(0, 'CIRCLE'); g(8, 'PAD'); g(10, 10); g(20, 10); g(30, 0); g(40, 4)

# Solid hatch: a square in the corner.
g(0, 'HATCH'); g(8, 'HATCH'); g(62, 3); g(10, 0); g(20, 0); g(30, 0); g(2, 'SOLID'); g(70, 1); g(71, 0); g(91, 1)
g(92, 2); g(72, 0); g(73, 1); g(93, 4)
for (x, y) in [(1, 1), (5, 1), (5, 5), (1, 5)]:
    g(10, x); g(20, y)
g(97, 0); g(75, 0); g(76, 1); g(98, 0)

# Pattern hatch (ANSI31: 45° lines, 3.175 apart, scaled 0.25) inside the circle: two arc edges.
g(0, 'HATCH'); g(8, 'HATCH'); g(10, 0); g(20, 0); g(30, 0); g(2, 'ANSI31'); g(70, 0); g(71, 0); g(91, 1)
g(92, 1); g(93, 2)
g(72, 2); g(10, 10); g(20, 10); g(40, 4); g(50, 0); g(51, 180); g(73, 1)
g(72, 2); g(10, 10); g(20, 10); g(40, 4); g(50, 180); g(51, 360); g(73, 1)
g(97, 0); g(75, 0); g(76, 1); g(52, 0); g(41, 0.25); g(77, 0); g(78, 1)
g(53, 45); g(43, 0); g(44, 0); g(45, -0.5612); g(46, 0.5612); g(79, 0)
g(98, 0)

# A line crossing the note box, hidden by the wipeout below.
g(0, 'LINE'); g(8, 'PAD'); g(10, 22); g(20, 14); g(30, 0); g(11, 34); g(21, 14); g(31, 0)
g(0, 'WIPEOUT'); g(8, 'NOTES'); g(10, 24); g(20, 12); g(30, 0); g(11, 8); g(21, 0); g(31, 0); g(12, 0); g(22, 4); g(32, 0); g(13, 1); g(23, 1); g(71, 1); g(91, 2)
g(14, -0.5); g(24, -0.5); g(14, 0.5); g(24, 0.5)
g(0, 'TEXT'); g(8, 'NOTES'); g(10, 24.5); g(20, 13.4); g(30, 0); g(40, 1); g(1, 'FOUNDATION C40')

# Leader from the circle to the note.
g(0, 'LEADER'); g(8, 'NOTES'); g(71, 1); g(72, 0); g(40, 1); g(76, 3)
for (x, y) in [(13, 13), (18, 17), (24, 17)]:
    g(10, x); g(20, y); g(30, 0)
g(0, 'TEXT'); g(8, 'NOTES'); g(10, 24.5); g(20, 16.6); g(30, 0); g(40, 1); g(1, 'TOWER FLANGE')

# Multileader pointing at the solid hatch.
g(0, 'MULTILEADER'); g(8, 'NOTES'); g(300, 'CONTEXT_DATA{'); g(40, 1); g(10, 0); g(20, 0); g(30, 0); g(41, 1); g(140, 0.8)
g(290, 1); g(304, 'GROUT PAD'); g(12, -9); g(22, -1); g(32, 0)
g(302, 'LEADER{'); g(10, -3); g(20, -2); g(30, 0)
g(304, 'LEADER_LINE{'); g(10, 3); g(20, 3); g(30, 0); g(305, '}')
g(303, '}'); g(301, '}')

# Turbine tag with its attribute value.
g(0, 'INSERT'); g(8, 'PAD'); g(66, 1); g(2, 'TAG'); g(10, 28); g(20, 4); g(30, 0)
g(0, 'ATTRIB'); g(8, 'PAD'); g(10, 27); g(20, 3.6); g(30, 0); g(40, 0.8); g(1, 'T-07'); g(2, 'ID'); g(70, 0)
g(0, 'SEQEND'); g(8, 'PAD')

# Construction line through the pad centre.
g(0, 'XLINE'); g(8, 'CONSTRUCTION'); g(10, 10); g(20, 10); g(30, 0); g(11, 1); g(21, 0); g(31, 0)

# ---- paper space: sheet border, title, viewports (1 = the sheet itself, 2 = the window).
for (x1, y1, x2, y2) in [(0, 0, 420, 0), (420, 0, 420, 297), (420, 297, 0, 297), (0, 297, 0, 0)]:
    g(0, 'LINE'); g(8, 'TITLE'); g(67, 1); g(10, x1); g(20, y1); g(30, 0); g(11, x2); g(21, y2); g(31, 0)
g(0, 'TEXT'); g(8, 'TITLE'); g(67, 1); g(10, 300); g(20, 15); g(30, 0); g(40, 6); g(1, 'TURBINE PAD T-07  1:100')
g(0, 'VIEWPORT'); g(8, '0'); g(67, 1); g(10, 210); g(20, 148.5); g(30, 0); g(40, 420); g(41, 297); g(68, 1); g(69, 1); g(12, 210); g(22, 148.5); g(45, 297)
g(0, 'VIEWPORT'); g(8, '0'); g(67, 1); g(10, 200); g(20, 160); g(30, 0); g(40, 300); g(41, 200); g(68, 2); g(69, 2); g(12, 15); g(22, 9); g(45, 40)
endsec()

sec('OBJECTS')
g(0, 'LAYOUT'); g(5, '30'); g(330, '1A'); g(100, 'AcDbPlotSettings'); g(1, ''); g(100, 'AcDbLayout'); g(1, 'Sheet A1'); g(70, 1); g(71, 1); g(330, '1F')
endsec()
g(0, 'EOF')

path = os.path.join(os.path.dirname(__file__), '..', 'samples', 'drawings', 'turbine-pad-features.dxf')
with open(path, 'w', newline='\r\n') as f:
    f.write(''.join(out))
print('wrote', os.path.normpath(path))
