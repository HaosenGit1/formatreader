// The one exception to "data only goes to this site": anonymous visit statistics
// (Google Analytics 4) on the website build, when VITE_GA_ID is set. The source
// index.html keeps the strict rule (tests/core/read-only.test.ts); this adds
// Google's analytics servers at build time, and nothing else.
// Server list: https://developers.google.com/tag-platform/security/guides/csp

export const GA_SOURCES = {
  'script-src': ['https://www.googletagmanager.com'],
  'connect-src': ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'],
  'img-src': ['https://*.google-analytics.com', 'https://www.googletagmanager.com'],
};

/** Returns the page with Google Analytics' servers added to its Content-Security-Policy. */
export function withAnalyticsCsp(html) {
  let changed = 0;
  const out = html.replace(/(Content-Security-Policy"\s+content=")([^"]+)(")/, (_m, a, csp, b) => {
    const parts = csp.split(';').map((d) => {
      const name = d.trim().split(/\s+/)[0];
      const add = GA_SOURCES[name];
      if (!add) return d;
      changed++;
      return `${d.trimEnd()} ${add.join(' ')}`;
    });
    return a + parts.join(';') + b;
  });
  if (changed !== Object.keys(GA_SOURCES).length) throw new Error('analytics: could not find script-src, connect-src and img-src in the page CSP');
  return out;
}
