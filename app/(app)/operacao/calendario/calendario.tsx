"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { haQuantoTempo } from "@/lib/format";
import { diaSantarem, type OsCalendario } from "@/lib/operacao/calendario";
import { ROTULO_TIPO, type TipoServico } from "@/lib/operacao/regras";

const UNIDADES = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
const TIPOS: TipoServico[] = ["instalacao", "mudanca", "suporte"];
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const COR_TIPO: Record<TipoServico, string> = {
  instalacao: "bg-sky-100 text-sky-800 ring-sky-200",
  mudanca: "bg-violet-100 text-violet-800 ring-violet-200",
  suporte: "bg-amber-100 text-amber-900 ring-amber-200",
};
const hora = (iso: string) => new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(11, 16);
const diaLongo = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d.getUTCDay()]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
};

type Contagem = { agendado: number; concluido: number; vencido: number };

function Item({ o, linkTemplate }: { o: OsCalendario; linkTemplate: string | null }) {
  const link = aplicarLinkSgp(linkTemplate, { clienteId: o.sgpClienteId, contratoId: o.sgpContratoId, cpf: o.documento });
  return (
    <li className={cn("rounded-lg border bg-card p-3 text-sm", o.vencido && "border-farol-vermelho/60", o.corporativo && "ring-1 ring-farol-vermelho/30")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", o.estado === "concluido" ? "bg-farol-verde/15 text-farol-verde" : o.vencido ? "bg-farol-vermelho/15 text-farol-vermelho" : "bg-interlig-ceu/15 text-interlig-azul")}>
          {o.estado === "concluido" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <Clock className="h-3 w-3" aria-hidden />}
          {o.estado === "concluido" ? (o.fonte === "checkin" ? `Técnico no local ${hora(o.quando)}` : o.fonte === "agendamento" ? `Concluída · agendada ${hora(o.quando)}` : `Baixada ${hora(o.quando)}`) : o.vencido ? `Vencida · era ${hora(o.quando)}` : `Agendada ${hora(o.quando)}`}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", COR_TIPO[o.tipo])}>{ROTULO_TIPO[o.tipo]}</span>
        {o.corporativo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-farol-vermelho px-2 py-0.5 text-[11px] font-semibold text-white">
            <Building2 className="h-3 w-3" aria-hidden /> Corporativo
          </span>
        )}
      </div>
      <p className="mt-1.5 font-medium leading-snug">{o.cliente}</p>
      <p className="text-xs text-muted-foreground">
        {o.unidade}
        {o.bairro ? ` · ${o.bairro}` : ""}
        {o.tipo === "suporte" ? ` · ${o.motivo}` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Wrench className="h-3 w-3" aria-hidden /> {o.tecnico ?? "sem técnico no SGP"} · OS {o.osId}
          {o.estado === "concluido" && o.baixadaEm && o.fonte !== "baixa" && diaSantarem(o.baixadaEm) !== o.dia && ` · baixada no SGP em ${diaSantarem(o.baixadaEm).slice(8, 10)}/${diaSantarem(o.baixadaEm).slice(5, 7)}`}
        </span>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-interlig-ceu hover:underline">
            SGP <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

export function CalendarioOperacao(p: {
  mes: string;
  rotulo: string;
  anterior: string;
  proximo: string;
  semanas: string[][];
  hoje: string;
  itens: OsCalendario[];
  atualizadoEm: string | null;
  linkTemplate: string | null;
}) {
  const [unidade, setUnidade] = useState("todas");
  const [tipos, setTipos] = useState<TipoServico[]>(TIPOS);
  const [soCorporativo, setSoCorporativo] = useState(false);
  const noMes = (dia: string) => dia.slice(0, 7) === p.mes;
  const [dia, setDia] = useState(noMes(p.hoje) ? p.hoje : `${p.mes}-01`);

  const filtrados = useMemo(
    () => p.itens.filter((o) => (unidade === "todas" || o.unidade === unidade) && tipos.includes(o.tipo) && (!soCorporativo || o.corporativo)),
    [p.itens, unidade, tipos, soCorporativo]
  );
  const porDia = useMemo(() => {
    const m = new Map<string, Contagem>();
    for (const o of filtrados) {
      const c = m.get(o.dia) ?? { agendado: 0, concluido: 0, vencido: 0 };
      if (o.estado === "concluido") c.concluido++;
      else if (o.vencido) c.vencido++;
      else c.agendado++;
      m.set(o.dia, c);
    }
    return m;
  }, [filtrados]);
  const doDia = filtrados.filter((o) => o.dia === dia);
  const agendadosDia = doDia.filter((o) => o.estado === "agendado");
  const concluidosDia = doDia.filter((o) => o.estado === "concluido");
  const totalMes = filtrados.filter((o) => noMes(o.dia));
  const alternarTipo = (t: TipoServico) => setTipos((xs) => (xs.includes(t) ? (xs.length > 1 ? xs.filter((x) => x !== t) : xs) : [...xs, t]));

  return (
    <div className="space-y-4">
      {/* mês e filtros */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/operacao/calendario?mes=${p.anterior}`} aria-label="Mês anterior" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border hover:border-interlig-ceu">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <h2 className="min-w-40 text-center text-base font-semibold">{p.rotulo.charAt(0).toUpperCase() + p.rotulo.slice(1)}</h2>
          <Link href={`/operacao/calendario?mes=${p.proximo}`} aria-label="Mês seguinte" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border hover:border-interlig-ceu">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          {!noMes(p.hoje) && (
            <Link href="/operacao/calendario" className="ml-1 rounded-full px-2.5 py-1 text-xs font-medium text-interlig-azul hover:bg-interlig-azul/10">
              Ir para hoje
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unidade">
          {["todas", ...UNIDADES].map((u) => (
            <button key={u} type="button" onClick={() => setUnidade(u)} aria-pressed={unidade === u} className={cn("rounded-full border px-3 py-1 text-xs font-medium", unidade === u ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:bg-muted")}>
              {u === "todas" ? "Todas as unidades" : u}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de serviço">
          {TIPOS.map((t) => (
            <button key={t} type="button" onClick={() => alternarTipo(t)} aria-pressed={tipos.includes(t)} className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", tipos.includes(t) ? COR_TIPO[t] : "bg-background text-muted-foreground ring-border line-through")}>
              {ROTULO_TIPO[t]}
            </button>
          ))}
          <button type="button" onClick={() => setSoCorporativo((v) => !v)} aria-pressed={soCorporativo} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", soCorporativo ? "border-farol-vermelho bg-farol-vermelho text-white" : "bg-background hover:bg-muted")}>
            Só corporativo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-interlig-ceu" aria-hidden /> agendadas</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-farol-vermelho" aria-hidden /> agendamento vencido</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-farol-verde" aria-hidden /> concluídas</span>
        <span>
          No mês: {totalMes.filter((o) => o.estado === "concluido").length.toLocaleString("pt-BR")} concluídas · {totalMes.filter((o) => o.estado === "agendado").length.toLocaleString("pt-BR")} agendadas
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* grade do mês */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {DIAS.map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          {p.semanas.map((semana) => (
            <div key={semana[0]} className="grid grid-cols-7 border-b last:border-b-0">
              {semana.map((d) => {
                const c = porDia.get(d);
                const sel = d === dia;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDia(d)}
                    aria-pressed={sel}
                    aria-label={`${diaLongo(d)}: ${c?.agendado ?? 0} agendadas, ${c?.vencido ?? 0} vencidas, ${c?.concluido ?? 0} concluídas`}
                    className={cn(
                      "flex min-h-16 flex-col items-stretch gap-1 border-r p-1 text-left last:border-r-0 sm:min-h-24 sm:p-1.5",
                      !noMes(d) && "bg-muted/30 text-muted-foreground",
                      sel && "bg-interlig-azul/10 ring-2 ring-inset ring-interlig-azul",
                      "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-interlig-ceu"
                    )}
                  >
                    <span className={cn("text-xs font-semibold tabular-nums", d === p.hoje && "inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-interlig-azul text-white")}>{Number(d.slice(8, 10))}</span>
                    {c && (
                      <span className="flex flex-col gap-0.5 text-[10px] font-semibold tabular-nums sm:text-[11px]">
                        {c.agendado > 0 && <span className="rounded bg-interlig-ceu/15 px-1 text-interlig-azul">{c.agendado}<span className="hidden sm:inline"> agend.</span></span>}
                        {c.vencido > 0 && <span className="rounded bg-farol-vermelho/15 px-1 text-farol-vermelho">{c.vencido}<span className="hidden sm:inline"> venc.</span></span>}
                        {c.concluido > 0 && <span className="rounded bg-farol-verde/15 px-1 text-farol-verde">{c.concluido}<span className="hidden sm:inline"> concl.</span></span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* agenda do dia */}
        <section aria-label={`Agenda de ${diaLongo(dia)}`} className="rounded-xl border bg-muted/30 p-3">
          <h3 className="text-sm font-semibold capitalize">{diaLongo(dia)}</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {agendadosDia.length} agendada{agendadosDia.length === 1 ? "" : "s"} · {concluidosDia.length} concluída{concluidosDia.length === 1 ? "" : "s"}
          </p>
          {doDia.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nada agendado ou concluído neste dia.</p>}
          {agendadosDia.length > 0 && (
            <>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendadas</h4>
              <ul className="mb-3 flex flex-col gap-2">
                {agendadosDia.map((o) => <Item key={o.osId} o={o} linkTemplate={p.linkTemplate} />)}
              </ul>
            </>
          )}
          {concluidosDia.length > 0 && (
            <>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concluídas</h4>
              <ul className="flex flex-col gap-2">
                {concluidosDia.map((o) => <Item key={o.osId} o={o} linkTemplate={p.linkTemplate} />)}
              </ul>
            </>
          )}
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        Concluída conta no dia em que o técnico esteve no local (check-in); a baixa da OS no SGP costuma ser feita depois. OS lidas do SGP {haQuantoTempo(p.atualizadoEm)}. As OS dos últimos 31 dias são relidas a cada ~15 min no expediente; meses mais antigos mostram o último status lido.
      </p>
    </div>
  );
}
