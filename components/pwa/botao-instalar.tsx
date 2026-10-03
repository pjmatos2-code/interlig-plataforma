"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Instalar app": aparece só quando o navegador oferece a instalação
 * (Android/Chrome, Edge, Chrome no computador) e some depois de instalado.
 * No iPhone a instalação é pelo Safari: Compartilhar → Adicionar à Tela de Início.
 */
export function BotaoInstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    const oferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const instalado = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", oferecer);
    window.addEventListener("appinstalled", instalado);
    return () => {
      window.removeEventListener("beforeinstallprompt", oferecer);
      window.removeEventListener("appinstalled", instalado);
    };
  }, []);

  if (!evento) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await evento.prompt();
        await evento.userChoice.catch(() => null);
        setEvento(null);
      }}
      aria-label="Instalar app"
      title="Instalar app"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 p-2 text-xs font-semibold text-white hover:bg-white/20 sm:px-3 sm:py-1"
    >
      <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
      <span className="hidden sm:inline">Instalar app</span>
    </button>
  );
}
