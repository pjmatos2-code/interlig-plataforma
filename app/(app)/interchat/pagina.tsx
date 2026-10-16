"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInterChat } from "@/components/interchat/provedor";
import { ListaConversas } from "@/components/interchat/lista";
import { Conversa } from "@/components/interchat/conversa";
import { MinhaFoto } from "@/components/interchat/minha-foto";

export function PaginaInterChat() {
  const busca = useSearchParams();
  const router = useRouter();
  const { avisos, desativarAvisos, ativarAvisos } = useInterChat();
  const [ativa, setAtiva] = useState<string | null>(busca.get("c"));
  useEffect(() => setAtiva(busca.get("c")), [busca]);
  const abrir = (id: string | null) => {
    setAtiva(id);
    router.replace(id ? `/interchat?c=${id}` : "/interchat", { scroll: false });
  };

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-56px)] overflow-hidden border-t bg-card sm:mx-0 sm:my-0 sm:h-[calc(100dvh-120px)] sm:rounded-xl sm:border lg:-mt-2">
      <aside className={cn("flex w-full min-w-0 flex-col border-r md:w-[340px] md:shrink-0", ativa && "hidden md:flex")}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <MinhaFoto />
          <h1 className="flex-1 text-lg font-bold">InterChat</h1>
          {avisos === "ativo" ? (
            <button type="button" onClick={() => desativarAvisos()} title="Desativar avisos neste dispositivo" className="rounded-md p-1.5 text-farol-verde hover:bg-muted">
              <BellRing className="h-4 w-4" />
            </button>
          ) : avisos === "inativo" ? (
            <button type="button" onClick={() => ativarAvisos()} className="rounded-md px-2 py-1 text-xs font-medium text-interlig-azul hover:bg-muted">
              Ativar avisos
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1">
          <ListaConversas onAbrir={(id) => abrir(id)} ativa={ativa} />
        </div>
      </aside>
      <section className={cn("min-w-0 flex-1", !ativa && "hidden md:block")}>
        {ativa ? (
          <Conversa key={ativa} conversaId={ativa} onVoltar={() => abrir(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10 text-interlig-azul/40" />
            <p className="font-medium text-foreground">Suas conversas aparecem aqui</p>
            <p className="max-w-xs text-sm">Escolha uma conversa na lista ou toque no ✏️ para falar com alguém da equipe.</p>
          </div>
        )}
      </section>
    </div>
  );
}
