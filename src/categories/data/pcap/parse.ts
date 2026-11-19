/**
 * Network captures: classic pcap (tcpdump, Wireshark) and pcapng. Each packet is decoded
 * down to Ethernet / VLAN / ARP / IPv4 / IPv6 / TCP / UDP / ICMP, and named by the
 * well-known protocol on its port — including industrial and SCADA protocols (Modbus/TCP,
 * DNP3, IEC 60870-5-104, IEC 61850 MMS, OPC UA, S7comm, EtherNet/IP, BACnet, GOOSE, SV…).
 */

export interface Packet {
  no: number;
  /** Seconds since the Unix epoch (with fraction). */
  time: number;
  length: number;
  src: string;
  dst: string;
  protocol: string;
  info: string;
  /** The captured bytes (for the hex view). */
  data: Uint8Array;
}

export interface Capture {
  format: 'pcap' | 'pcapng';
  linkType: number;
  packets: Packet[];
  truncated: boolean;
}

const MAX_PACKETS = 200_000;

/** Port → protocol name (TCP and UDP). */
const PORTS: Record<number, string> = {
  20: 'FTP-data', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 67: 'DHCP', 68: 'DHCP', 69: 'TFTP', 80: 'HTTP', 102: 'S7comm / MMS (ISO-TSAP)', 110: 'POP3', 123: 'NTP', 137: 'NetBIOS', 138: 'NetBIOS', 139: 'NetBIOS', 143: 'IMAP', 161: 'SNMP', 162: 'SNMP trap', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB', 502: 'Modbus/TCP', 514: 'Syslog', 546: 'DHCPv6', 547: 'DHCPv6', 1883: 'MQTT', 1911: 'Fox (Niagara)', 2222: 'EtherNet/IP', 2404: 'IEC 60870-5-104', 3389: 'RDP', 4840: 'OPC UA', 4843: 'OPC UA (TLS)', 5353: 'mDNS', 8883: 'MQTT (TLS)', 18245: 'GE SRTP', 20000: 'DNP3', 34962: 'PROFINET', 34963: 'PROFINET', 34964: 'PROFINET', 44818: 'EtherNet/IP', 47808: 'BACnet/IP', 1089: 'FF HSE', 1090: 'FF HSE', 1091: 'FF HSE', 1541: 'Foxboro', 2455: 'CODESYS', 5007: 'Mitsubishi MELSEC', 5094: 'HART-IP', 9600: 'OMRON FINS', 20547: 'ProConOS',
};
/** EtherTypes that are not IP. */
/** IEC 104 U-frame control byte → function. */
const U104: Record<number, string> = { 0x07: 'STARTDT act', 0x0b: 'STARTDT con', 0x13: 'STOPDT act', 0x23: 'STOPDT con', 0x43: 'TESTFR act', 0x83: 'TESTFR con' };
const ETHERTYPES: Record<number, string> = { 0x0806: 'ARP', 0x88b8: 'IEC 61850 GOOSE', 0x88ba: 'IEC 61850 Sampled Values', 0x88b9: 'GSE management', 0x8892: 'PROFINET', 0x88a4: 'EtherCAT', 0x88cc: 'LLDP', 0x88f7: 'PTP', 0x8100: 'VLAN', 0x88e5: 'MACsec' };
const IPPROTO: Record<number, string> = { 1: 'ICMP', 2: 'IGMP', 6: 'TCP', 17: 'UDP', 47: 'GRE', 50: 'ESP', 58: 'ICMPv6', 89: 'OSPF', 132: 'SCTP' };

const mac = (b: Uint8Array, o: number) => Array.from(b.subarray(o, o + 6), (x) => x.toString(16).padStart(2, '0')).join(':');
const ip4 = (b: Uint8Array, o: number) => `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`;
function ip6(b: Uint8Array, o: number): string {
  const g: string[] = [];
  for (let i = 0; i < 16; i += 2) g.push(((b[o + i] << 8) | b[o + i + 1]).toString(16));
  return g.join(':').replace(/(^|:)0(:0)+(:|$)/, '::').replace(/:{3,}/, '::');
}

