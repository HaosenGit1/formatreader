/**
 * Sounds: the browser plays them (MP3, AAC/M4A, WAV, FLAC, OGG/Opus; AIFF in
 * Safari). Tags and cover art via music-metadata, a clickable waveform.
 */
import type { ViewerEntry } from '../../core/viewer';

const IDS = new Set(['mp3', 'aac', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'amr', 'wma', 'mka', 'mid', 'ape', 'ra']);

export const soundsViewers: ViewerEntry[] = [
  {
    id: 'sounds/audio',
    category: 'sounds',
    prefetch: true,
    mimes: /^audio\//,
    // .weba: WebM holding sound only.
    accepts: ({ format, ext }) => IDS.has(format?.id ?? '') || (format?.id === 'webm' && ext === 'weba'),
    load: () => import('./audio/view'),
  },
];
