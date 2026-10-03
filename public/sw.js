/*
 * Service worker do web app Interlig (03/10/2026). Os dados mudam a cada
 * minuto e dependem do login, então NADA de dados é guardado em cache: a rede
 * sempre manda. O cache guarda só a página "sem conexão", mostrada quando uma
 * navegação falha por falta de internet.
 */
const CACHE = "interlig-shell-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/pwa/icone-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
