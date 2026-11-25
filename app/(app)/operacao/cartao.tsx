"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Building2, CalendarDays, ChevronRight, Clock, ExternalLink, MapPin, PauseCircle, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { formatarDataHora } from "@/lib/format";
import type { CartaoOperacao } from "@/lib/operacao/dados";
import { equipeDe } from "@/lib/operacao/painel";
import { COLUNAS, ROTULO_TIPO, tempoDesde, type TipoServico } from "@/lib/operacao/regras";

const COR_TIPO: Record<TipoServico, string> = {
  instalacao: "bg-sky-100 text-sky-800",
  mudanca: "bg-violet-100 text-violet-800",
  suporte: "bg-amber-100 text-amber-900",
  infraestrutura: "bg-teal-100 text-teal-900",
};
export const linkDo = (c: CartaoOperacao, t: string | null) => aplicarLinkSgp(t, { clienteId: c.sgpClienteId, contratoId: c.sgpContratoId, cpf: c.documento });

/** Agendada com a data já passada e o técnico sem check-in. */
export const vencida = (c: CartaoOperacao, agora: number) => c.coluna === "agendada" && Boolean(c.agendamento) && Date.parse(c.agendamento!) < agora;

export function textoTempo(c: CartaoOperacao, agora: number): string {
  switch (c.coluna) {
    case "agendada":
      return vencida(c, agora) ? `Agendamento vencido: era ${formatarDataHora(c.agendamento)}` : `Agendada para ${formatarDataHora(c.agendamento)}`;
    case "execucao":
      return c.checkin ? `Em atendimento há ${tempoDesde(c.checkin, agora)}` : `Aberta há ${tempoDesde(c.criadaEm, agora)}`;
    case "validar":
      return c.osEncerradaEm ? `OS encerrada há ${tempoDesde(c.osEncerradaEm, agora)}` : `Técnico atendeu há ${tempoDesde(c.checkin, agora)} · OS ainda não baixada`;
    case "encerrada":
      return `Fechada em ${formatarDataHora(c.encerradaEm)}`;
    default:
      return `Aberta há ${tempoDesde(c.criadaEm, agora)}`;
  }
}

export function Selos({ c }: { c: CartaoOperacao }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", COR_TIPO[c.tipo])}>{ROTULO_TIPO[c.tipo]}</span>
      {c.corporativo && (
        <span className="inline-flex items-center gap-1 rounded-md bg-farol-vermelho px-2 py-0.5 text-[11px] font-semibold text-white">
          <Building2 className="h-3 w-3" aria-hidden /> Corporativo
        </span>
      )}
      {c.pendente && c.coluna !== "encerrada" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-farol-amarelo/25 px-2 py-0.5 text-[11px] font-semibold text-yellow-900">
          <PauseCircle className="h-3 w-3" aria-hidden /> Pendente no SGP
        </span>
      )}
    </span>
  );
}

const atraso = (c: CartaoOperacao, agora: number) => c.coluna === "validar" || vencida(c, agora);

