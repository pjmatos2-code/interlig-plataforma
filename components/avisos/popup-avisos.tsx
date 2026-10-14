"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Megaphone } from "lucide-react";
import { confirmarLeitura } from "@/app/(app)/avisos/acoes";
import type { AvisoPendente } from "@/lib/avisos/dados";
import { cn } from "@/lib/utils";

/** texto com quebras de linha e links clicáveis (sem HTML do autor) */
function Texto({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="font-medium text-interlig-ceu underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Popup de avisos (14/10/2026): aparece em qualquer tela para quem recebeu e
 * só fecha com "Li e estou ciente" — a confirmação vai para o gestor. Aviso
 * novo chega sem recarregar (consulta a cada minuto e ao voltar para a aba).
 */
export function PopupAvisos({ iniciais }: { iniciais: AvisoPendente[] }) {
  const [avisos, setAvisos] = useState(iniciais);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const confirmados = useRef(new Set<string>());

  const atualizar = useCallback(async () => {
    try {
      const r = await fetch("/api/avisos/pendentes", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { avisos: AvisoPendente[] };
      setAvisos(j.avisos.filter((a) => !confirmados.current.has(a.id)));
    } catch {
      /* sem rede: tenta de novo no próximo ciclo */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(atualizar, 60_000);
    const vis = () => document.visibilityState === "visible" && atualizar();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [atualizar]);

  const atual = avisos[0];
  useEffect(() => {
    if (!atual) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botao.current?.focus();
    return () => {
      document.body.style.overflow = antes;
    };
  }, [atual]);

  if (!atual) return null;
  const importante = atual.importancia === "importante";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-interlig-marinho/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="aviso-titulo"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl"
      >
        <div className={cn("flex items-center gap-3 px-5 py-4 text-white", importante ? "bg-farol-vermelho" : "bg-interlig-azul")}>
          {importante ? <BellRing className="h-6 w-6 shrink-0" /> : <Megaphone className="h-6 w-6 shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
              {importante ? "Aviso importante" : "Aviso"}
              {avisos.length > 1 && ` · 1 de ${avisos.length}`}
            </p>
            <h2 id="aviso-titulo" className="break-words text-lg font-bold leading-snug">
              {atual.titulo}
            </h2>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <Texto texto={atual.mensagem} />
          <p className="mt-4 text-xs text-muted-foreground">
            {atual.autor ? `Enviado por ${atual.autor}` : "Enviado pela gestão"} · {dataHora(atual.criadoEm)}
          </p>
        </div>
        <div className="border-t bg-muted/30 px-5 py-4">
          {erro && <p className="mb-2 text-xs text-destructive">{erro}</p>}
          <button
            ref={botao}
            type="button"
            disabled={enviando}
            onClick={async () => {
              setEnviando(true);
              setErro(null);
              const r = await confirmarLeitura(atual.id);
              setEnviando(false);
              if (r.erro) return setErro("Não foi possível confirmar agora. Tente de novo.");
              confirmados.current.add(atual.id);
              setAvisos((l) => l.filter((a) => a.id !== atual.id));
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-interlig-azul text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60"
          >
            <CheckCircle2 className="h-5 w-5" />
            {enviando ? "Confirmando…" : "Li e estou ciente"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">A gestão recebe a confirmação da sua leitura.</p>
        </div>
      </div>
    </div>
  );
}
