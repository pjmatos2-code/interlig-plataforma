"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownWideNarrow, Building2, CalendarDays, CheckCircle2, ExternalLink, FolderOpen, LayoutGrid, List, PlayCircle, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { haQuantoTempo } from "@/lib/format";
import type { CartaoOperacao, DadosOperacao } from "@/lib/operacao/dados";
import { UNIDADES_OPERACAO, contagens, equipeDe, esperaDesde, evolucao, filaValidar, filtrar, movimentoValidar, ordenar, porTipo, porUnidade } from "@/lib/operacao/painel";
import { COLUNAS, DIAS_ENCERRADAS, ROTULO_TIPO, tempoDesde, type Coluna, type TipoServico } from "@/lib/operacao/regras";
import { AtualizarOperacao } from "./atualizar";
import { CabecalhoOperacao } from "./cabecalho";
import { Cartao, Detalhe, Selos, linkDo, textoTempo, vencida } from "./cartao";
import { Seletor, SeletorPeriodo, SeletorUnidade, useFiltros } from "./filtros";
import { AtencaoValidar, BarrasUnidades, GraficoEvolucao, Painel, RoscaTipos } from "./graficos";

const POR_COLUNA = 40;
const n0 = (v: number) => v.toLocaleString("pt-BR");

const VISUAL: Record<Coluna, { Icone: LucideIcon; icone: string; cartao: string; coluna: string }> = {
  aberta: { Icone: FolderOpen, icone: "bg-slate-200 text-slate-700", cartao: "from-slate-50", coluna: "bg-slate-100/80 border-t-slate-400" },
  agendada: { Icone: CalendarDays, icone: "bg-sky-100 text-sky-700", cartao: "from-sky-50", coluna: "bg-sky-50/80 border-t-sky-500" },
  execucao: { Icone: PlayCircle, icone: "bg-violet-100 text-violet-700", cartao: "from-violet-50", coluna: "bg-violet-50/70 border-t-violet-500" },
  validar: { Icone: AlertTriangle, icone: "bg-red-100 text-red-700", cartao: "from-red-50", coluna: "bg-red-50/70 border-t-farol-vermelho" },
  encerrada: { Icone: CheckCircle2, icone: "bg-green-100 text-green-700", cartao: "from-green-50", coluna: "bg-green-50/70 border-t-farol-verde" },
};
const PLURAL: Record<Coluna, string> = { aberta: "Abertas", agendada: "Agendadas", execucao: "Em execução", validar: "Falta validar", encerrada: "Encerradas" };
const CURTO: Record<Coluna, string> = {
  aberta: "ainda sem agendamento",
  agendada: "com data marcada",
  execucao: "técnico em atendimento",
  validar: "",
  encerrada: `nos últimos ${DIAS_ENCERRADAS} dias`,
};

function Indicador({ Icone, icone, fundo, valor, rotulo, detalhe, ativo, alerta, aoClicar }: { Icone: LucideIcon; icone: string; fundo: string; valor: number; rotulo: string; detalhe: string; ativo: boolean; alerta?: boolean; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border bg-gradient-to-br to-card p-3 text-left shadow-sm transition hover:border-interlig-ceu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu sm:p-4",
        fundo,
        alerta && "border-farol-vermelho/50",
        ativo && "border-interlig-azul ring-2 ring-interlig-azul"
      )}
    >
      <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12", icone)}>
        <Icone className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-2xl font-bold leading-tight tabular-nums", alerta && "text-red-700")}>{n0(valor)}</span>
        <span className="block text-sm font-medium leading-tight">{rotulo}</span>
        <span className="block text-xs leading-tight text-muted-foreground">{detalhe}</span>
      </span>
    </button>
  );
}

/**
 * Operação Técnica (redesign, 25/11/2026). A mesma tela serve à Visão Geral
 * (indicadores, gráficos e quadro), ao Quadro (só o quadro, com mais altura) e
 * ao módulo Infraestrutura. Uma leitura só; a plataforma não altera o SGP.
 */
