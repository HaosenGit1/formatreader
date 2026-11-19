/**
 * Network capture viewer (.pcap / .pcapng from Wireshark, tcpdump, switches and RTUs):
 * protocol summary, a filterable packet list and the bytes of the selected packet.
 * Industrial protocols are named (Modbus/TCP with function codes, IEC 104 frame types,
 * DNP3 addresses, IEC 61850 GOOSE…).
 */
import './pcap.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { parseCapture, type Packet } from './parse';

const s = strings({
  packets: { en: 'packets', zh: '个数据包' },
  filter: { en: 'Filter: address, protocol, port, text…', zh: '筛选：地址、协议、端口、文字…' },
  no: { en: 'No.', zh: '序号' },
  time: { en: 'Time (s)', zh: '时间（秒）' },
  src: { en: 'Source', zh: '源' },
  dst: { en: 'Destination', zh: '目的' },
  proto: { en: 'Protocol', zh: '协议' },
  len: { en: 'Length', zh: '长度' },
  info: { en: 'Info', zh: '信息' },
  all: { en: 'All', zh: '全部' },
  shown: { en: 'Showing the first {n} matches — narrow the filter to see others.', zh: '只显示前 {n} 条匹配结果——请缩小筛选范围查看其他。' },
  truncated: { en: 'Only the first 200,000 packets are read.', zh: '只读取了前 200,000 个数据包。' },
  pick: { en: 'Click a packet to see its bytes.', zh: '点击数据包查看其字节。' },
  started: { en: 'Started', zh: '开始时间' },
});

const LIMIT = 3000;

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const cap = parseCapture(await file.arrayBuffer());
  const t0 = cap.packets[0]?.time ?? 0;
  const counts = new Map<string, number>();
  for (const p of cap.packets) counts.set(p.protocol, (counts.get(p.protocol) ?? 0) + 1);
  let proto = '';
  const filter = h('input', { type: 'search', class: 'pc-filter', placeholder: s('filter'), 'aria-label': s('filter') }) as HTMLInputElement;
  const chips = h('div', { class: 'pc-chips' });
  const body = h('tbody');
  const note = h('p', { class: 'pc-note' });
  const detail = h('pre', { class: 'pc-hex' }, s('pick'));
  const table = h('table', { class: 'pc-table' },
    h('thead', {}, h('tr', {}, ...(['no', 'time', 'src', 'dst', 'proto', 'len', 'info'] as const).map((k) => h('th', {}, s(k))))),
    body); // prettier-ignore
  ctx.mount.replaceChildren(h('div', { class: 'view view-pcap' }, h('div', { class: 'pc-top' }, chips, filter), h('div', { class: 'pc-wrap' }, table), note, detail));

  const drawChips = () =>
    chips.replaceChildren(
      ...[['', cap.packets.length] as [string, number], ...[...counts].sort((a, b) => b[1] - a[1])].map(([name, n]) =>
        h('button', { type: 'button', class: `pc-chip${name === proto ? ' active' : ''}`, onclick: () => ((proto = name), drawChips(), draw()) }, `${name || s('all')} · ${n.toLocaleString()}`),
      ),
    );
  const show = (p: Packet, row: HTMLElement) => {
    for (const r of body.querySelectorAll('tr.sel')) r.classList.remove('sel');
    row.classList.add('sel');
    const lines: string[] = [];
    for (let i = 0; i < p.data.length; i += 16) {
      const chunk = p.data.subarray(i, i + 16);
      lines.push(`${i.toString(16).padStart(4, '0')}  ${Array.from(chunk, (x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(47)}  ${Array.from(chunk, (x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}`);
    }
    detail.textContent = `#${p.no}  ${p.protocol}  ${p.src} → ${p.dst}\n${p.info}\n\n${lines.join('\n')}`;
  };
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    const hits: Packet[] = [];
    for (const p of cap.packets) {
      if (proto && p.protocol !== proto) continue;
      if (q && !`${p.src} ${p.dst} ${p.protocol} ${p.info}`.toLowerCase().includes(q)) continue;
      hits.push(p);
      if (hits.length >= LIMIT) break;
    }
    body.replaceChildren(
      ...hits.map((p) => {
        const row = h('tr', {}, h('td', { class: 'num' }, String(p.no)), h('td', { class: 'num' }, (p.time - t0).toFixed(6)), h('td', {}, p.src), h('td', {}, p.dst), h('td', {}, p.protocol), h('td', { class: 'num' }, String(p.length)), h('td', {}, p.info));
        row.addEventListener('click', () => show(p, row));
        return row;
      }),
    );
    note.textContent = [hits.length >= LIMIT ? s('shown').replace('{n}', LIMIT.toLocaleString()) : '', cap.truncated ? s('truncated') : ''].filter(Boolean).join(' ');
  };
  filter.addEventListener('input', draw);
  drawChips();
  draw();
  const start = t0 ? new Date(t0 * 1000).toLocaleString() : '';
  return {
    meta: () => [cap.format === 'pcapng' ? 'pcapng' : 'pcap', `${cap.packets.length.toLocaleString()} ${s('packets')}`, ...(start ? [`${s('started')} ${start}`] : [])],
  };
}
