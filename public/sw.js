// Minimaler Service Worker für den Offline-Start der App-Hülle.
// Daten (Datenbank), Schriften, Bilder und /api/ laufen immer online und werden hier nicht angefasst.
const CACHE = "wochenplan-v2";
const SHELL = ["/", "/index.html", "/manifest.json", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Datenbank, Google Fonts, fremde Bilder: unverändert
  if (url.pathname.startsWith("/api/")) return;                 // KI-Funktion immer live
  if (req.destination === "image" && !SHELL.includes(url.pathname)) return; // Rezeptfotos nicht cachen

  // App-Hülle: erst Netz, bei Ausfall die gecachte Startseite
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/index.html", copy)); } return res; })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Gebaute Assets (Hash im Namen) und Hüllendateien: erst Cache, sonst Netz und merken
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
