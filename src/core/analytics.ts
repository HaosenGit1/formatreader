/**
 * Anonymous visit statistics (Google Analytics 4), website build only.
 *
 * Privacy rules (tests/core/analytics.test.ts):
 * - Never a file name, file content or folder name. The page title the app shows
 *   contains the open file's name, so every hit is sent with a fixed title instead.
 * - Opening a file sends only which viewer showed it and a short extension ("xlsx").
 * - Off in development, in the portable single file, and when no ID is configured.
 * The page's security rule allows Google's analytics servers only in that same
 * website build (scripts/analytics-csp.mjs).
 */

type Gtag = (...args: unknown[]) => void;

const ID: string = import.meta.env.VITE_GA_ID ?? '';
let gtag: Gtag | null = null;

/** The ID is used only if it has the shape of a GA4 measurement ID. */
export function validId(id: string | undefined): id is string {
  return /^G-[A-Z0-9]{4,20}$/.test(id ?? '');
}

/** Settings sent with every hit: fixed title and address, no ads features. */
export function baseParams(pageTitle: string, origin: string, pathname: string): Record<string, unknown> {
  return {
    page_title: pageTitle,
    page_location: origin + pathname, // never a query string or #hash
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  };
}

/** What "a file was opened" may tell: the viewer and a plain short extension, nothing else. */
export function openFileParams(viewerId: string, fileName: string): { viewer: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  const raw = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const ext = /^[a-z0-9]{1,8}$/.test(raw) ? raw : raw ? 'other' : 'none';
  const viewer = /^[a-z0-9/_-]{1,40}$/.test(viewerId) ? viewerId : 'other';
  return { viewer, ext };
}

/** Starts analytics after the page is up (not part of the first load). */
export function startAnalytics(pageTitle: string): void {
  if (!import.meta.env.PROD || import.meta.env.MODE === 'portable' || !validId(ID)) return;
  if (location.protocol !== 'https:') return;
  const w = window as unknown as { dataLayer: unknown[] };
  w.dataLayer = w.dataLayer || [];
  // gtag.js expects the `arguments` object itself, as in Google's snippet.
  gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  const params = baseParams(pageTitle, location.origin, location.pathname);
  gtag('js', new Date());
  gtag('set', params); // also applies to automatic events (scrolls, outbound clicks)
  // Google's automatic page view reads the browser's title, which names the open file
  // once one is shown (gtag.js loads after the page is up). Send our own instead.
  gtag('config', ID, { ...params, send_page_view: false });
  gtag('event', 'page_view', params);
  const load = () => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
    document.head.append(s);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 1500);
}

/** A file was opened: viewer id and extension only. */
export function trackOpen(viewerId: string, fileName: string): void {
  gtag?.('event', 'open_file', openFileParams(viewerId, fileName));
}
