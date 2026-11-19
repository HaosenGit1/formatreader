/**
 * Windows event log viewer: newest events first, filters by level and search, the event's
 * data and full XML on click. Common event IDs (logons, service changes, unexpected
 * shutdowns…) get a short description; full message texts live in Windows itself.
 */
import '../pcap/pcap.css';
import { h } from '../../../core/dom';
import { lang, strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { parseEvtx, toXml, type EventRecord } from './parse';

const s = strings({
  events: { en: 'events', zh: '条事件' },
  filter: { en: 'Filter: event ID, source, text…', zh: '筛选：事件 ID、来源、文字…' },
  time: { en: 'Time', zh: '时间' },
  level: { en: 'Level', zh: '级别' },
  id: { en: 'Event ID', zh: '事件 ID' },
  source: { en: 'Source', zh: '来源' },
  computer: { en: 'Computer', zh: '计算机' },
  details: { en: 'Details', zh: '详细信息' },
  all: { en: 'All', zh: '全部' },
  shown: { en: 'Showing the first {n} matches — narrow the filter to see others.', zh: '只显示前 {n} 条匹配结果——请缩小筛选范围查看其他。' },
  truncated: { en: 'Only the first 300,000 events are read.', zh: '只读取了前 300,000 条事件。' },
  damaged: { en: 'Some parts of this log are damaged and were skipped.', zh: '这个日志有部分损坏，已跳过。' },
  pick: { en: 'Click an event to see its data.', zh: '点击事件查看其数据。' },
  reading: { en: 'Reading events…', zh: '正在读取事件…' },
  noMessage: { en: 'The full message text is stored in Windows itself, not in the log; the event’s data is shown.', zh: '完整的消息文字保存在 Windows 系统里，而不在日志文件中；这里显示事件的数据。' },
});

const LEVELS: Record<number, [string, string]> = { 1: ['Critical', '严重'], 2: ['Error', '错误'], 3: ['Warning', '警告'], 4: ['Information', '信息'], 5: ['Verbose', '详细'] };
const levelName = (l: number) => (LEVELS[l === 0 ? 4 : l] ?? LEVELS[4])[lang() === 'zh' ? 1 : 0];

/** Short descriptions of frequent event IDs (by source family). */
const KNOWN: Record<string, Record<number, [string, string]>> = {
  security: {
    1102: ['Audit log cleared', '审计日志被清除'],
    4608: ['Windows starting up', 'Windows 正在启动'],
    4616: ['System time changed', '系统时间被更改'],
    4624: ['Logon succeeded', '登录成功'],
    4625: ['Logon failed', '登录失败'],
    4634: ['Logoff', '注销'],
    4647: ['User-initiated logoff', '用户主动注销'],
    4648: ['Logon with explicit credentials', '使用显式凭据登录'],
    4672: ['Special privileges assigned to logon', '为登录分配了特殊权限'],
    4688: ['Process created', '创建了进程'],
    4689: ['Process exited', '进程退出'],
    4697: ['Service installed', '安装了服务'],
    4719: ['Audit policy changed', '审计策略被更改'],
    4720: ['User account created', '创建了用户帐户'],
    4722: ['User account enabled', '启用了用户帐户'],
    4724: ['Password reset attempted', '尝试重置密码'],
    4725: ['User account disabled', '禁用了用户帐户'],
    4726: ['User account deleted', '删除了用户帐户'],
    4732: ['Member added to local group', '向本地组添加了成员'],
    4740: ['User account locked out', '用户帐户被锁定'],
    4776: ['Credential validation', '凭据验证'],
    5152: ['Packet blocked by Windows Firewall', 'Windows 防火墙阻止了数据包'],
    5156: ['Connection allowed by Windows Firewall', 'Windows 防火墙允许了连接'],
  },
  system: {
    41: ['Rebooted without a clean shutdown (Kernel-Power)', '未正常关机就重启（Kernel-Power）'],
    1074: ['Shutdown or restart initiated', '发起了关机或重启'],
    1076: ['Reason for unexpected shutdown', '意外关机的原因'],
    6005: ['Event Log service started (system start)', '事件日志服务已启动（系统启动）'],
    6006: ['Event Log service stopped (clean shutdown)', '事件日志服务已停止（正常关机）'],
    6008: ['Previous shutdown was unexpected', '上次关机是意外关机'],
    6013: ['System uptime', '系统运行时间'],
    7000: ['A service failed to start', '服务启动失败'],
    7001: ['A service depends on one that failed', '服务依赖的服务启动失败'],
    7009: ['Timeout waiting for a service', '等待服务超时'],
    7011: ['Service did not respond in time', '服务未及时响应'],
    7023: ['Service ended with an error', '服务因错误而终止'],
    7031: ['Service terminated unexpectedly', '服务意外终止'],
    7034: ['Service terminated unexpectedly', '服务意外终止'],
    7036: ['Service changed state', '服务状态改变'],
    7040: ['Service start type changed', '服务启动类型被更改'],
    7045: ['Service installed', '安装了服务'],
    1: ['Time changed / time sync', '时间更改／时间同步'],
    37: ['Time provider status', '时间提供程序状态'],
    129: ['Time sync unreachable', '无法进行时间同步'],
    19: ['Windows Update installed', 'Windows 更新已安装'],
    20: ['Windows Update failed', 'Windows 更新失败'],
  },
  application: {
    1000: ['Application crashed', '应用程序崩溃'],
    1001: ['Error report', '错误报告'],
    1002: ['Application stopped responding', '应用程序停止响应'],
    1026: ['.NET runtime error', '.NET 运行时错误'],
  },
};

function describe(r: EventRecord): string {
  const ch = r.channel.toLowerCase();
  const fam = ch === 'security' || /security-auditing/i.test(r.provider) ? 'security' : ch === 'system' ? 'system' : ch === 'application' ? 'application' : '';
  const k = (fam && KNOWN[fam][r.eventId]) || null;
  return k ? k[lang() === 'zh' ? 1 : 0] : '';
}

const fmtTime = (d: Date | null) => (d ? `${d.toLocaleDateString()} ${d.toLocaleTimeString()}` : '');
const dataLine = (r: EventRecord) => r.data.filter(([k, v]) => v && v !== '-' && k !== 'Binary').map(([k, v]) => (/^\d+$/.test(k) ? v : `${k}: ${v}`)).join(' · ');

const LIMIT = 3000;

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const log = await parseEvtx(await file.arrayBuffer(), (f) => ctx.progress?.(s('reading'), f));
  // Newest first, like Event Viewer.
  const recs = [...log.records].sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0) || b.id - a.id);
  const computers = new Set(recs.map((r) => r.computer).filter(Boolean));
  const channels = new Set(recs.map((r) => r.channel).filter(Boolean));
  const manyComputers = computers.size > 1;
  const counts = new Map<number, number>();
  for (const r of recs) counts.set(r.level === 0 ? 4 : r.level, (counts.get(r.level === 0 ? 4 : r.level) ?? 0) + 1);

  let level = 0;
  const filter = h('input', { type: 'search', class: 'pc-filter', placeholder: s('filter'), 'aria-label': s('filter') }) as HTMLInputElement;
  const chips = h('div', { class: 'pc-chips' });
  const body = h('tbody');
  const note = h('p', { class: 'pc-note' });
  const detail = h('pre', { class: 'pc-hex' }, s('pick'));
  const head = h('thead');
  const table = h('table', { class: 'pc-table' }, head, body);
  ctx.mount.replaceChildren(h('div', { class: 'view view-pcap' }, h('div', { class: 'pc-top' }, chips, filter), h('div', { class: 'pc-wrap' }, table), note, detail));

  const drawHead = () => head.replaceChildren(h('tr', {}, ...[s('time'), s('level'), s('id'), s('source'), ...(manyComputers ? [s('computer')] : []), s('details')].map((t) => h('th', {}, t))));
  const drawChips = () =>
    chips.replaceChildren(
      ...[[0, recs.length] as [number, number], ...[...counts].sort((a, b) => a[0] - b[0])].map(([l, n]) =>
        h('button', { type: 'button', class: `pc-chip${l === level ? ' active' : ''}`, onclick: () => ((level = l), drawChips(), draw()) }, `${l ? levelName(l) : s('all')} · ${n.toLocaleString()}`),
      ),
    );
  const show = (r: EventRecord, row: HTMLElement) => {
    for (const x of body.querySelectorAll('tr.sel')) x.classList.remove('sel');
    row.classList.add('sel');
    const what = describe(r);
    const lines = [`${fmtTime(r.time)}  ${levelName(r.level)}  ${r.provider}  ID ${r.eventId}${what ? ` — ${what}` : ''}`, '', ...r.data.map(([k, v]) => `${k.padEnd(22)} ${v}`), '', s('noMessage'), '', r.xml ? toXml(r.xml) : ''];
    detail.textContent = lines.join('\n');
  };
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    const hits: EventRecord[] = [];
    for (const r of recs) {
      if (level && (r.level === 0 ? 4 : r.level) !== level) continue;
      if (q && !`${r.eventId} ${r.provider} ${r.computer} ${describe(r)} ${dataLine(r)}`.toLowerCase().includes(q)) continue;
      hits.push(r);
      if (hits.length >= LIMIT) break;
    }
    body.replaceChildren(
      ...hits.map((r) => {
        const what = describe(r);
        const row = h(
          'tr',
          { class: `ev-l${r.level === 0 ? 4 : r.level}` },
          h('td', {}, fmtTime(r.time)),
          h('td', {}, levelName(r.level)),
          h('td', { class: 'num' }, String(r.eventId)),
          h('td', {}, r.provider.replace(/^Microsoft-Windows-/, '')),
          ...(manyComputers ? [h('td', {}, r.computer)] : []),
          h('td', { class: 'ev-detail' }, what ? h('strong', {}, what, ' ') : '', dataLine(r).slice(0, 240)),
        );
        row.addEventListener('click', () => show(r, row));
        return row;
      }),
    );
    note.textContent = [hits.length >= LIMIT ? s('shown').replace('{n}', LIMIT.toLocaleString()) : '', log.truncated ? s('truncated') : '', log.damagedChunks ? s('damaged') : ''].filter(Boolean).join(' ');
  };
  filter.addEventListener('input', draw);
  drawHead();
  drawChips();
  draw();
  return {
    meta: () => [...(channels.size === 1 ? [[...channels][0]] : []), `${recs.length.toLocaleString()} ${s('events')}`, ...(!manyComputers && computers.size ? [[...computers][0]] : [])],
    onLangChange: () => (drawHead(), drawChips(), draw()),
  };
}
