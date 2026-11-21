"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, ExternalLink, PauseCircle, Search, UserRound, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { formatarDataHora, haQuantoTempo } from "@/lib/format";
import type { CartaoOperacao, DadosOperacao } from "@/lib/operacao/dados";
import {
  COLUNAS,
  DIAS_QUADRO,
  PERIODOS,
  ROTULO_TIPO,
  diaSantarem,
  intervaloPeriodo,
  noPeriodo,
  tempoDesde,
  type BaseData,
  type Coluna,
  type Periodo,
  type TipoServico,
} from "@/lib/operacao/regras";
import { AtualizarOperacao } from "./atualizar";

const UNIDADES = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
const TIPOS: TipoServico[] = ["instalacao", "mudanca", "suporte"];
const POR_COLUNA = 40;
const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const COR_TIPO: Record<TipoServico, string> = {
  instalacao: "bg-sky-100 text-sky-800 ring-sky-200",
  mudanca: "bg-violet-100 text-violet-800 ring-violet-200",
  suporte: "bg-amber-100 text-amber-900 ring-amber-200",
};
const COR_COLUNA: Record<Coluna, string> = {
  aberta: "border-t-slate-400",
  agendada: "border-t-sky-500",
  execucao: "border-t-indigo-500",
  validar: "border-t-farol-vermelho",
  encerrada: "border-t-farol-verde",
};

/** Agendada com a data já passada e o técnico sem check-in. */
const vencida = (c: CartaoOperacao, agora: number) => c.coluna === "agendada" && Boolean(c.agendamento) && Date.parse(c.agendamento!) < agora;

function textoTempo(c: CartaoOperacao, agora: number): string {
  switch (c.coluna) {
    case "agendada":
      return vencida(c, agora) ? `Agendamento vencido: era ${formatarDataHora(c.agendamento)}` : `Agendada para ${formatarDataHora(c.agendamento)}`;
    case "execucao":
      return c.checkin ? `Em atendimento há ${tempoDesde(c.checkin, agora)}` : `Aberta há ${tempoDesde(c.criadaEm, agora)}`;
    case "validar":
      return `OS encerrada há ${tempoDesde(c.osEncerradaEm, agora)}`;
    case "encerrada":
      return `Fechada em ${formatarDataHora(c.encerradaEm)}`;
    default:
      return `Aberta há ${tempoDesde(c.criadaEm, agora)}`;
  }
}

