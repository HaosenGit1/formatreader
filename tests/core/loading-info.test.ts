// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { loadingInfo } from '../../src/core/loading-info';

const text = { slow: 'slow', keepWaiting: 'Keep waiting', stop: 'Stop' };

describe('loading progress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('shows step, percentage, file and a running timer', () => {
    const cover = document.createElement('div');
    document.body.append(cover);
    const l = loadingInfo(cover, 'big.dxf', 150 * 1024 * 1024, text, () => {});
    l.set('Reading the drawing…', 0.42);
    vi.advanceTimersByTime(3100);
    expect(cover.querySelector('.loading-step')!.textContent).toBe('Reading the drawing… 42%');
    expect((cover.querySelector('.loading-bar span') as HTMLElement).style.width).toBe('42%');
    expect(cover.querySelector('.loading-file')!.textContent).toContain('0:03');
    expect((cover.querySelector('.loading-info') as HTMLElement).hidden).toBe(false);
    l.done();
  });

  test('watchdog: appears after 30 s without progress, Keep waiting hides it for 30 s, Stop stops', () => {
    const cover = document.createElement('div');
    document.body.append(cover);
    const stop = vi.fn();
    const l = loadingInfo(cover, 'x.xlsx', 1, text, stop);
    const watch = cover.querySelector('.loading-watch') as HTMLElement;
    l.set('Reading…');
    vi.advanceTimersByTime(29000);
    expect(watch.hidden).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(watch.hidden).toBe(false);
    (watch.querySelectorAll('button')[0] as HTMLButtonElement).click(); // Keep waiting
    expect(watch.hidden).toBe(true);
    vi.advanceTimersByTime(20000);
    expect(watch.hidden).toBe(true);
    vi.advanceTimersByTime(11000);
    expect(watch.hidden).toBe(false);
    (watch.querySelectorAll('button')[1] as HTMLButtonElement).click(); // Stop
    expect(stop).toHaveBeenCalled();
    l.done();
  });

  test('moving progress keeps the watchdog away', () => {
    const cover = document.createElement('div');
    document.body.append(cover);
    const l = loadingInfo(cover, 'x', 1, text, () => {});
    for (let i = 0; i < 60; i++) {
      l.set('Preparing rows…', i / 60);
      vi.advanceTimersByTime(1000);
    }
    expect((cover.querySelector('.loading-watch') as HTMLElement).hidden).toBe(true);
    l.done();
  });
});
