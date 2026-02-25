/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
// Source: https://github.com/gzuidhof/coi-serviceworker
// Injects COOP/COEP headers via Service Worker so SharedArrayBuffer
// works on static hosts (GitHub Pages, Netlify, Cloudflare Pages, etc.)
// The Vite dev server sets these headers directly — this file is only
// needed in production.

if (typeof window === 'undefined') {
  // ── Service Worker scope ─────────────────────────────────────────
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  async function handleFetch(request) {
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
      return new Response();
    }
    const r = await fetch(request);
    if (r.status === 0) return r;

    const newHeaders = new Headers(r.headers);
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
    newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return new Response(r.body, {
      status: r.status,
      statusText: r.statusText,
      headers: newHeaders,
    });
  }

  self.addEventListener('fetch', (event) => {
    event.respondWith(handleFetch(event.request));
  });

} else {
  // ── Main thread: register the service worker ─────────────────────
  (async function () {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.register(
        window.location.pathname.replace(/[^/]*$/, '') + 'coi-serviceworker.js'
      ).catch((e) => console.warn('coi-serviceworker registration failed:', e));

      if (registration && !navigator.serviceWorker.controller) {
        // First load: SW just installed, need to reload so it takes effect
        window.location.reload();
      }
    }
  })();
}
