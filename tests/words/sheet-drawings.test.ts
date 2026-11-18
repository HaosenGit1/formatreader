// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readDrawings, drawingExtent } from '../../src/categories/words/sheets/drawings';
import { renderChart } from '../../src/categories/words/sheets/chart';

describe('Excel pictures and charts', () => {
  test('finds the picture, both charts and the text box, anchored like Excel', async () => {
    const file = new Blob([readFileSync('samples/sheets/wind-report-charts.xlsx')]);
    const { bySheet } = await readDrawings(file);
    const list = bySheet.get('十月 October')!;
    expect(list.map((d) => d.kind)).toEqual(['picture', 'chart', 'chart', 'text']);
    const pic = list[0] as Extract<typeof list[number], { kind: 'picture' }>;
    expect(pic.from).toMatchObject({ col: 6, row: 0 });
    expect(pic.size).toEqual({ w: 96, h: 96 });
    expect(pic.blob.size).toBeGreaterThan(100);
    const bar = list[1] as Extract<typeof list[number], { kind: 'chart' }>;
    expect(bar.chart).toMatchObject({ type: 'column', title: '发电量 Energy (MWh)', stacked: false });
    expect(bar.chart.series.map((s) => s.name)).toEqual(['October', 'September']);
    expect(bar.chart.series[1].values).toEqual([398.1, 401.7, 120.4]);
    expect(bar.chart.series[0].categories).toEqual(['WTG-01', 'WTG-02', 'WTG-03']);
    expect((list[2] as Extract<typeof list[number], { kind: 'chart' }>).chart.type).toBe('pie');
    expect((list[3] as Extract<typeof list[number], { kind: 'text' }>).text).toContain('WTG-03 十月检修');
    expect(drawingExtent(list)).toEqual({ rows: 27, cols: 10 });
    expect(bySheet.has('Event log')).toBe(false);
  });

  test('charts draw one mark per value, in Excel colours', async () => {
    const { bySheet } = await readDrawings(new Blob([readFileSync('samples/sheets/wind-report-charts.xlsx')]));
    const bar = bySheet.get('十月 October')![1] as { chart: Parameters<typeof renderChart>[0] };
    const svg = renderChart(bar.chart, 400, 300);
    const bars = svg.querySelectorAll('rect.xl-chart-bar');
    expect(bars.length).toBe(6);
    expect(bars[0].getAttribute('fill')).toBe('#4472C4');
    expect(svg.textContent).toContain('WTG-02');
  });

  test('a workbook without drawings', async () => {
    const { bySheet } = await readDrawings(new Blob([readFileSync('samples/sheets/wind-report.xlsx')]));
    expect(bySheet.size).toBe(0);
  });
});
