"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutList, Maximize, Minimize, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Moldura do Modo Apresentação (diretoria e equipe): barra superior, seção
 * atual, sumário, navegação por botões e teclado, tela cheia e retorno ao GRR.
 * Navegar não grava nada.
 */

export type Secao = { readonly chave: string; readonly titulo: string };

/** seção atual, guardada no endereço (#chave) para sobreviver ao recarregar */
export function useSecao(secoes: readonly Secao[]) {
  const [atual, setAtual] = useState(0);
  useEffect(() => {
    const i = secoes.findIndex((s) => `#${s.chave}` === window.location.hash);
    if (i > 0) setAtual(i);
  }, [secoes]);
  const ir = useCallback(
    (i: number) => {
      const novo = Math.max(0, Math.min(secoes.length - 1, i));
      setAtual(novo);
      try {
        history.replaceState(null, "", `#${secoes[novo].chave}`);
      } catch {
        /* sem histórico: segue sem guardar a seção */
      }
    },
    [secoes]
  );
  return { atual, ir };
}

export function Sobreposicao({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={titulo} onClick={aoFechar}>
      <div className="max-h-full w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{titulo}</h3>
          <button type="button" onClick={aoFechar} className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm hover:border-interlig-ceu" autoFocus>
            <X className="h-4 w-4" aria-hidden /> Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Moldura({
  titulo,
  subtitulo,
  secoes,
  telas,
  hrefVoltar,
  atual,
  ir,
  sobreposicao,
  aoFecharSobreposicao,
}: {
  titulo: string;
  subtitulo: string;
  secoes: readonly Secao[];
  telas: React.ReactNode[];
  hrefVoltar: string;
  atual: number;
  ir: (i: number) => void;
  sobreposicao?: React.ReactNode;
  aoFecharSobreposicao?: () => void;
}) {
  const [sumario, setSumario] = useState(false);
  const [cheia, setCheia] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const total = secoes.length;
  const aberta = !!sobreposicao;

  const irPara = useCallback(
    (i: number) => {
      ir(i);
      setSumario(false);
      conteudo.current?.scrollTo({ top: 0 });
    },
    [ir]
  );

  const alternarTelaCheia = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else raiz.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const aoMudar = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  // teclado: setas, Page Up/Down, espaço, Home/End, F para tela cheia, Esc fecha o que estiver aberto
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        aoFecharSobreposicao?.();
        setSumario(false);
        return;
      }
      if (aberta || sumario) return;
      if (["ArrowRight", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) {
        e.preventDefault();
        irPara(atual + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey)) {
        e.preventDefault();
        irPara(atual - 1);
      } else if (e.key === "Home") irPara(0);
      else if (e.key === "End") irPara(total - 1);
      else if (e.key === "f" || e.key === "F") alternarTelaCheia();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atual, aberta, sumario, irPara, total, alternarTelaCheia, aoFecharSobreposicao]);

  return (
    <div ref={raiz} className="flex h-dvh flex-col bg-slate-100">
      {/* barra superior */}
      <header className="flex shrink-0 items-center gap-3 bg-interlig-marinho px-3 py-2 text-white sm:px-5">
        <Image src="/marca/logo-fundo-escuro.png" alt="Interlig" width={120} height={36} className="hidden h-7 w-auto sm:block" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="truncate text-xs tabular-nums text-white/70">
            {subtitulo}
          </p>
        </div>
        <button type="button" onClick={() => setSumario((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm hover:bg-white/10" aria-expanded={sumario}>
          <LayoutList className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Seções</span>
        </button>
        <button type="button" onClick={alternarTelaCheia} className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm hover:bg-white/10 sm:inline-flex" aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}>
          {cheia ? <Minimize className="h-4 w-4" aria-hidden /> : <Maximize className="h-4 w-4" aria-hidden />}
          <span className="hidden md:inline">{cheia ? "Sair da tela cheia" : "Tela cheia"}</span>
        </button>
        <Link href={hrefVoltar} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-medium hover:bg-white/20">
          <X className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Voltar ao GRR</span>
        </Link>
      </header>

      {/* sumário: acesso direto a uma seção */}
      {sumario && (
        <nav aria-label="Seções da apresentação" className="absolute right-3 top-14 z-30 w-72 rounded-2xl border bg-white p-2 shadow-xl sm:right-24">
          <ol>
            {secoes.map((s, i) => (
              <li key={s.chave}>
                <button type="button" onClick={() => irPara(i)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100", i === atual && "bg-interlig-azul/10 font-semibold text-interlig-azul")}>
                  <span className="w-5 text-right tabular-nums text-slate-400">{i + 1}</span> {s.titulo}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* tela atual */}
      <main ref={conteudo} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto h-full w-full max-w-[96rem] px-4 py-5 sm:px-8 xl:px-12 xl:py-8">{telas[atual]}</div>
      </main>

      {/* navegação */}
      <footer className="flex shrink-0 items-center gap-2 border-t bg-white px-3 py-2 sm:px-5">
        <button type="button" onClick={() => irPara(atual - 1)} disabled={atual === 0} className="inline-flex h-10 items-center gap-1 rounded-lg border px-3 text-sm font-medium hover:border-interlig-ceu disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Anterior</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <ol className="hidden items-center gap-1.5 md:flex" aria-label="Etapas">
            {secoes.map((s, i) => (
              <li key={s.chave}>
                <button type="button" onClick={() => irPara(i)} aria-label={`${i + 1}. ${s.titulo}`} aria-current={i === atual ? "step" : undefined} className={cn("block h-2.5 rounded-full transition-all", i === atual ? "w-8 bg-interlig-azul" : "w-2.5 bg-slate-300 hover:bg-slate-400")} />
              </li>
            ))}
          </ol>
          <p className="truncate text-sm font-medium tabular-nums text-slate-700">
            {atual + 1} de {total} · {secoes[atual].titulo}
          </p>
        </div>
        <button type="button" onClick={() => irPara(atual + 1)} disabled={atual === total - 1} className="inline-flex h-10 items-center gap-1 rounded-lg bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-40">
          <span className="hidden sm:inline">Próximo</span> <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </footer>

      {sobreposicao}
    </div>
  );
}
