"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { atualizarFidelidadeAgora } from "./acoes";

export function BotaoAtualizarFidelidade() {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setMsg(await atualizarFidelidadeAgora()))}
        className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${pendente ? "animate-spin" : ""}`} />
        {pendente ? "Consultando o SGP (até 2 min)…" : "Atualizar agora"}
      </button>
      {msg?.erro && <span className="max-w-xs text-xs text-farol-vermelho md:text-right">{msg.erro}</span>}
      {msg?.ok && <span className="text-xs text-farol-verde">{msg.ok}</span>}
    </div>
  );
}
