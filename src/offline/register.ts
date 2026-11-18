/**
 * Offline support: registers the service worker (production builds only).
 * Viewers are stored as they are used; when FormatReader is installed as an
 * app, everything is stored so every format opens offline.
 */
export function registerOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      await navigator.serviceWorker.ready;
      const worker = reg.active ?? navigator.serviceWorker.controller;
      // After an update, bring back what this visitor kept offline (only changed files download).
      // Asked again when a new version takes over, since that version has the new files.
      const resume = (w: ServiceWorker | null | undefined) => {
        if (!w) return;
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => {
          if ((e.data as { restored?: number })?.restored) dispatchEvent(new Event('formatreader:offline-changed'));
        };
        w.postMessage('resume', [channel.port2]);
      };
      resume(worker);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        resume(navigator.serviceWorker.controller);
        dispatchEvent(new Event('formatreader:offline-changed'));
      });
      const installed = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (installed) {
        worker?.postMessage('cache-all');
        return;
      }
      // Every app file this page downloads (viewers pre-loaded in the background, or
      // fetched for a file) is stored too, including ones loaded before the worker started.
      if (!worker) return;
      let pending: string[] = [];
      let timer = 0;
      const send = (urls: string[]) => {
        pending.push(...urls.filter((u) => u.startsWith(location.origin)));
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (pending.length) worker.postMessage({ cache: pending });
          pending = [];
        }, 1000);
      };
      new PerformanceObserver((list) => send(list.getEntries().map((e) => e.name))).observe({ type: 'resource', buffered: true });
    } catch (err) {
      console.warn('Offline support unavailable', err);
    }
  };
  // After the page is up: never competes with the first file being opened.
  if (document.readyState === 'complete') setTimeout(start, 1500);
  else addEventListener('load', () => setTimeout(start, 1500), { once: true });
}
