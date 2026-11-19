"""Writes small network captures (pcap + pcapng) with SCADA traffic for the samples folder.

All addresses are private / documentation ranges; the payloads are made up.
Run: python3 scripts/make-pcap-samples.py
"""
import struct

MAC_HMI = bytes.fromhex('020000000001')
MAC_RTU = bytes.fromhex('020000000002')
BCAST = b'\xff' * 6
GOOSE_DST = bytes.fromhex('010ccd010001')


def csum(b):
    if len(b) % 2:
        b += b'\0'
    s = sum(struct.unpack('!%dH' % (len(b) // 2), b))
    while s >> 16:
        s = (s & 0xFFFF) + (s >> 16)
    return ~s & 0xFFFF


def ipv4(src, dst, proto, payload):
    hdr = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 20 + len(payload), 1, 0x4000, 64, proto, 0, bytes(src), bytes(dst))
    return hdr[:10] + struct.pack('!H', csum(hdr)) + hdr[12:] + payload


def tcp(sp, dp, seq, payload, flags=0x18):
    return struct.pack('!HHIIBBHHH', sp, dp, seq, 1, 0x50, flags, 64240, 0, 0) + payload


def udp(sp, dp, payload):
    return struct.pack('!HHHH', sp, dp, 8 + len(payload), 0) + payload


def eth(dst, src, etype, payload):
    return dst + src + struct.pack('!H', etype) + payload


HMI, RTU, PLC = [10, 20, 0, 10], [10, 20, 0, 50], [10, 20, 0, 60]
frames = [
    eth(BCAST, MAC_HMI, 0x0806, struct.pack('!HHBBH6s4s6s4s', 1, 0x0800, 6, 4, 1, MAC_HMI, bytes(HMI), b'\0' * 6, bytes(RTU))),
    eth(MAC_RTU, MAC_HMI, 0x0800, ipv4(HMI, RTU, 6, tcp(50123, 502, 1, struct.pack('!HHHBBHH', 1, 0, 6, 1, 3, 0, 10)))),
    eth(MAC_HMI, MAC_RTU, 0x0800, ipv4(RTU, HMI, 6, tcp(502, 50123, 1, struct.pack('!HHHBBB', 1, 0, 23, 1, 3, 20) + bytes(range(20))))),
    eth(MAC_RTU, MAC_HMI, 0x0800, ipv4(HMI, RTU, 6, tcp(50123, 502, 13, struct.pack('!HHHBBHH', 2, 0, 6, 1, 6, 4, 1)))),
    eth(MAC_HMI, MAC_RTU, 0x0800, ipv4(RTU, HMI, 6, tcp(502, 50123, 30, struct.pack('!HHHBBB', 2, 0, 3, 1, 0x86, 2)))),
    eth(MAC_RTU, MAC_HMI, 0x0800, ipv4(HMI, PLC, 6, tcp(51000, 2404, 1, bytes([0x68, 4, 0x07, 0, 0, 0])))),
    eth(MAC_HMI, MAC_RTU, 0x0800, ipv4(PLC, HMI, 6, tcp(2404, 51000, 1, bytes([0x68, 4, 0x0B, 0, 0, 0])))),
    eth(MAC_HMI, MAC_RTU, 0x0800, ipv4(PLC, HMI, 6, tcp(2404, 51000, 7, bytes([0x68, 14, 0, 0, 0, 0, 13, 1, 3, 0, 1, 0, 1, 0, 0, 0, 0, 0x48, 0x42, 0])))),
    eth(MAC_RTU, MAC_HMI, 0x0800, ipv4(HMI, PLC, 6, tcp(51000, 2404, 7, bytes([0x68, 4, 0x01, 0, 2, 0])))),
    eth(MAC_RTU, MAC_HMI, 0x0800, ipv4(HMI, RTU, 6, tcp(50200, 20000, 1, bytes([0x05, 0x64, 0x05, 0xC0, 10, 0, 1, 0, 0, 0])))),
    eth(MAC_RTU, MAC_HMI, 0x0800, ipv4(HMI, [10, 20, 0, 1], 17, udp(40000, 123, b'\x23' + b'\0' * 47))),
    eth(GOOSE_DST, MAC_RTU, 0x88B8, struct.pack('!HHHH', 0x0001, 30, 0, 0) + bytes.fromhex('6116800a5752544731434647') + b'\0' * 10),
]


def pcap(path):
    with open(path, 'wb') as f:
        f.write(struct.pack('<IHHiIII', 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1))
        t = 1767225600  # 2026-01-01 00:00:00 UTC
        for i, fr in enumerate(frames):
            f.write(struct.pack('<IIII', t, i * 12500, len(fr), len(fr)) + fr)


def block(btype, body):
    body += b'\0' * (-len(body) % 4)
    n = 12 + len(body)
    return struct.pack('<II', btype, n) + body + struct.pack('<I', n)


def pcapng(path):
    shb = block(0x0A0D0D0A, struct.pack('<IHHq', 0x1A2B3C4D, 1, 0, -1))
    opt = struct.pack('<HHB3x', 9, 1, 6) + struct.pack('<HH', 0, 0)  # if_tsresol = 10^-6
    idb = block(1, struct.pack('<HHI', 1, 0, 65535) + opt)
    out = shb + idb
    t0 = 1767225600 * 1_000_000
    for i, fr in enumerate(frames):
        ts = t0 + i * 12500
        out += block(6, struct.pack('<IIIII', 0, ts >> 32, ts & 0xFFFFFFFF, len(fr), len(fr)) + fr)
    open(path, 'wb').write(out)


pcap('samples/network/scada-modbus-iec104.pcap')
pcapng('samples/network/scada-modbus-iec104.pcapng')
