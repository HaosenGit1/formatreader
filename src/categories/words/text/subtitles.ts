/** Subtitle parsers (no DOM, unit-tested). */

export interface Cue {
  start: string;
  end: string;
  text: string;
  speaker?: string;
}

const TIME = /(\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}/;

/** SRT and WebVTT. */
export function parseSrtVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [a, b] = lines[timeIdx].split('-->');
    const start = TIME.exec(a)?.[0];
    const end = TIME.exec(b)?.[0];
    if (!start || !end) continue;
    const body = lines
      .slice(timeIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    cues.push({ start: start.replace('.', ','), end: end.replace('.', ','), text: body });
  }
  return cues;
}

/** Advanced SubStation Alpha (.ass / .ssa). */
export function parseAss(text: string): Cue[] {
  const cues: Cue[] = [];
  let fields: string[] = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  let inEvents = false;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) {
      inEvents = /^\[events\]$/i.test(line);
      continue;
    }
    if (!inEvents) continue;
    const m = /^(Format|Dialogue)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    if (m[1].toLowerCase() === 'format') {
      fields = m[2].split(',').map((s) => s.trim().toLowerCase());
      continue;
    }
    const parts = m[2].split(',');
    const head = parts.slice(0, fields.length - 1);
    const rest = parts.slice(fields.length - 1).join(',');
    const get = (k: string) => head[fields.indexOf(k)]?.trim() ?? '';
    const body = rest
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/gi, '\n')
      .replace(/\\h/g, ' ')
      .trim();
    if (!body) continue;
    cues.push({ start: get('start'), end: get('end'), text: body, speaker: get('name') || undefined });
  }
  return cues;
}
