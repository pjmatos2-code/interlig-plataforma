"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";
import type { EstadoLeituras } from "@/lib/sgp/leituras-prevencao";
import { haQuantoTempo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Fase =
  | { tipo: "ocioso" }
  | { tipo: "lendo"; texto: string }
  | { tipo: "pronto" }
  | { tipo: "erro"; texto: string };

type Resposta = { ok?: boolean; ocupado?: boolean; chegouHoje?: boolean; erro?: string; estado?: EstadoLeituras };

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somarDia = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const quando = (iso: string | null) => (iso ? haQuantoTempo(iso) : "ainda sem leitura");

/**
 * Faixa no topo da Prevenção: quando as ocorrências e os cancelamentos foram
 * lidos do SGP pela última vez, e o botão "Atualizar agora". O botão vai por
 * passos (/api/prevencao/atualizar): primeiro os cancelamentos, depois as
 * ocorrências, em trechos de 7 dias até alcançar hoje.
 */
export function AtualizarDados({ estado: inicial }: { estado: EstadoLeituras }) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const [fase, setFase] = useState<Fase>({ tipo: "ocioso" });
  useEffect(() => setEstado(inicial), [inicial]);

  // um dia incompleto é normal (a última leitura foi ontem à tarde); mais que isso falta dado nas abas
  const atrasada = estado.ocorrenciasCursor < somarDia(estado.hoje, -1);
  const lendo = fase.tipo === "lendo";

  async function passo(etapa: "cancelamentos" | "ocorrencias"): Promise<{ status: number; corpo: Resposta }> {
    const res = await fetch("/api/prevencao/atualizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapa }),
    });
    if (res.redirected) throw new Error("sua sessão expirou; entre de novo na plataforma");
    const corpo = ((await res.json().catch(() => null)) ?? {}) as Resposta;
    if (corpo.estado) setEstado(corpo.estado);
    return { status: res.status, corpo };
  }

  async function atualizar() {
    try {
      setFase({ tipo: "lendo", texto: "Lendo os cancelamentos no SGP…" });
      const c = await passo("cancelamentos");
      if (c.status !== 200 || !c.corpo.ok) throw new Error(c.corpo.erro ?? "o SGP não respondeu");
      let atual = c.corpo.estado ?? estado;
      let esperas = 0;
      for (let i = 0; i < 15; i++) {
        setFase({
          tipo: "lendo",
          texto:
            atual.ocorrenciasCursor < somarDia(atual.hoje, -3)
              ? `Lendo as ocorrências no SGP desde ${diaMes(atual.ocorrenciasCursor)}…`
              : "Lendo as ocorrências dos últimos dias no SGP…",
        });
        const o = await passo("ocorrencias");
        if (o.corpo.estado) atual = o.corpo.estado;
        if (o.status === 409) {
          if (++esperas > 4) throw new Error("outra leitura do SGP está demorando");
          setFase({ tipo: "lendo", texto: "Outra leitura do SGP está em andamento. Esperando ela terminar…" });
          await esperar(15_000);
          continue;
        }
        if (o.status !== 200 || !o.corpo.ok) throw new Error(o.corpo.erro ?? "o SGP não respondeu");
        if (o.corpo.chegouHoje) break;
      }
      setFase({ tipo: "pronto" });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      setFase({ tipo: "erro", texto: `Não deu para terminar a atualização (${motivo}). O que já foi lido ficou salvo; tente de novo em alguns minutos.` });
    } finally {
      router.refresh();
    }
  }

  const Icone = lendo ? Loader2 : fase.tipo === "erro" || atrasada ? AlertTriangle : fase.tipo === "pronto" ? CheckCircle2 : Clock;

  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        fase.tipo === "erro"
          ? "border-destructive/40 bg-destructive/5"
          : atrasada && !lendo
            ? "border-farol-amarelo/50 bg-farol-amarelo/10"
            : "bg-muted/30"
      )}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-2 text-xs leading-relaxed">
        <Icone
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            lendo && "animate-spin text-primary",
            fase.tipo === "erro" && "text-destructive",
            fase.tipo === "pronto" && !atrasada && "text-farol-verde",
            !lendo && fase.tipo !== "erro" && atrasada && "text-farol-amarelo",
            fase.tipo === "ocioso" && !atrasada && "text-muted-foreground"
          )}
          aria-hidden
        />
        {lendo ? (
          <p className="min-w-0 font-medium">{fase.texto}</p>
        ) : fase.tipo === "erro" ? (
          <p className="min-w-0 text-destructive">{fase.texto}</p>
        ) : atrasada ? (
          <p className="min-w-0">
            <strong>Ocorrências do SGP lidas só até {diaMes(somarDia(estado.ocorrenciasCursor, -1))}.</strong>{" "}
            Insatisfação e Pedidos de cancelamento estão incompletos.{" "}
            <span className="text-muted-foreground">
              Cancelamentos: <span suppressHydrationWarning>{quando(estado.cancelamentosLidosEm)}</span>.
            </span>
          </p>
        ) : (
          <p className="min-w-0 text-muted-foreground">
            {fase.tipo === "pronto" && <strong className="text-foreground">Atualizado. </strong>}
            Dados do SGP: ocorrências{" "}
            <span className="font-medium text-foreground" suppressHydrationWarning>
              {quando(estado.ocorrenciasLidasEm)}
            </span>{" "}
            · cancelamentos{" "}
            <span className="font-medium text-foreground" suppressHydrationWarning>
              {quando(estado.cancelamentosLidosEm)}
            </span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={atualizar}
        disabled={lendo}
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 self-start rounded-full border border-primary/30 bg-card px-3 text-xs font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:self-auto"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", lendo && "animate-spin")} aria-hidden />
        {lendo ? "Atualizando…" : "Atualizar agora"}
      </button>
    </div>
  );
}
