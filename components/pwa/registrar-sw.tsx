"use client";

import { useEffect } from "react";

/** Registra o service worker do web app (instalação e página sem conexão). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sem service worker a plataforma funciona normal, só não instala */
    });
  }, []);
  return null;
}
