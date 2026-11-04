"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, RefreshCw } from "lucide-react";
import { gerarRelatorioAgora, reescreverTextosAgora } from "./acoes";

export function GerarRelatorio({ semanas }: { semanas: { inicio: string; rotulo: string; existe: boolean }[] }) {
  const [semana, setSemana] = useState(semanas[0]?.inicio ?? "");
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; aviso?: string } | null>(null);
  const router = useRouter();
  const gerar = () =>
    iniciar(async () => {
      setMsg(null);
      const r = await gerarRelatorioAgora(semana);
      if (r.erro) return setMsg({ erro: r.erro });
      if (r.aviso) setMsg({ aviso: r.aviso });
      if (r.id) router.push(`/relatorios/semanal/${r.id}`);
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="semana">Semana</label>
        <select
          id="semana"
          value={semana}
          disabled={pendente}
          onChange={(e) => setSemana(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-72"
        >
          {semanas.map((s) => (
            <option key={s.inicio} value={s.inicio}>
              {s.rotulo}
              {s.existe ? " · já gerado" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={gerar}
          disabled={pendente || !semana}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60"
        >
          <FileText className={`h-4 w-4 ${pendente ? "animate-pulse" : ""}`} />
          {pendente ? "Lendo os números e escrevendo (até 3 min)…" : "Gerar relatório"}
        </button>
      </div>
      {msg?.erro && <p className="text-sm text-farol-vermelho">{msg.erro}</p>}
      {msg?.aviso && <p className="text-sm text-amber-700">{msg.aviso}</p>}
    </div>
  );
}

export function ReescreverTextos({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await reescreverTextosAgora(id);
            setErro(r.erro ?? null);
            router.refresh();
          })
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pendente ? "animate-spin" : ""}`} />
        {pendente ? "Escrevendo…" : "Reescrever textos"}
      </button>
      {erro && <span className="text-xs text-farol-vermelho">{erro}</span>}
    </div>
  );
}
