const CACHE_NAME = "subflow-v8";
const APP_SHELL = ["./", "./manifest.webmanifest", "./apple-touch-icon.png?v=2", "./icon-192.png?v=2", "./icon-512.png?v=2", "./og.png", "./clients/surge.png", "./clients/shadowrocket.png", "./clients/clash-stash.png", "./clients/loon.png", "./clients/quantumult-x.png", "./clients/hiddify.png", "./clients/egern.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // A new worker pre-caches HTML and its hashed JS/CSS as one version.
    // Never replace only the cached HTML: that can point at assets which are
    // not available yet when the device goes offline between deployments.
    event.respondWith(caches.match("./").then(cached => cached || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
