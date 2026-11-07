'use strict';
// La versione la scrive build.py: se cambia un file, la cache si rifà da sola.
const CACHE = 'tavola-f75e13553845';
const FILE = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'fonts/caprasimo.woff2', 'fonts/atkinson-400.woff2', 'fonts/atkinson-700.woff2',
  'icons/apple-180.png', 'icons/icona-192.png', 'icons/icona-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(c => c.addAll(FILE)),
      caches.open('tavola-dati').then(c => c.add('dati.bin')),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x.startsWith('tavola-') && x !== CACHE && x !== 'tavola-dati').map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // I contenuti: subito l'ultima copia, anche con poco campo, e intanto si aggiorna per la prossima volta.
  if (url.pathname.endsWith('dati.bin')) {
    e.respondWith(caches.open('tavola-dati').then(async c => {
      const copia = await c.match('dati.bin');
      const rete = fetch(e.request, { cache: 'no-cache' }).then(r => {
        if (r.ok) c.put('dati.bin', r.clone());
        return r;
      });
      if (copia) { e.waitUntil(rete.catch(() => {})); return copia; }
      return rete;
    }));
    return;
  }

  // Il guscio dell'app: dalla cache, funziona offline.
  e.respondWith(
    caches.match(e.request.mode === 'navigate' ? 'index.html' : e.request, { ignoreSearch: true })
      .then(r => r || fetch(e.request))
  );
});
