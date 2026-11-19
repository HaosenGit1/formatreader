/**
 * Data: engineering and scientific recordings and datasets
 * (COMTRADE now; Parquet, Arrow, HDF5, NetCDF later).
 */
import type { ViewerEntry } from '../../core/viewer';
import { looksLikeCfg } from './comtrade/detect';

export const dataViewers: ViewerEntry[] = [
  {
    // Network captures (Wireshark / tcpdump): pcap and pcapng.
    id: 'data/pcap',
    category: 'data',
    layout: 'fill',
    mimes: /pcap|tcpdump/,
    accepts: ({ format }) => format?.id === 'pcap',
    load: () => import('./pcap/view'),
  },
  {
    id: 'data/comtrade',
    category: 'data',
    accepts: ({ format, ext, head }) =>
      format?.id === 'comtrade' || (ext === 'cfg' && looksLikeCfg(new TextDecoder('latin1').decode(head.subarray(0, 4096)))),
    load: () => import('./comtrade/view'),
  },
];
