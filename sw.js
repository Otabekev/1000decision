/*
 * 1000 Decisions — service worker.
 * Caches the app shell so the page opens instantly and works offline.
 * Strategy: serve from cache, refresh the cache in the background.
 * Bump VERSION when shipping changes that must replace old caches.
 */
var VERSION = 'td-v6';
var ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/health.js',
  './js/insights.js',
  './js/battles.js',
  './js/record.js',
  './js/media.js',
  './js/card.js',
  './js/app.js',
  './js/onboarding.js',
  './js/finale.js',
  './js/trust.js',
  './css/fonts.css',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(req)
          .then(function (res) {
            if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch(function () { return cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined); });
        return cached || network;
      });
    })
  );
});
