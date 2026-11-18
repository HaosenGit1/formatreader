import './style.css';
import { allViewers } from './categories';
import { startAnalytics } from './core/analytics';
import { startApp } from './core/shell';
import { registerOffline } from './offline/register';

// Portable file opened from disk: ebook pages are loaded into their frames directly (see scripts/patch-deps.mjs).
if (import.meta.env.MODE === 'portable' && location.protocol === 'file:') (globalThis as { __formatreaderSrcdoc?: boolean }).__formatreaderSrcdoc = true;
startApp(allViewers);
registerOffline();
startAnalytics('FormatReader');