export function QuadroOperacao({
  dados,
  linkTemplate,
  agora,
  unidadeFixa = null,
  setor = "operacao",
  visao = "quadro",
  titulo,
  descricao,
  abas,
}: {
  dados: DadosOperacao;
  linkTemplate: string | null;
  agora: number;
  unidadeFixa?: string | null;
  setor?: "operacao" | "infraestrutura";
  visao?: "geral" | "quadro";
  titulo: string;
  descricao: string;
  abas: React.ReactNode;
}) {
  const { e, f, mudar, limpar, minimo, tipos } = useFiltros(agora, setor);
  const [limites, setLimites] = useState<Record<Coluna | "lista", number>>({ aberta: POR_COLUNA, agendada: POR_COLUNA, execucao: POR_COLUNA, validar: POR_COLUNA, encerrada: POR_COLUNA, lista: 100 });
  const [detalhe, setDetalhe] = useState<CartaoOperacao | null>(null);
  const fecharDetalhe = useCallback(() => setDetalhe(null), []);

  // indicadores e gráficos: período e unidade do cabeçalho, sem os filtros do quadro
  const base = useMemo(() => filtrar(dados.cartoes, { ...f, tipos, status: "todos", responsavel: "todos", soCorporativo: false, busca: "" }), [dados.cartoes, f, tipos]);
  const n = useMemo(() => contagens(base), [base]);
  const fila = useMemo(() => filaValidar(base, agora), [base, agora]);
  const evo = useMemo(() => evolucao(dados.historico, { ...f, tipos }, agora), [dados.historico, f, tipos, agora]);
  const mov = useMemo(() => movimentoValidar(dados.historico, { ...f, tipos }, agora), [dados.historico, f, tipos, agora]);
  // pendências de validação que o período escolhido esconde
  const antes = useMemo(
    () => (e.base === "abertura" ? filtrar(dados.cartoes, { ...f, tipos, status: "validar", responsavel: "todos", soCorporativo: false, busca: "", janelaInteira: true }).length - fila.total : 0),
    [dados.cartoes, f, tipos, e.base, fila.total]
  );
  // para a barra das três unidades, o recorte de unidade não vale
  const semUnidade = useMemo(() => filtrar(dados.cartoes, { ...f, unidade: "todas", tipos, status: "todos", responsavel: "todos", soCorporativo: false, busca: "" }), [dados.cartoes, f, tipos]);

  const lista = useMemo(() => ordenar(filtrar(dados.cartoes, f), e.ordem), [dados.cartoes, f, e.ordem]);
  const porColuna = useMemo(() => {
    const m = Object.fromEntries(COLUNAS.map((c) => [c.chave, [] as CartaoOperacao[]])) as Record<Coluna, CartaoOperacao[]>;
    for (const c of lista) m[c.coluna].push(c);
    return m;
  }, [lista]);
  const tecnicos = useMemo(() => [...new Set(dados.cartoes.map((c) => c.tecnico).filter((t): t is string => Boolean(t)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [dados.cartoes]);

  const irAoQuadro = () => document.getElementById("quadro-operacao")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const filtrarStatus = (s: Coluna) => {
    mudar({ status: e.status === s && !e.soCorporativo ? "todos" : s, soCorporativo: false });
    irAoQuadro();
  };
  const abrirPendencias = (u?: string) => {
    mudar({ status: "validar", soCorporativo: false, ordem: "espera", vista: "lista", tipos, responsavel: "todos", busca: "", ...(u ? { unidade: u } : {}) });
    irAoQuadro();
  };
  const tipoUnico = e.tipos.length === 1 && tipos.length > 1 ? e.tipos[0] : null;
  const temFiltro = e.status !== "todos" || e.responsavel !== "todos" || e.soCorporativo || Boolean(e.busca) || e.tipos.length !== tipos.length;
  const campo = setor === "operacao";

  return (
    <div>
      <CabecalhoOperacao titulo={titulo} descricao={descricao}>
        <div className="flex shrink-0 flex-col gap-1">
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-start">
            {!unidadeFixa && <SeletorUnidade valor={e.unidade} mudar={(u) => mudar({ unidade: u })} />}
            <SeletorPeriodo e={e} f={f} mudar={mudar} minimo={minimo} />
            <AtualizarOperacao compacto />
          </div>
          <p className="text-xs text-muted-foreground 2xl:text-right">
            Ocorrências lidas do SGP {haQuantoTempo(dados.atualizadoEm)}; OS {haQuantoTempo(dados.osAtualizadasEm)}. Leitura automática a cada ~15 min.
          </p>
        </div>
      </CabecalhoOperacao>
      {abas}

      <div className="space-y-4">
        {(visao === "geral" || !campo) && (
          <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", campo ? "2xl:grid-cols-6" : "xl:grid-cols-5")}>
            {(["aberta", "agendada", "execucao", "validar"] as Coluna[]).map((c) => (
              <Indicador
                key={c}
                Icone={VISUAL[c].Icone}
                icone={VISUAL[c].icone}
                fundo={VISUAL[c].cartao}
                valor={n[c]}
                rotulo={PLURAL[c]}
                detalhe={c === "validar" ? (fila.maisAntiga ? `mais antiga há ${tempoDesde(esperaDesde(fila.maisAntiga), agora)}` : "nada parado") : CURTO[c]}
                alerta={c === "validar" && fila.acimaDoPrazo > 0}
                ativo={e.status === c && !e.soCorporativo}
                aoClicar={() => filtrarStatus(c)}
              />
            ))}
            {campo && (
              <Indicador Icone={Building2} icone="bg-slate-200 text-interlig-marinho" fundo="from-slate-50" valor={n.corporativo} rotulo="Corporativo / CNPJ" detalhe="em aberto" ativo={e.soCorporativo} aoClicar={() => { mudar({ soCorporativo: !e.soCorporativo, status: "todos" }); irAoQuadro(); }} />
            )}
            <Indicador Icone={CheckCircle2} icone={VISUAL.encerrada.icone} fundo={VISUAL.encerrada.cartao} valor={n.encerrada} rotulo="Encerradas" detalhe={CURTO.encerrada} ativo={e.status === "encerrada"} aoClicar={() => filtrarStatus("encerrada")} />
          </div>
        )}

        {visao === "geral" && (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
            <Painel titulo="Ocorrências por tipo" nota="Em aberto, pelo tipo do SGP">
              <RoscaTipos dados={porTipo(base, tipos)} selecionado={tipoUnico} aoClicar={(t) => { mudar({ tipos: tipoUnico === t ? tipos : [t] }); irAoQuadro(); }} />
            </Painel>
            <Painel titulo="Evolução de ocorrências" className="order-first md:col-span-2 2xl:order-none 2xl:col-span-1">
              <GraficoEvolucao pontos={evo.pontos} semData={evo.semData} />
            </Painel>
            <AtencaoValidar fila={fila} movimento={mov} antes={antes} agora={agora} aoAbrir={() => abrirPendencias()} aoAbrirUnidade={abrirPendencias} aoVerAntes={() => mudar({ periodo: "30d" })} />
            <Painel titulo="Pendências por unidade" nota="Ocorrências em aberto">
              <BarrasUnidades dados={porUnidade(unidadeFixa ? base : semUnidade).filter((u) => !unidadeFixa || u.unidade === unidadeFixa)} selecionada={e.unidade} aoClicar={(u) => { if (!unidadeFixa) mudar({ unidade: e.unidade === u ? "todas" : u }); irAoQuadro(); }} />
            </Painel>
          </div>
        )}

        {/* filtros */}
        <div id="quadro-operacao" className="scroll-mt-20 space-y-2 rounded-2xl border bg-card p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
            <label className="relative col-span-2 block lg:w-72">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
              <input value={e.busca} onChange={(ev) => mudar({ busca: ev.target.value })} placeholder="Cliente, contrato, OS ou técnico…" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu" />
            </label>
            <Seletor rotulo="Status" valor={e.status} opcoes={[{ valor: "todos", rotulo: "Todos" }, ...COLUNAS.map((c) => ({ valor: c.chave, rotulo: PLURAL[c.chave] }))]} mudar={(v) => mudar({ status: v as Coluna | "todos" })} />
            {campo && <Seletor rotulo="Tipo" valor={tipoUnico ?? (e.tipos.length === tipos.length ? "todos" : "varios")} opcoes={[{ valor: "todos", rotulo: "Todos" }, ...(e.tipos.length > 1 && e.tipos.length < tipos.length ? [{ valor: "varios", rotulo: `${e.tipos.length} tipos` }] : []), ...tipos.map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] }))]} mudar={(v) => v !== "varios" && mudar({ tipos: v === "todos" ? tipos : [v as TipoServico] })} />}
            {!unidadeFixa && <Seletor rotulo="Unidade" valor={e.unidade} opcoes={[{ valor: "todas", rotulo: "Todas" }, ...UNIDADES_OPERACAO.map((u) => ({ valor: u, rotulo: u }))]} mudar={(v) => mudar({ unidade: v })} />}
            <Seletor rotulo="Responsável" valor={e.responsavel} opcoes={[{ valor: "todos", rotulo: "Todos" }, { valor: "sem", rotulo: "Sem técnico" }, ...tecnicos.map((t) => ({ valor: t, rotulo: t }))]} mudar={(v) => mudar({ responsavel: v })} className="lg:max-w-60" />
            <button type="button" onClick={() => mudar({ ordem: e.ordem === "espera" ? "padrao" : "espera" })} aria-pressed={e.ordem === "espera"} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium", e.ordem === "espera" ? "border-interlig-azul bg-interlig-azul/10 text-interlig-azul" : "hover:bg-muted")}>
              <ArrowDownWideNarrow className="h-4 w-4" aria-hidden /> Mais tempo parado
            </button>
            <div className="col-span-2 inline-flex rounded-xl border p-1 lg:ml-auto" role="group" aria-label="Visualização">
              {([["quadro", "Quadro", LayoutGrid], ["lista", "Lista", List]] as const).map(([v, r, Icone]) => (
                <button key={v} type="button" onClick={() => mudar({ vista: v })} aria-pressed={e.vista === v} className={cn("inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium", e.vista === v ? "bg-interlig-azul text-white" : "hover:bg-muted")}>
                  <Icone className="h-4 w-4" aria-hidden /> {r}
                </button>
              ))}
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            {n0(lista.length)} {lista.length === 1 ? "ocorrência" : "ocorrências"}
            {e.soCorporativo && " · só corporativo em aberto"}
            {temFiltro && (
              <button type="button" onClick={limpar} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-foreground hover:bg-muted">
                <X className="h-3 w-3" aria-hidden /> Limpar filtros
              </button>
            )}
          </p>
        </div>

        {e.vista === "lista" ? (
          <Lista itens={lista} limite={limites.lista} mais={() => setLimites((l) => ({ ...l, lista: l.lista + 100 }))} agora={agora} linkTemplate={linkTemplate} aoAbrir={setDetalhe} />
        ) : (
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0">
            {COLUNAS.filter((c) => e.status === "todos" || c.chave === e.status).map((col) => {
              const itens = porColuna[col.chave];
              const limite = limites[col.chave];
              const { Icone, icone, coluna } = VISUAL[col.chave];
              return (
                <section key={col.chave} id={`col-${col.chave}`} aria-label={PLURAL[col.chave]} className={cn("flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl border border-t-4 sm:w-80 xl:w-auto xl:max-w-none", coluna, e.status !== "todos" && "sm:w-full sm:max-w-none xl:col-span-5")}>
                  <header className="px-3 pb-2 pt-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full", icone)}><Icone className="h-4 w-4" aria-hidden /></span>
                      <h2 className="flex-1 text-base font-semibold">{PLURAL[col.chave]}</h2>
                      <span className={cn("rounded-full bg-background px-2.5 py-0.5 text-sm font-bold tabular-nums", col.chave === "validar" && itens.length > 0 && "text-red-700")}>{n0(itens.length)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-600">{col.ajuda}</p>
                  </header>
                  <ul className={cn("flex max-h-[75vh] flex-col gap-2 overflow-y-auto p-2", visao === "geral" ? "xl:max-h-[42rem]" : "xl:max-h-[calc(100vh-13rem)]", e.status !== "todos" && "sm:grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")}>
                    {itens.length === 0 && <li className="col-span-full px-1 py-8 text-center text-sm text-muted-foreground">Nenhuma ocorrência aqui.</li>}
                    {itens.slice(0, limite).map((c) => (
                      <Cartao key={c.ocorrenciaId} c={c} agora={agora} linkTemplate={linkTemplate} aoAbrir={() => setDetalhe(c)} />
                    ))}
                    {itens.length > limite && (
                      <li className="col-span-full">
                        <button type="button" onClick={() => setLimites((a) => ({ ...a, [col.chave]: a[col.chave] + POR_COLUNA }))} className="w-full rounded-lg border bg-background py-2 text-xs font-medium hover:bg-muted">
                          Mostrar mais {Math.min(POR_COLUNA, itens.length - limite)} de {itens.length - limite}
                        </button>
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
      {detalhe && <Detalhe c={detalhe} agora={agora} linkTemplate={linkTemplate} aoFechar={fecharDetalhe} />}
    </div>
  );
}

function Lista({ itens, limite, mais, agora, linkTemplate, aoAbrir }: { itens: CartaoOperacao[]; limite: number; mais: () => void; agora: number; linkTemplate: string | null; aoAbrir: (c: CartaoOperacao) => void }) {
  if (!itens.length) return <p className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground">Nenhuma ocorrência com estes filtros.</p>;
  const vis = itens.slice(0, limite);
  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <ul className="flex flex-col gap-2 p-2 md:hidden">
        {vis.map((c) => (
          <Cartao key={c.ocorrenciaId} c={c} agora={agora} linkTemplate={linkTemplate} aoAbrir={() => aoAbrir(c)} />
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {["Cliente", "Situação", "Tempo", "Unidade", "Técnico", "OS", "Ocorrência", ""].map((t, i) => (
                <th key={i} className="px-3 py-2 font-medium">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vis.map((c) => {
              const link = linkDo(c, linkTemplate);
              return (
                <tr key={c.ocorrenciaId} className="border-b align-top last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => aoAbrir(c)} className="text-left font-semibold hover:text-interlig-ceu hover:underline">{c.cliente}</button>
                    <span className="mt-1 block"><Selos c={c} /></span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{COLUNAS.find((x) => x.chave === c.coluna)?.rotulo}</td>
                  <td className={cn("px-3 py-2", (c.coluna === "validar" || vencida(c, agora)) && "font-semibold text-red-700")}>{textoTempo(c, agora)}</td>
                  <td className="px-3 py-2">{c.unidade}{c.bairro && <span className="block text-xs text-muted-foreground">{c.bairro}</span>}</td>
                  <td className="max-w-48 px-3 py-2">{equipeDe(c) || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{c.osId ?? "—"}<span className="block text-xs text-muted-foreground">{c.statusOs}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{c.ocorrenciaId}<span className="block text-xs text-muted-foreground">{c.statusOcorrencia}</span></td>
                  <td className="px-3 py-2">{link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-interlig-ceu hover:underline">SGP <ExternalLink className="h-3 w-3" aria-hidden /></a>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {itens.length > limite && (
        <button type="button" onClick={mais} className="w-full border-t py-3 text-sm font-medium hover:bg-muted">Mostrar mais {Math.min(100, itens.length - limite)} de {itens.length - limite}</button>
      )}
    </div>
  );
}
