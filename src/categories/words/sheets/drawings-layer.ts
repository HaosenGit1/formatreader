/**
 * Puts a sheet's pictures, charts and text boxes over the grid, at the cells they are
 * anchored to in Excel. Positions come from the real table cells (columns here are sized to
 * their content, so things stay over the same cells as in Excel), and follow resizing.
 */
import { renderChart } from './chart';
import type { Drawing } from './drawings';

export function layDrawings(wrap: HTMLElement, list: Drawing[], openPicture: (d: Extract<Drawing, { kind: 'picture' }>) => void): () => void {
  const table = wrap.querySelector('table');
  if (!table) return () => {};
  const layer = document.createElement('div');
  layer.className = 'xl-layer';
  wrap.append(layer);
  const boxes = list.map((d) => {
    const box = document.createElement('div');
    box.className = `xl-item xl-${d.kind}`;
    box.hidden = true;
    if (d.kind === 'picture') {
      const img = document.createElement('img');
      img.src = d.url;
      img.alt = d.name;
      img.loading = 'lazy';
      img.title = d.name;
      box.append(img);
      box.addEventListener('click', () => openPicture(d));
    } else if (d.kind === 'text') box.textContent = d.text;
    layer.append(box);
    return { d, box, placed: false, chartSize: '' };
  });

  const place = () => {
    const tRect = table.getBoundingClientRect();
    const head = table.tHead?.rows[0];
    const body = table.tBodies[0];
    const ox = table.offsetLeft;
    const oy = table.offsetTop;
    const colX = (c: number, dx: number) => {
      const th = head?.cells[c + 1];
      if (!th) return null;
      const r = th.getBoundingClientRect();
      return r.left - tRect.left + ox + Math.min(dx, r.width - 1);
    };
    const rowY = (row: number, dy: number) => {
      const tr = body?.rows[row];
      if (!tr) return null;
      const r = tr.getBoundingClientRect();
      return r.top - tRect.top + oy + Math.min(dy, r.height - 1);
    };
    let waiting = 0;
    for (const b of boxes) {
      const { from, to, size } = b.d;
      const x = colX(from.col, from.dx);
      const y = rowY(from.row, from.dy);
      const x2 = to ? colX(to.col, to.dx) : x !== null ? x + (size?.w ?? 320) : null;
      const y2 = to ? rowY(to.row, to.dy) : y !== null ? y + (size?.h ?? 200) : null;
      if (x === null || y === null || x2 === null || y2 === null) {
        waiting++; // its rows are not drawn yet
        continue;
      }
      const w = Math.max(24, x2 - x);
      const h = Math.max(24, y2 - y);
      Object.assign(b.box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      b.box.hidden = false;
      b.placed = true;
      if (b.d.kind === 'chart') {
        const key = `${Math.round(w)}x${Math.round(h)}`;
        if (b.chartSize !== key) {
          b.chartSize = key;
          b.box.replaceChildren(renderChart(b.d.chart, w, h));
        }
      }
    }
    return waiting;
  };

  // Rows are drawn in batches: keep trying until every item has its cells.
  let tries = 0;
  let timer = 0;
  const retry = () => {
    if (place() > 0 && tries++ < 300) timer = window.setTimeout(retry, 100);
  };
  retry();
  const observer = new ResizeObserver(() => place());
  observer.observe(table);
  return () => {
    clearTimeout(timer);
    observer.disconnect();
    layer.remove();
  };
}
