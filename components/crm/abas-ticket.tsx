"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type AbaTicket = { chave: string; rotulo: string; icone: React.ReactNode; conteudo: React.ReactNode };

/** Abas do cartão de trabalho do ticket (Atendimento, Pré-cadastro, Propostas, Histórico). */
export function AbasTicket({ abas }: { abas: AbaTicket[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.chave);
  return (
    <div>
      <div role="tablist" className="flex overflow-x-auto border-b px-2 sm:px-4">
        {abas.map((a) => (
          <button
            key={a.chave}
            role="tab"
            type="button"
            aria-selected={ativa === a.chave}
            onClick={() => setAtiva(a.chave)}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
              ativa === a.chave
                ? "border-interlig-azul text-interlig-azul"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {a.icone}
            {a.rotulo}
          </button>
        ))}
      </div>
      {abas.map((a) => (
        <div key={a.chave} role="tabpanel" hidden={ativa !== a.chave} className="p-4 sm:p-5">
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}
