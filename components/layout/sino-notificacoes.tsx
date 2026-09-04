"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { listarNotificacoes, marcarLidas, type Notificacao } from "@/lib/notificacoes/acoes";
import { cn } from "@/lib/utils";

const INTERVALO_MS = 15_000;

function tempoRelativo(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

// ---------------------------------------------------------------------------
// Som de campainha (Web Audio, sem arquivo) — dois toques suaves.
// Navegadores exigem um gesto do usuário antes de tocar som; o contexto é
// "destravado" no primeiro clique/tecla da sessão.
// ---------------------------------------------------------------------------
let audioCtx: AudioContext | null = null;
function destravarAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* sem suporte: segue sem som */
  }
}
function tocarCampainha() {
  try {
    if (!audioCtx || audioCtx.state !== "running") return;
    const agora = audioCtx.currentTime;
    for (const [freq, inicio] of [
      [880, 0],
      [1174.7, 0.18],
    ] as const) {
      const osc = audioCtx.createOscillator();
      const ganho = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0, agora + inicio);
      ganho.gain.linearRampToValueAtTime(0.18, agora + inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.001, agora + inicio + 0.45);
      osc.connect(ganho).connect(audioCtx.destination);
      osc.start(agora + inicio);
      osc.stop(agora + inicio + 0.5);
    }
  } catch {
    /* silencioso */
  }
}

/** Pop-up do sistema (Notification API) — aparece mesmo com a aba em 2º plano. */
function notificarSistema(n: Notificacao) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const alerta = new Notification(n.titulo, {
      body: n.descricao ?? "",
      icon: "/icon.svg",
      tag: n.id, // evita duplicar o mesmo aviso
    });
    alerta.onclick = () => {
      window.focus();
      if (n.link) window.location.href = n.link;
      alerta.close();
    };
  } catch {
    /* silencioso */
  }
}

export function SinoNotificacoes() {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [toasts, setToasts] = useState<Notificacao[]>([]);
  const vistos = useRef<Set<string> | null>(null); // null = ainda não carregou a 1ª vez
  const box = useRef<HTMLDivElement>(null);

  const puxar = useCallback(async () => {
    try {
      const { itens, naoLidas } = await listarNotificacoes();
      setItens(itens);
      setNaoLidas(naoLidas);
      // toast só para o que chegou DEPOIS do 1º carregamento
      if (vistos.current) {
        const novos = itens.filter((n) => !vistos.current!.has(n.id) && !n.lida);
        if (novos.length > 0) {
          setToasts((t) => [...novos.slice(0, 3), ...t].slice(0, 4));
          novos.forEach((n) =>
            setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 7000)
          );
          tocarCampainha(); // 🔔 som
          novos.slice(0, 3).forEach(notificarSistema); // pop-up do sistema
        }
      }
      vistos.current = new Set(itens.map((n) => n.id));
    } catch {
      /* silencioso: rede/instabilidade não deve quebrar o header */
    }
  }, []);

  useEffect(() => {
    puxar();
    const id = setInterval(puxar, INTERVALO_MS);
    // destrava o som e pede permissão do pop-up no 1º gesto do usuário
    const primeiroGesto = () => {
      destravarAudio();
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      } catch {
        /* sem suporte */
      }
      document.removeEventListener("pointerdown", primeiroGesto);
      document.removeEventListener("keydown", primeiroGesto);
    };
    document.addEventListener("pointerdown", primeiroGesto);
    document.addEventListener("keydown", primeiroGesto);
    return () => {
      clearInterval(id);
      document.removeEventListener("pointerdown", primeiroGesto);
      document.removeEventListener("keydown", primeiroGesto);
    };
  }, [puxar]);

  // fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  async function abrir() {
    const vai = !aberto;
    setAberto(vai);
    if (vai && naoLidas > 0) {
      setNaoLidas(0);
      setItens((xs) => xs.map((n) => ({ ...n, lida: true })));
      await marcarLidas();
    }
  }

  return (
    <>
      <div ref={box} className="relative">
        <button
          onClick={abrir}
          aria-label="Notificações"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
        >
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </button>

        {aberto && (
          <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-black/10 bg-white text-slate-900 shadow-2xl">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">Notificações</div>
            <div className="max-h-96 overflow-y-auto">
              {itens.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">Nada por aqui ainda.</p>
              ) : (
                itens.map((n) => {
                  const corpo = (
                    <div
                      className={cn(
                        "flex flex-col gap-0.5 border-b px-4 py-2.5 last:border-0",
                        !n.lida && "bg-sky-50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{n.titulo}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {tempoRelativo(n.criado_em)}
                        </span>
                      </div>
                      {n.descricao && (
                        <span className="truncate text-xs text-slate-500">{n.descricao}</span>
                      )}
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => setAberto(false)} className="block hover:bg-slate-50">
                      {corpo}
                    </Link>
                  ) : (
                    <div key={n.id}>{corpo}</div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* toasts flutuantes para o que acabou de chegar */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((n) => {
          const conteudo = (
            <div className="pointer-events-auto rounded-xl border border-black/10 bg-white p-3 text-slate-900 shadow-2xl">
              <p className="text-sm font-semibold">{n.titulo}</p>
              {n.descricao && <p className="mt-0.5 truncate text-xs text-slate-500">{n.descricao}</p>}
            </div>
          );
          return n.link ? (
            <Link key={n.id} href={n.link} onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}>
              {conteudo}
            </Link>
          ) : (
            <div key={n.id}>{conteudo}</div>
          );
        })}
      </div>
    </>
  );
}
