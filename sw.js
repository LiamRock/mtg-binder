'use strict';
const SHELL = 'pocket-binder-shell-v4';
const IMAGES = 'pocket-binder-images-v1';
const SHELL_FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'mana/mana.css', 'mana/fonts/mana.woff2'];
const MAX_IMAGES = 500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== IMAGES && k !== 'pocket-binder-lib-v1').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGES) await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App files: try the network first so updates arrive, fall back to the saved copy offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // Card images: saved after first view so they show offline.
  if (url.hostname === 'cards.scryfall.io') {
    e.respondWith((async () => {
      const cache = await caches.open(IMAGES);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req.url, { mode: 'cors' });
        if (res.ok) { cache.put(req.url, res.clone()).then(() => trim(cache)); }
        return res;
      } catch (err) {
        return fetch(req);
      }
    })());
  }
  // Text-recognition files for the scanner: saved after first download.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith((async () => {
      const cache = await caches.open('pocket-binder-lib-v1');
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type !== 'opaque') cache.put(req.url, res.clone());
      return res;
    })());
    return;
  }
  // Everything else (the Scryfall API) goes straight to the network.
});
