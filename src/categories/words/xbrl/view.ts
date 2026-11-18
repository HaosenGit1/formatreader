/**
 * XBRL / Inline XBRL financial reports: key figures, the numbers by period (point-in-time
 * items like the balance sheet; period items like income and cash flows), every fact in a
 * searchable table, and — for iXBRL — the report itself with scripts blocked.
 */
import './xbrl.css';
import { h } from '../../../core/dom';
import { lang, strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { isSource, readText } from '../shared/read';
import { KEY_FIGURES, label, parseReport, periodKey, periodLabel, type Fact, type Report } from './parse';

const s = strings({
  xbrl: { en: 'XBRL financial report', zh: 'XBRL 财务报告' },
  ixbrl: { en: 'Inline XBRL report', zh: 'Inline XBRL 财务报告' },
  key: { en: 'Key figures', zh: '主要数据' },
  instant: { en: 'Point in time (balance sheet items)', zh: '时点数（资产负债表项目）' },
  duration: { en: 'For a period (income statement, cash flow items)', zh: '期间数（利润表、现金流量表项目）' },
  text: { en: 'Text facts', zh: '文字信息' },
  allFacts: { en: 'All facts', zh: '全部数据' },
  concept: { en: 'Item', zh: '项目' },
  period: { en: 'Period', zh: '期间' },
  value: { en: 'Value', zh: '数值' },
  unit: { en: 'Unit', zh: '单位' },
  dims: { en: 'Dimensions', zh: '维度' },
  data: { en: 'Data', zh: '数据' },
  document: { en: 'Document', zh: '原文' },
  search: { en: 'Search facts', zh: '搜索数据' },
  copy: { en: 'Copy table', zh: '复制表格' },
  copied: { en: 'Copied', zh: '已复制' },
  facts: { en: 'facts', zh: '项数据' },
  labelsNote: { en: 'Item names are made from the taxonomy’s concept names (the official label files are separate downloads). Hover an item to see its concept.', zh: '项目名称由分类标准的元素名生成（官方标签文件需要单独下载）。鼠标悬停可查看元素名。' },
});

const fmt = (f: Fact) => (f.num !== undefined ? f.num.toLocaleString(undefined, { maximumFractionDigits: Math.max(0, Math.min(6, Number(f.decimals) || 0)) }) : f.value);

function pivot(facts: Fact[], kind: 'instant' | 'duration'): HTMLElement | null {
  const rows = facts.filter((f) => f.num !== undefined && !f.dims.length && (kind === 'instant' ? !!f.period.instant : !f.period.instant));
  if (!rows.length) return null;
  const periods = [...new Map(rows.map((f) => [periodKey(f.period), f.period])).entries()].sort((a, b) => (b[1].instant ?? b[1].end ?? '').localeCompare(a[1].instant ?? a[1].end ?? '')).slice(0, 4);
  const concepts = [...new Set(rows.map((f) => f.concept))];
  const cell = (c: string, pk: string) => rows.find((f) => f.concept === c && periodKey(f.period) === pk);
  return h(
    'section',
    { class: 'xb-section' },
    h('h3', {}, s(kind)),
    h(
      'div',
      { class: 'xb-wrap' },
      h(
        'table',
        { class: 'xb-table' },
        h('thead', {}, h('tr', {}, h('th', {}, s('concept')), ...periods.map(([, p]) => h('th', { class: 'num' }, periodLabel(p))))),
        h(
          'tbody',
          {},
          ...concepts.map((c) =>
            h('tr', {}, h('td', { title: c }, label(c.split(':').pop()!)), ...periods.map(([pk]) => {
              const f = cell(c, pk);
              return h('td', { class: 'num' }, f ? `${fmt(f)}${f.unit && !/^[A-Z]{3}$/.test(f.unit) ? ` ${f.unit}` : ''}` : '');
            })),
          ),
        ),
      ),
    ),
  );
}

function render(rep: Report, query: string): HTMLElement {
  const zh = lang() === 'zh';
  const key = KEY_FIGURES.map(([en, cn, names]) => {
    const f = rep.facts
      .filter((x) => names.includes(x.local) && !x.dims.length && x.num !== undefined)
      .sort((a, b) => (b.period.instant ?? b.period.end ?? '').localeCompare(a.period.instant ?? a.period.end ?? ''))[0];
    return f ? h('div', { class: 'xb-card', title: f.concept }, h('span', {}, zh ? cn : en), h('strong', {}, `${fmt(f)}${f.unit ? ` ${f.unit}` : ''}`), h('small', {}, periodLabel(f.period))) : null;
  }).filter(Boolean) as HTMLElement[];
  const q = query.toLowerCase();
  const shown = rep.facts.filter((f) => !q || `${f.concept} ${label(f.local)} ${f.value} ${f.dims.map((d) => d.join(' ')).join(' ')}`.toLowerCase().includes(q));
  const texts = rep.facts.filter((f) => f.num === undefined && f.value && f.value.length < 400).slice(0, 60);
  return h(
    'div',
    { class: 'xb' },
    h('header', { class: 'xb-head' }, h('p', { class: 'xb-kind' }, s(rep.inline ? 'ixbrl' : 'xbrl')), h('h2', {}, rep.entity ?? '—'), h('p', { class: 'xb-sub' }, [rep.documentType, rep.periodEnd].filter(Boolean).join(' · '))),
    key.length ? h('section', { class: 'xb-section' }, h('h3', {}, s('key')), h('div', { class: 'xb-cards' }, ...key)) : null,
    pivot(rep.facts, 'instant'),
    pivot(rep.facts, 'duration'),
    texts.length ? h('details', { class: 'xb-section' }, h('summary', {}, `${s('text')} (${texts.length})`), h('dl', { class: 'xb-texts' }, ...texts.flatMap((f) => [h('dt', { title: f.concept }, label(f.local)), h('dd', {}, f.value)]))) : null,
    h(
      'details',
      { class: 'xb-section', open: !!q },
      h('summary', {}, `${s('allFacts')} (${shown.length}${q ? ` / ${rep.facts.length}` : ''})`),
      h(
        'div',
        { class: 'xb-wrap' },
        h(
          'table',
          { class: 'xb-table' },
          h('thead', {}, h('tr', {}, ...['concept', 'period', 'value', 'unit', 'dims'].map((k) => h('th', {}, s(k as 'concept'))))),
          h('tbody', {}, ...shown.slice(0, 5000).map((f) => h('tr', {}, h('td', { title: f.concept }, label(f.local)), h('td', {}, periodLabel(f.period)), h('td', { class: f.num !== undefined ? 'num' : undefined }, fmt(f)), h('td', {}, f.unit ?? ''), h('td', {}, f.dims.map(([d, v]) => `${d.split(':').pop()}=${v.split(':').pop()}`).join(', '))))),
        ),
      ),
    ),
    h('p', { class: 'xb-note' }, s('labelsNote')),
  );
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount, undefined, ctx.progress);
  if (!isSource(src)) return src;
  const rep = parseReport(src.text);
  if (!rep) return (await import('../code/view')).open(file, ctx);

  const search = h('input', { type: 'search', class: 'xb-search', placeholder: s('search'), 'aria-label': s('search') }) as HTMLInputElement;
  const body = h('div', { class: 'xb-body' });
  let tab: 'data' | 'document' = 'data';
  const draw = () => {
    if (tab === 'data') body.replaceChildren(render(rep, search.value));
    else {
      // The report as published, with no scripts (sandbox without allow-scripts).
      const frame = h('iframe', { class: 'xb-doc', sandbox: '', title: file.name }) as HTMLIFrameElement;
      frame.srcdoc = rep.html ?? '';
      body.replaceChildren(frame);
    }
  };
  search.addEventListener('input', draw);
  ctx.mount.replaceChildren(h('div', { class: 'view view-xbrl' }, body));
  draw();
  const tabs = rep.inline
    ? h('div', { class: 'seg', role: 'tablist' }, ...(['data', 'document'] as const).map((t) => h('button', { type: 'button', class: t === tab ? 'active' : '', onclick: (e: Event) => { tab = t; for (const b of tabs!.children) b.classList.toggle('active', b === e.currentTarget); draw(); } }, s(t))))
    : null;
  const copyBtn = h('button', { type: 'button', class: 'btn' }, s('copy')) as HTMLButtonElement;
  copyBtn.addEventListener('click', () => {
    const rows = [['Concept', 'Label', 'Period', 'Value', 'Unit', 'Dimensions'], ...rep.facts.map((f) => [f.concept, label(f.local), periodLabel(f.period), f.num !== undefined ? String(f.num) : f.value.replace(/[\t\n]/g, ' '), f.unit ?? '', f.dims.map((d) => d.join('=')).join('; ')])];
    navigator.clipboard?.writeText(rows.map((r) => r.join('\t')).join('\n')).then(() => {
      copyBtn.textContent = s('copied');
      setTimeout(() => (copyBtn.textContent = s('copy')), 1500);
    });
  });
  return {
    title: rep.entity,
    meta: () => [s(rep.inline ? 'ixbrl' : 'xbrl'), `${rep.facts.length} ${s('facts')}`, file.name],
    tools: () => [...(tabs ? [tabs] : []), search, copyBtn],
    about: () => src.about(),
    onLangChange: draw,
  };
}
