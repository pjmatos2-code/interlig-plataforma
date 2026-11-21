"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Fase = { tipo: "ocioso" } | { tipo: "lendo"; passo: number; texto: string } | { tipo: "pronto" } | { tipo: "erro"; texto: string };

const PASSOS: { corpo: { etapa: string; fatia?: number }; texto: string }[] = [
  { corpo: { etapa: "os" }, texto: "Lendo as OS no SGP…" },
  { corpo: { etapa: "ocorrencias", fatia: 0 }, texto: "Lendo as ocorrências dos últimos 10 dias…" },
  { corpo: { etapa: "ocorrencias", fatia: 1 }, texto: "Lendo as ocorrências de 10 a 20 dias atrás…" },
  { corpo: { etapa: "ocorrencias", fatia: 2 }, texto: "Lendo as ocorrências de 20 a 30 dias atrás…" },
];

/**
 * Botão "Atualizar" da Operação Técnica: lê do SGP em quatro passos curtos
 * (/api/operacao/atualizar) e recarrega o quadro. Leva cerca de 1 minuto.
 */
export function AtualizarOperacao() {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>({ tipo: "ocioso" });
  const lendo = fase.tipo === "lendo";

  async function atualizar() {
    try {
      for (let i = 0; i < PASSOS.length; i++) {
        setFase({ tipo: "lendo", passo: i, texto: PASSOS[i].texto });
        const res = await fetch("/api/operacao/atualizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(PASSOS[i].corpo),
        });
        if (res.redirected) throw new Error("sua sessão expirou; entre de novo na plataforma");
        const corpo = ((await res.json().catch(() => null)) ?? {}) as { ok?: boolean; erro?: string };
        if (!res.ok || !corpo.ok) throw new Error(corpo.erro ?? "o SGP não respondeu");
        // depois das OS e da fatia recente o quadro já mostra o principal
        if (i === 1) router.refresh();
      }
      router.refresh();
      setFase({ tipo: "pronto" });
      setTimeout(() => setFase((f) => (f.tipo === "pronto" ? { tipo: "ocioso" } : f)), 6000);
    } catch (e) {
      setFase({ tipo: "erro", texto: e instanceof Error ? e.message : "falhou" });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={atualizar}
        disabled={lendo}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md bg-interlig-azul px-4 text-sm font-medium text-white shadow-sm transition hover:bg-interlig-azul/90 disabled:opacity-70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu focus-visible:ring-offset-2"
        )}
      >
        {lendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        {lendo ? `Atualizando (${fase.passo + 1}/${PASSOS.length})` : "Atualizar agora"}
      </button>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {fase.tipo === "lendo" && fase.texto}
        {fase.tipo === "pronto" && (
          <span className="inline-flex items-center gap-1 text-farol-verde">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Quadro atualizado com o SGP.
          </span>
        )}
        {fase.tipo === "erro" && (
          <span className="inline-flex items-center gap-1 text-farol-vermelho">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Não foi possível atualizar: {fase.texto}. Tente de novo em instantes.
          </span>
        )}
      </p>
    </div>
  );
}
