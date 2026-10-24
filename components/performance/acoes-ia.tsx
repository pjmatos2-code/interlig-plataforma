"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2 } from "lucide-react";
import { analisarAmostraPerf, revisarAnalisePerf, type Resposta } from "@/app/(app)/performance/acoes";
import { cn } from "@/lib/utils";

/** gestor: analisa uma amostra agora (custo exibido no retorno) */
export function BotaoAmostraIa() {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setMsg(await analisarAmostraPerf(5)))}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-interlig-azul hover:bg-muted disabled:opacity-50"
      >
        {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Bot className="h-3.5 w-3.5" aria-hidden />}
        Analisar 5 conversas agora
      </button>
      {msg && <p role="status" className={cn("max-w-xs text-right text-xs", msg.erro ? "text-farol-vermelho" : "text-farol-verde")}>{msg.erro ?? msg.ok}</p>}
    </div>
  );
}

/** revisão humana da classificação da IA */
export function FormRevisao({ id, temperatura, statusLead, score }: { id: string; temperatura: string | null; statusLead: string | null; score: number | null }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [t, setT] = useState(temperatura ?? "");
  const [s, setS] = useState(statusLead ?? "");
  const [n, setN] = useState(score === null ? "" : String(Math.round(score)));
  const [c, setC] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => setMsg(await revisarAnalisePerf(id, { temperatura: t || null, status_lead: s || null, score: n === "" ? null : Number(n), comentario: c })));
      }}
      className="space-y-2 text-sm"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Temperatura</span>
          <select value={t} onChange={(e) => setT(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2">
            {["quente", "morno", "frio", "indeterminado"].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Situação do lead</span>
          <select value={s} onChange={(e) => setS(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2">
            {["a_fazer", "assinou", "perdido", "sem_cobertura", "em_espera", "atencao", "encerrado"].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Nota do atendimento (0–100)</span>
          <input type="number" min={0} max={100} value={n} onChange={(e) => setN(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2" />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block text-muted-foreground">Por que revisar? (obrigatório)</span>
        <textarea value={c} onChange={(e) => setC(e.target.value)} rows={2} className="w-full rounded-md border bg-background px-2 py-1.5" />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pendente || c.trim().length < 5} className="h-9 rounded-md bg-interlig-azul px-3 text-sm font-medium text-white disabled:opacity-50">
          {pendente ? "Salvando…" : "Registrar revisão"}
        </button>
        {msg && <span role="status" className={cn("text-xs", msg.erro ? "text-farol-vermelho" : "text-farol-verde")}>{msg.erro ?? msg.ok}</span>}
      </div>
    </form>
  );
}
