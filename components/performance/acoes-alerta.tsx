"use client";

import { useState, useTransition } from "react";
import { tratarAlertaPerf, type Resposta } from "@/app/(app)/performance/acoes";
import { cn } from "@/lib/utils";

const botao = "inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium hover:bg-muted disabled:opacity-50";

export function AcoesAlerta({ id, status }: { id: string; status: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const rodar = (acao: "reconhecer" | "resolver" | "silenciar" | "reabrir", dias?: number) => iniciar(async () => setMsg(await tratarAlertaPerf(id, acao, dias)));
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {status === "aberto" && (
          <button type="button" className={botao} disabled={pendente} onClick={() => rodar("reconhecer")}>
            Reconhecer
          </button>
        )}
        {status !== "resolvido" && (
          <button type="button" className={cn(botao, "border-farol-verde/40 text-farol-verde")} disabled={pendente} onClick={() => rodar("resolver")}>
            Resolver
          </button>
        )}
        {status !== "silenciado" && status !== "resolvido" && (
          <>
            <button type="button" className={cn(botao, "text-muted-foreground")} disabled={pendente} onClick={() => rodar("silenciar", 1)} title="Some por 1 dia">
              Silenciar 1 dia
            </button>
            <button type="button" className={cn(botao, "text-muted-foreground")} disabled={pendente} onClick={() => rodar("silenciar", 7)} title="Some por 7 dias">
              7 dias
            </button>
          </>
        )}
        {(status === "silenciado" || status === "resolvido") && (
          <button type="button" className={botao} disabled={pendente} onClick={() => rodar("reabrir")}>
            Reabrir
          </button>
        )}
      </div>
      {msg && <p role="status" className={cn("text-xs", msg.erro ? "text-farol-vermelho" : "text-farol-verde")}>{msg.erro ?? msg.ok}</p>}
    </div>
  );
}