/** Decodes one captured frame into addresses, protocol and a short summary. */
export function decode(data: Uint8Array, linkType: number): Pick<Packet, 'src' | 'dst' | 'protocol' | 'info'> {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const at = (o: number, n: number) => o + n <= data.length;
  let o = 0;
  let etherType = 0;
  let src = '';
  let dst = '';
  if (linkType === 1) {
    if (!at(0, 14)) return { src: '', dst: '', protocol: 'Ethernet', info: 'Short frame' };
    dst = mac(data, 0);
    src = mac(data, 6);
    etherType = v.getUint16(12);
    o = 14;
    let vlan = '';
    while ((etherType === 0x8100 || etherType === 0x88a8) && at(o, 4)) {
      vlan += `VLAN ${v.getUint16(o) & 0x0fff} · `;
      etherType = v.getUint16(o + 2);
      o += 4;
    }
    if (etherType < 0x0600) return { src, dst, protocol: 'LLC', info: `${vlan}802.3 frame, ${etherType} bytes` };
    if (etherType !== 0x0800 && etherType !== 0x86dd) {
      if (etherType === 0x0806 && at(o, 28)) {
        const op = v.getUint16(o + 6);
        return { src, dst, protocol: 'ARP', info: op === 1 ? `Who has ${ip4(data, o + 24)}? Tell ${ip4(data, o + 14)}` : `${ip4(data, o + 14)} is at ${mac(data, o + 8)}` };
      }
      if (etherType === 0x88b8 && at(o, 8)) return { src, dst, protocol: 'IEC 61850 GOOSE', info: `${vlan}APPID 0x${v.getUint16(o).toString(16).padStart(4, '0')}` };
      return { src, dst, protocol: ETHERTYPES[etherType] ?? `EtherType 0x${etherType.toString(16).padStart(4, '0')}`, info: vlan.replace(/ · $/, '') };
    }
  } else if (linkType === 113 && at(0, 16)) {
    etherType = v.getUint16(14);
    o = 16;
  } else if (linkType === 276 && at(0, 20)) {
    etherType = v.getUint16(0);
    o = 20;
  } else if (linkType === 101 || linkType === 12 || linkType === 228 || linkType === 229) {
    etherType = data[0] >> 4 === 6 ? 0x86dd : 0x0800;
  } else return { src: '', dst: '', protocol: `Link type ${linkType}`, info: '' };

  // IP
  let proto = 0;
  if (etherType === 0x0800 && at(o, 20)) {
    const ihl = (data[o] & 0x0f) * 4;
    proto = data[o + 9];
    src = ip4(data, o + 12);
    dst = ip4(data, o + 16);
    o += ihl;
  } else if (etherType === 0x86dd && at(o, 40)) {
    proto = data[o + 6];
    src = ip6(data, o + 8);
    dst = ip6(data, o + 24);
    o += 40;
  } else return { src, dst, protocol: ETHERTYPES[etherType] ?? 'IP', info: '' };

  if ((proto === 6 || proto === 17) && at(o, 8)) {
    const sp = v.getUint16(o);
    const dp = v.getUint16(o + 2);
    const name = PORTS[dp] ?? PORTS[sp] ?? (proto === 6 ? 'TCP' : 'UDP');
    let info = `${sp} → ${dp}`;
    if (proto === 6 && at(o, 20)) {
      const fl = data[o + 13];
      const flags = [fl & 2 && 'SYN', fl & 16 && 'ACK', fl & 1 && 'FIN', fl & 4 && 'RST', fl & 8 && 'PSH'].filter(Boolean).join(', ');
      const hdr = (data[o + 12] >> 4) * 4;
      const payload = data.length - o - hdr;
      info += ` [${flags}] Seq=${v.getUint32(o + 4)} Len=${Math.max(0, payload)}`;
      const p = o + hdr;
      // Modbus/TCP: transaction, unit, function code.
      if ((dp === 502 || sp === 502) && at(p, 8)) info += ` · Modbus unit ${data[p + 6]} function ${data[p + 7] & 0x7f}${MODBUS_FN[data[p + 7] & 0x7f] ? ` (${MODBUS_FN[data[p + 7] & 0x7f]})` : ''}${data[p + 7] & 0x80 ? ' EXCEPTION' : ''}`;
      // IEC 104: APCI frame type.
      if ((dp === 2404 || sp === 2404) && at(p, 6) && data[p] === 0x68) info += ` · ${(data[p + 2] & 1) === 0 ? `I-frame${at(p, 7) ? ` ASDU type ${data[p + 6]}` : ''}` : (data[p + 2] & 3) === 1 ? 'S-frame' : `U-frame${U104[data[p + 2]] ? ` ${U104[data[p + 2]]}` : ''}`}`;
      // DNP3: link header start bytes 05 64.
      if ((dp === 20000 || sp === 20000) && at(p, 10) && data[p] === 0x05 && data[p + 1] === 0x64) info += ` · DNP3 ${v.getUint16(p + 6, true)} → ${v.getUint16(p + 4, true)}`;
    } else info += ` Len=${Math.max(0, data.length - o - 8)}`;
    return { src: `${src}:${sp}`, dst: `${dst}:${dp}`, protocol: name, info };
  }
  if ((proto === 1 || proto === 58) && at(o, 2)) {
    const t = data[o];
    const icmpName: Record<number, string> = proto === 1 ? { 0: 'Echo reply', 3: 'Destination unreachable', 8: 'Echo request (ping)', 11: 'Time exceeded' } : { 128: 'Echo request (ping)', 129: 'Echo reply', 133: 'Router solicitation', 134: 'Router advertisement', 135: 'Neighbor solicitation', 136: 'Neighbor advertisement' };
    return { src, dst, protocol: IPPROTO[proto], info: icmpName[t] ?? `Type ${t}` };
  }
  return { src, dst, protocol: IPPROTO[proto] ?? `IP proto ${proto}`, info: '' };
}

