/**
 * How the Text viewer shows a file: subtitles, rendered Markdown/HTML, or
 * plain reading text. (Code, JSON and tables have their own viewers.)
 */

export type TextKind =
  | { kind: 'subtitle'; format: 'srt' | 'vtt' | 'ass' }
  | { kind: 'markdown' }
  | { kind: 'html' }
  | { kind: 'plain' };

function sniffContent(text: string): TextKind | null {
  const t = text.slice(0, 4000).replace(/^﻿/, '').trimStart();
  if (/^WEBVTT/.test(t)) return { kind: 'subtitle', format: 'vtt' };
  if (/^\[Script Info\]/i.test(t)) return { kind: 'subtitle', format: 'ass' };
  if (/^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}/.test(t)) return { kind: 'subtitle', format: 'srt' };
  if (/^<!doctype html|^<html[\s>]/i.test(t)) return { kind: 'html' };
  return null;
}

export function classifyText(fileName: string, text: string): TextKind {
  const base = (fileName.split(/[\\/]/).pop() ?? fileName).toLowerCase();
  const ext = /\.([a-z0-9_+-]{1,16})$/i.exec(base)?.[1] ?? '';

  if (ext === 'srt') return { kind: 'subtitle', format: 'srt' };
  if (ext === 'vtt') return { kind: 'subtitle', format: 'vtt' };
  if (ext === 'ass' || ext === 'ssa') return { kind: 'subtitle', format: 'ass' };
  if (['md', 'markdown', 'mdown', 'mkd', 'mdx'].includes(ext)) return { kind: 'markdown' };
  if (['html', 'htm', 'xhtml', 'shtml', 'mhtml'].includes(ext)) return { kind: 'html' };
  // .txt and friends are what people read as books: never reinterpret them.
  if (['txt', 'text', 'log', 'nfo', 'diz'].includes(ext)) return { kind: 'plain' };
  return sniffContent(text) ?? { kind: 'plain' };
}