function Cartao({ c, agora, linkTemplate }: { c: CartaoOperacao; agora: number; linkTemplate: string | null }) {
  const link = aplicarLinkSgp(linkTemplate, { clienteId: c.sgpClienteId, contratoId: c.sgpContratoId, cpf: c.documento });
  const equipe = [c.tecnico, c.auxiliares].filter(Boolean).join(" + ");
  return (
    <li
      className={cn(
        "rounded-lg border bg-card p-3 text-sm shadow-sm",
        c.corporativo && c.coluna !== "encerrada" && "border-farol-vermelho/60 ring-1 ring-farol-vermelho/30"
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", COR_TIPO[c.tipo])}>{ROTULO_TIPO[c.tipo]}</span>
        {c.corporativo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-farol-vermelho px-2 py-0.5 text-[11px] font-semibold text-white">
            <Building2 className="h-3 w-3" aria-hidden /> Corporativo
          </span>
        )}
        {c.pendente && c.coluna !== "encerrada" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-farol-amarelo/25 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">
            <PauseCircle className="h-3 w-3" aria-hidden /> Pendente no SGP
          </span>
        )}
      </div>
      <p className="mt-2 font-medium leading-snug">{c.cliente}</p>
      <p className="text-xs text-muted-foreground">
        {c.unidade}
        {c.bairro ? ` · ${c.bairro}` : ""}
      </p>
      {c.tipo === "suporte" && <p className="mt-1 text-xs text-muted-foreground">{c.tipoSgp.replace(/^Suporte\s*-\s*/i, "")}</p>}
      <p className={cn("mt-2 text-xs font-medium", c.coluna === "validar" || vencida(c, agora) ? "text-farol-vermelho" : "text-foreground")}>{textoTempo(c, agora)}</p>
      {equipe && (
        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          <Wrench className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {equipe}
        </p>
      )}
      {c.coluna === "validar" && c.servicoPrestado && /[a-z0-9]/i.test(c.servicoPrestado) && (
        <p className="mt-2 line-clamp-3 rounded bg-muted px-2 py-1 text-xs" title={c.servicoPrestado}>
          {c.servicoPrestado}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          Oc. {c.ocorrenciaId}
          {c.osId ? ` · OS ${c.osId}` : " · sem OS"}
          {c.sgpContratoId ? ` · Contrato ${c.sgpContratoId}` : ""}
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

export function QuadroOperacao({ dados, linkTemplate, agora }: { dados: DadosOperacao; linkTemplate: string | null; agora: number }) {
  const [unidade, setUnidade] = useState<string>("todas");
  const [tipos, setTipos] = useState<TipoServico[]>(TIPOS);
  const [soCorporativo, setSoCorporativo] = useState(false);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [base, setBase] = useState<BaseData>("abertura");
  const hoje = diaSantarem(agora)!;
  const minimo = diaSantarem(agora - DIAS_QUADRO * 86_400_000)!;
  const [escolhido, setEscolhido] = useState<{ de: string; ate: string }>({ de: minimo, ate: hoje });
  const intervalo = intervaloPeriodo(periodo, hoje, escolhido);
  const { de: iDe, ate: iAte } = intervalo;
  const [abertas, setAbertas] = useState<Record<Coluna, number>>({ aberta: POR_COLUNA, agendada: POR_COLUNA, execucao: POR_COLUNA, validar: POR_COLUNA, encerrada: POR_COLUNA });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.cartoes.filter(
      (c) =>
        (periodo === "30d" && base === "abertura" ? true : noPeriodo(c, base, { de: iDe, ate: iAte })) &&
        (unidade === "todas" || c.unidade === unidade) &&
        tipos.includes(c.tipo) &&
        (!soCorporativo || c.corporativo) &&
        (!q ||
          [c.cliente, c.bairro, c.tecnico, c.auxiliares, c.ocorrenciaId, c.osId, c.sgpContratoId].some((v) => (v ?? "").toLowerCase().includes(q)))
    );
  }, [dados.cartoes, unidade, tipos, soCorporativo, busca, periodo, base, iDe, iAte]);

  const porColuna = useMemo(() => {
    const m = Object.fromEntries(COLUNAS.map((c) => [c.chave, [] as CartaoOperacao[]])) as Record<Coluna, CartaoOperacao[]>;
    for (const c of filtrados) m[c.coluna].push(c);
    return m;
  }, [filtrados]);

  const corporativosAbertos = filtrados.filter((c) => c.corporativo && c.coluna !== "encerrada").length;
  const validarMaisAntiga = porColuna.validar.reduce<string | null>((m, c) => (c.osEncerradaEm && (!m || c.osEncerradaEm < m) ? c.osEncerradaEm : m), null);
  const alternarTipo = (t: TipoServico) => setTipos((xs) => (xs.includes(t) ? (xs.length > 1 ? xs.filter((x) => x !== t) : xs) : [...xs, t]));

  return (
    <div className="space-y-4">
      {/* período e atualização */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Período
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p.chave}
                type="button"
                onClick={() => setPeriodo(p.chave)}
                aria-pressed={periodo === p.chave}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium", periodo === p.chave ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:bg-muted")}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Contar pela data de</span>
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Data usada no período">
              {(["abertura", "agendamento"] as BaseData[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBase(b)}
                  aria-pressed={base === b}
                  className={cn("rounded px-2.5 py-1 font-medium", base === b ? "bg-interlig-azul text-white" : "text-muted-foreground hover:bg-muted")}
                >
                  {b === "abertura" ? "abertura" : "agendamento"}
                </button>
              ))}
            </div>
            {periodo === "personalizado" ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor="op-de">De</label>
                <input
                  id="op-de"
                  type="date"
                  value={escolhido.de}
                  min={base === "abertura" ? minimo : undefined}
                  onChange={(e) => setEscolhido((x) => ({ ...x, de: e.target.value }))}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                />
                <span className="text-muted-foreground">até</span>
                <label className="sr-only" htmlFor="op-ate">Até</label>
                <input
                  id="op-ate"
                  type="date"
                  value={escolhido.ate}
                  min={base === "abertura" ? minimo : undefined}
                  onChange={(e) => setEscolhido((x) => ({ ...x, ate: e.target.value }))}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                />
              </span>
            ) : (
              <span className="font-medium tabular-nums">
                {intervalo.de === intervalo.ate ? diaMes(intervalo.de) : `${diaMes(intervalo.de)} a ${diaMes(intervalo.ate)}`}
              </span>
            )}
          </div>
          {base === "abertura" && intervalo.de < minimo && (
            <p className="text-[11px] text-muted-foreground">O quadro guarda só os últimos {DIAS_QUADRO} dias: antes de {diaMes(minimo)} não aparece nada.</p>
          )}
          {base === "agendamento" && <p className="text-[11px] text-muted-foreground">Por agendamento, só entram ocorrências com OS agendada.</p>}
        </div>
        <AtualizarOperacao />
      </div>

      {/* resumo */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {COLUNAS.filter((c) => c.chave !== "encerrada").map((col) => (
          <a
            key={col.chave}
            href={`#col-${col.chave}`}
            className={cn("rounded-lg border border-t-4 bg-card p-3 shadow-sm transition hover:bg-muted/50", COR_COLUNA[col.chave])}
          >
            <p className="text-xs font-medium text-muted-foreground">{col.rotulo}</p>
            <p className={cn("text-2xl font-semibold tabular-nums", col.chave === "validar" && porColuna.validar.length > 0 && "text-farol-vermelho")}>
              {porColuna[col.chave].length.toLocaleString("pt-BR")}
            </p>
            {col.chave === "validar" && validarMaisAntiga && (
              <p className="text-[11px] text-muted-foreground">mais antiga há {tempoDesde(validarMaisAntiga, agora)}</p>
            )}
          </a>
        ))}
        <button
          type="button"
          onClick={() => setSoCorporativo((v) => !v)}
          aria-pressed={soCorporativo}
          className={cn(
            "rounded-lg border border-t-4 border-t-farol-vermelho p-3 text-left shadow-sm transition",
            soCorporativo ? "bg-farol-vermelho text-white" : "bg-card hover:bg-muted/50"
          )}
        >
          <p className={cn("text-xs font-medium", soCorporativo ? "text-white/90" : "text-muted-foreground")}>Corporativo / CNPJ em aberto</p>
          <p className="text-2xl font-semibold tabular-nums">{corporativosAbertos.toLocaleString("pt-BR")}</p>
          <p className={cn("text-[11px]", soCorporativo ? "text-white/90" : "text-muted-foreground")}>{soCorporativo ? "mostrando só estes" : "toque para filtrar"}</p>
        </button>
      </div>

      {/* filtros */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unidade">
          {["todas", ...UNIDADES].map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnidade(u)}
              aria-pressed={unidade === u}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", unidade === u ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:bg-muted")}
            >
              {u === "todas" ? "Todas as unidades" : u}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de serviço">
          {TIPOS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => alternarTipo(t)}
              aria-pressed={tipos.includes(t)}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1 transition", tipos.includes(t) ? COR_TIPO[t] : "bg-background text-muted-foreground ring-border line-through")}
            >
              {ROTULO_TIPO[t]}
            </button>
          ))}
        </div>
        <label className="relative block lg:w-72">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente, bairro, técnico, OS…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu"
          />
        </label>
      </div>

      {/* quadro */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {COLUNAS.map((col) => {
          const lista = porColuna[col.chave];
          const limite = abertas[col.chave];
          return (
            <section
              key={col.chave}
              id={`col-${col.chave}`}
              aria-label={col.rotulo}
              className={cn("flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-xl border border-t-4 bg-muted/40 sm:w-80 lg:w-auto lg:max-w-none", COR_COLUNA[col.chave])}
            >
              <header className="border-b px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{col.rotulo}</h2>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">{lista.length}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{col.ajuda}</p>
              </header>
              <ul className="flex flex-col gap-2 p-2 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
                {lista.length === 0 && <li className="px-1 py-6 text-center text-xs text-muted-foreground">Nada aqui.</li>}
                {lista.slice(0, limite).map((c) => (
                  <Cartao key={c.ocorrenciaId} c={c} agora={agora} linkTemplate={linkTemplate} />
                ))}
                {lista.length > limite && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setAbertas((a) => ({ ...a, [col.chave]: a[col.chave] + POR_COLUNA }))}
                      className="w-full rounded-md border bg-background py-2 text-xs font-medium hover:bg-muted"
                    >
                      Mostrar mais {Math.min(POR_COLUNA, lista.length - limite)} de {lista.length - limite}
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3 w-3" aria-hidden /> Ocorrências lidas do SGP {haQuantoTempo(dados.atualizadoEm)}; OS {haQuantoTempo(dados.osAtualizadasEm)}.
        </span>
        <span>A leitura roda sozinha a cada ~15 min no expediente.</span>
      </p>
    </div>
  );
}
