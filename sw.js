const CACHE = "ivj2-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./legacy.html",
  "./styles/app.css",
  "./src/main.js",
  "./src/core/store.js",
  "./src/core/mixer.js",
  "./src/core/effects.js",
  "./src/core/audio.js",
  "./src/discovery/prompt-planner.js",
  "./src/discovery/ai-planner.js",
  "./src/discovery/invidious-source.js",
  "./src/ui/render.js",
  "./assets/icon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    }))
  );
});