const MODBUS_FN: Record<number, string> = { 1: 'Read coils', 2: 'Read discrete inputs', 3: 'Read holding registers', 4: 'Read input registers', 5: 'Write single coil', 6: 'Write single register', 15: 'Write multiple coils', 16: 'Write multiple registers', 23: 'Read/write registers', 43: 'Device identification' };

export function isCapture(b: Uint8Array): boolean {
  if (b.length < 24) return false;
  const m = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
  return [0xa1b2c3d4, 0xd4c3b2a1, 0xa1b23c4d, 0x4d3cb2a1, 0x0a0d0d0a].map((x) => x | 0).includes(m);
}

export function parseCapture(buf: ArrayBuffer): Capture {
  const b = new Uint8Array(buf);
  const v = new DataView(buf);
  const magic = v.getUint32(0);
  const packets: Packet[] = [];
  let truncated = false;
  const push = (time: number, length: number, data: Uint8Array, link: number) => {
    if (packets.length >= MAX_PACKETS) return (truncated = true);
    packets.push({ no: packets.length + 1, time, length, data, ...decode(data, link) });
  };

  if (magic === 0x0a0d0d0a) {
    // pcapng: blocks; interfaces (IDB) give link type and time resolution.
    const ifaces: Array<{ link: number; tsres: number }> = [];
    let le = true;
    let o = 0;
    while (o + 12 <= b.length && !truncated) {
      if (v.getUint32(o) === 0x0a0d0d0a) le = v.getUint32(o + 8, true) === 0x1a2b3c4d;
      const type = v.getUint32(o, le);
      const len = v.getUint32(o + 4, le);
      if (len < 12 || o + len > b.length) break;
      if (type === 1) {
        let tsres = 1e-6;
        // Options: if_tsresol (code 9).
        for (let p = o + 16; p + 4 <= o + len - 4; ) {
          const code = v.getUint16(p, le);
          const ol = v.getUint16(p + 2, le);
          if (code === 0) break;
          if (code === 9 && ol >= 1) {
            const r = b[p + 4];
            tsres = r & 0x80 ? 2 ** -(r & 0x7f) : 10 ** -(r & 0x7f);
          }
          p += 4 + Math.ceil(ol / 4) * 4;
        }
        ifaces.push({ link: v.getUint16(o + 8, le), tsres });
      } else if (type === 6) {
        const ifc = ifaces[v.getUint32(o + 8, le)] ?? { link: 1, tsres: 1e-6 };
        const ts = v.getUint32(o + 12, le) * 2 ** 32 + v.getUint32(o + 16, le);
        const cap = v.getUint32(o + 20, le);
        push(ts * ifc.tsres, v.getUint32(o + 24, le), b.subarray(o + 28, o + 28 + cap), ifc.link);
      } else if (type === 3) {
        const ifc = ifaces[0] ?? { link: 1, tsres: 1e-6 };
        const orig = v.getUint32(o + 8, le);
        push(0, orig, b.subarray(o + 12, o + 12 + Math.min(orig, len - 16)), ifc.link);
      }
      o += len;
    }
    return { format: 'pcapng', linkType: ifaces[0]?.link ?? 1, packets, truncated };
  }

  const le = magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1;
  const nano = magic === 0xa1b23c4d || magic === 0x4d3cb2a1;
  const link = v.getUint32(20, le) & 0x0fffffff;
  for (let o = 24; o + 16 <= b.length && !truncated; ) {
    const sec = v.getUint32(o, le);
    const frac = v.getUint32(o + 4, le);
    const cap = v.getUint32(o + 8, le);
    const orig = v.getUint32(o + 12, le);
    if (o + 16 + cap > b.length) break;
    push(sec + frac / (nano ? 1e9 : 1e6), orig, b.subarray(o + 16, o + 16 + cap), link);
    o += 16 + cap;
  }
  return { format: 'pcap', linkType: link, packets, truncated };
}
