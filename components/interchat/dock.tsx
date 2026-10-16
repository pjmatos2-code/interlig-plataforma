"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Maximize2, MessagesSquare } from "lucide-react";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { cn } from "@/lib/utils";
import { useInterChat } from "./provedor";
import { ListaConversas } from "./lista";
import { Conversa } from "./conversa";

/**
 * InterChat no canto da tela (modelo LinkedIn): no computador, a lista fica
 * fixa embaixo à direita e cada conversa abre numa janelinha ao lado; no
 * celular, um botão flutuante leva à página do InterChat.
 */
export function DockInterChat() {
  const { eu, naoLidas, janelas, abrir, fechar, online } = useInterChat();
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  if (caminho.startsWith("/interchat")) return null;

  return (
    <>
      {/* celular: botão flutuante */}
      <Link
        href="/interchat"
        aria-label="Abrir o InterChat"
        className="fixed bottom-4 right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-interlig-azul text-white shadow-xl md:hidden print:hidden"
      >
        <MessagesSquare className="h-6 w-6" />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-farol-vermelho px-1 text-[11px] font-bold">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </Link>

      {/* computador: janelas de conversa ao lado da lista */}
      <div className="pointer-events-none fixed bottom-0 right-4 z-[90] hidden items-end gap-3 md:flex print:hidden">
        {[...janelas].reverse().map((id) => (
          <div key={id} className="pointer-events-auto h-[480px] w-[340px]">
            <Conversa conversaId={id} compacto onFechar={() => fechar(id)} />
          </div>
        ))}
        <div className={cn("pointer-events-auto flex w-[320px] flex-col overflow-hidden rounded-t-xl border bg-card shadow-2xl", aberto ? "h-[min(70vh,560px)]" : "h-12")}>
          <button type="button" onClick={() => setAberto((v) => !v)} className="flex h-12 shrink-0 items-center gap-2.5 border-b px-3 text-left">
            <span className="relative">
              <AvatarAgente nome={eu.nome} foto={eu.foto} />
              <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card", online.has(eu.id) ? "bg-farol-verde" : "bg-muted-foreground/40")} />
            </span>
            <span className="flex-1 text-sm font-semibold">InterChat</span>
            {naoLidas > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-interlig-azul px-1.5 text-[11px] font-bold text-white">{naoLidas}</span>
            )}
            <Link href="/interchat" onClick={(e) => e.stopPropagation()} title="Abrir em tela cheia" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
              <Maximize2 className="h-4 w-4" />
            </Link>
            {aberto ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </button>
          {aberto && (
            <div className="min-h-0 flex-1">
              <ListaConversas onAbrir={(id) => abrir(id)} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