export function Cartao({ c, agora, linkTemplate, aoAbrir }: { c: CartaoOperacao; agora: number; linkTemplate: string | null; aoAbrir: () => void }) {
  const link = linkDo(c, linkTemplate);
  const equipe = equipeDe(c);
  return (
    <li className={cn("rounded-xl border bg-card text-sm shadow-sm transition hover:border-interlig-ceu", c.corporativo && c.coluna !== "encerrada" && "border-farol-vermelho/50")}>
      <button type="button" onClick={aoAbrir} className="block w-full rounded-xl p-3 pb-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu">
        <Selos c={c} />
        <span className="mt-2 flex items-start gap-1">
          <span className="min-w-0 flex-1 break-words font-semibold leading-snug">{c.cliente}</span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </span>
        <span className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-interlig-ceu" aria-hidden />
          {c.unidade}
          {c.bairro ? ` · ${c.bairro}` : ""}
        </span>
        <span className={cn("mt-1 flex items-start gap-1.5 text-xs font-semibold", atraso(c, agora) && "text-red-700")}>
          {c.coluna === "validar" ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
          {textoTempo(c, agora)}
        </span>
        {equipe && (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="line-clamp-2">{equipe}</span>
          </span>
        )}
        {c.coluna === "validar" && <span className="mt-1 block text-xs text-muted-foreground">Ocorrência: {c.statusOcorrencia ?? "—"}</span>}
      </button>
      <div className="mx-3 flex items-center justify-between gap-2 border-t py-1.5 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{c.osId ? `OS ${c.osId}` : "sem OS"}</span>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 py-1 font-semibold text-interlig-ceu hover:underline">
            SGP <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

/** painel lateral com tudo o que o quadro sabe da ocorrência */
export function Detalhe({ c, agora, linkTemplate, aoFechar }: { c: CartaoOperacao; agora: number; linkTemplate: string | null; aoFechar: () => void }) {
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    fechar.current?.focus();
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      antes?.focus?.();
    };
  }, [aoFechar]);
  const link = linkDo(c, linkTemplate);
  const linhas: [string, React.ReactNode][] = [
    ["Situação", COLUNAS.find((x) => x.chave === c.coluna)?.rotulo],
    ["Tempo", textoTempo(c, agora)],
    ["Unidade e bairro", [c.unidade, c.bairro].filter(Boolean).join(" · ")],
    ["Tipo no SGP", c.tipoSgp],
    ["Ocorrência", `${c.ocorrenciaId} · ${c.statusOcorrencia ?? "—"}`],
    ["Ordem de serviço", c.osId ? `${c.osId} · ${c.statusOs ?? "—"}` : "sem OS"],
    ["Contrato", c.sgpContratoId],
    ["Plano", c.plano],
    ["Técnico responsável", c.tecnico],
    ["Auxiliares", c.auxiliares],
    ["Aberta", `${formatarDataHora(c.criadaEm)}${c.abertaPor ? ` por ${c.abertaPor}` : ""}`],
    ["Agendamento", c.agendamento ? formatarDataHora(c.agendamento) : null],
    ["Check-in do técnico", c.checkin ? formatarDataHora(c.checkin) : null],
    ["OS encerrada", c.osEncerradaEm ? formatarDataHora(c.osEncerradaEm) : null],
    ["Ocorrência encerrada", c.encerradaEm ? formatarDataHora(c.encerradaEm) : null],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/40" onMouseDown={(ev) => ev.target === ev.currentTarget && aoFechar()}>
      <div role="dialog" aria-modal="true" aria-label={`Ocorrência de ${c.cliente}`} className="flex h-full w-full max-w-md flex-col bg-background shadow-xl">
        <div className="flex items-start gap-3 border-b p-4">
          <div className="min-w-0 flex-1">
            <Selos c={c} />
            <h2 className="mt-2 text-lg font-semibold leading-snug">{c.cliente}</h2>
          </div>
          <button ref={fechar} type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-lg border p-2 hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <dl className="space-y-2 text-sm">
            {linhas.filter(([, v]) => v).map(([t, v]) => (
              <div key={t} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2">
                <dt className="text-muted-foreground">{t}</dt>
                <dd className={cn("break-words", t === "Tempo" && atraso(c, agora) && "font-semibold text-red-700")}>{v}</dd>
              </div>
            ))}
          </dl>
          {c.servicoPrestado && /[a-z0-9]/i.test(c.servicoPrestado) && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Serviço prestado</p>
              <p className="mt-1 whitespace-pre-line break-words rounded-lg bg-muted p-3 text-sm">{c.servicoPrestado}</p>
            </div>
          )}
          {c.coluna === "validar" && <p className="mt-4 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">Conferir e dar baixa no SGP. A plataforma só acompanha: não encerra OS nem ocorrência.</p>}
        </div>
        {link && (
          <div className="border-t p-4">
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-interlig-azul text-sm font-semibold text-white hover:bg-interlig-azul/90">
              Abrir no SGP <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
