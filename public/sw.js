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

/*
 * InterChat (16/10/2026): aviso de mensagem nova em todos os dispositivos.
 * Com a plataforma aberta e em foco o próprio chat avisa na tela — exceto no
 * Safari (Mac/iPhone), que exige mostrar a notificação a cada push.
 */
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { titulo: "InterChat", corpo: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    (async () => {
      const ua = self.navigator.userAgent || "";
      const safari = /Safari/.test(ua) && !/Chrome|Chromium|Android|Edg/.test(ua);
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const emFoco = janelas.some((c) => c.focused && c.visibilityState === "visible");
      if (self.navigator.setAppBadge) self.navigator.setAppBadge().catch(() => {});
      if (emFoco && !safari) return;
      await self.registration.showNotification(d.titulo || "InterChat", {
        body: d.corpo || "Nova mensagem",
        tag: d.tag || "interchat",
        renotify: true,
        icon: "/pwa/icone-192.png",
        badge: "/pwa/icone-192.png",
        data: { url: d.url || "/interchat" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/interchat";
  e.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of janelas) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
