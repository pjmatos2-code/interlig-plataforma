"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, LayoutList, Maximize, Minimize, Table2, X } from "lucide-react";
import { encerrarReuniaoAcao, type EstadoGrr } from "@/app/(app)/grr/acoes";
import type { Congelamento } from "@/app/(app)/grr/carregar";
import { CampoReuniao, SelecaoReuniao } from "@/components/relatorio-semanal/reuniao";
import { cn } from "@/lib/utils";
import type { DadosGrr, LinhaQuebra } from "@/lib/grr/montar";
import type { Alerta, CartaoPainel, PontoGrafico, Situacao } from "@/lib/grr/painel";
import type { AcaoCombinada, ReuniaoDaSemana } from "@/lib/grr/reuniao-dados";

/** os campos do registro da reunião vêm do relatório (sem estilo próprio): aqui ganham caixa e tamanho de tela */
const CAMPOS =
  "[&_input:not([type=checkbox])]:mt-1 [&_input:not([type=checkbox])]:block [&_input:not([type=checkbox])]:h-11 [&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:rounded-lg [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-slate-300 [&_input:not([type=checkbox])]:bg-white [&_input:not([type=checkbox])]:px-3 [&_input:not([type=checkbox])]:text-base [&_input:not([type=checkbox])]:text-slate-900 [&_select]:mt-1 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-slate-300 [&_select]:bg-white [&_select]:px-2 [&_select]:text-base [&_textarea]:mt-1 [&_textarea]:block [&_textarea]:min-h-[5.5rem] [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-slate-300 [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-base [&_textarea]:text-slate-900 [&_:focus]:border-interlig-ceu [&_:focus]:outline-none [&_[readonly]]:bg-slate-50";
import { AnelMeta, Evolucao } from "@/components/grr/painel/destaque";
import { GraficoEvolucaoVendas } from "@/components/grr/painel/grafico-evolucao";
import { ICONE_DO_GRUPO, ROTULO_STATUS, SELO_STATUS } from "@/components/grr/painel/icones";
import { RoscaSituacao } from "@/components/grr/painel/rosca";

type Props = {
  dados: Omit<DadosGrr, "tickets">;
  escopoRotulo: string;
  semana: { inicio: string; rotulo: string; completa: boolean; emAndamento: boolean };
  congelamento: Congelamento;
  destaques: CartaoPainel[];
  todos: CartaoPainel[];
  desvios: CartaoPainel[];
  situacao: Situacao;
  gruposSemDados: number;
  alertas: Alerta[];
  pontos: PontoGrafico[];
  reuniao: ReuniaoDaSemana | null;
  podeEditarReuniao: boolean;
  hrefVoltar: string;
};

const SECOES = [
  { chave: "abertura", titulo: "Abertura" },
  { chave: "resumo", titulo: "Resumo executivo" },
  { chave: "vendas", titulo: "Vendas e ativações" },
  { chave: "conversao", titulo: "Leads e conversão" },
  { chave: "receita", titulo: "Receita e qualidade da venda" },
  { chave: "desvios", titulo: "Diagnóstico dos desvios" },
  { chave: "planos", titulo: "Planos de ação" },
  { chave: "encerramento", titulo: "Encerramento" },
] as const;

const n0 = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const reais = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 }));
const dataBr = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "");
const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}`;
};

// ---------------------------------------------------------------------------
// peças de tela
// ---------------------------------------------------------------------------

function Titulo({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-bold tracking-tight text-interlig-marinho sm:text-3xl xl:text-4xl">{children}</h2>
      {sub && <p className="mt-1 text-base text-slate-600 xl:text-lg">{sub}</p>}
    </div>
  );
}

function Caixa({ children, className, titulo }: { children: React.ReactNode; className?: string; titulo?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)} aria-label={titulo}>
      {titulo && <h3 className="mb-3 text-lg font-semibold text-slate-800 xl:text-xl">{titulo}</h3>}
      {children}
    </section>
  );
}

function Numero({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border bg-white p-5 shadow-sm", destaque ? "border-interlig-azul/30" : "border-slate-200")}>
      <p className="text-sm font-medium text-slate-600 xl:text-base">{rotulo}</p>
      <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900 xl:text-5xl">{valor}</p>
      {detalhe && <div className="mt-1 text-sm text-slate-600 xl:text-base">{detalhe}</div>}
    </div>
  );
}

function CartaoGrande({ c }: { c: CartaoPainel }) {
  const Icone = ICONE_DO_GRUPO[c.grupo];
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-slate-700 xl:text-lg">
            <Icone className="h-5 w-5 shrink-0 text-interlig-azul" aria-hidden /> {c.rotulo}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="text-4xl font-bold tracking-tight xl:text-5xl">{c.valor}</span>
            {c.metaNumero != null && c.meta && <span className="text-xl font-medium text-slate-500">/ {c.meta.replace(/^meta /, "")}</span>}
          </p>
        </div>
        {c.atingimento != null ? (
          <AnelMeta atingimento={c.atingimento} status={c.status} tamanho={84} />
        ) : (
          <span className={cn("shrink-0 rounded-full border px-3 py-1 text-sm font-medium", SELO_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
        )}
      </div>
      <div className="text-sm xl:text-base">
        <Evolucao evolucao={c.evolucao} />
        {c.contexto && <p className="mt-0.5 text-slate-600">{c.contexto}</p>}
      </div>
    </div>
  );
}

/** barras horizontais simples (rótulo, barra e valor), legíveis de longe */
function Barras({ itens, formato = n0, vazio = "Sem dados no período." }: { itens: { nome: string; valor: number; extra?: string }[]; formato?: (v: number) => string; vazio?: string }) {
  if (!itens.length) return <p className="text-slate-500">{vazio}</p>;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.nome} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm xl:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] xl:text-base">
          <span className="truncate font-medium">{i.nome}</span>
          <span className="h-3 rounded-r bg-slate-100">
            <span className="block h-3 rounded-r bg-interlig-ceu" style={{ width: `${(i.valor / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">
            {formato(i.valor)}
            {i.extra && <span className="ml-1 font-normal text-slate-500">{i.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Pendente({ etapa, children }: { etapa: number | string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 text-slate-600">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Previsto na Etapa {etapa}</p>
      <p className="mt-1 text-base">{children}</p>
    </div>
  );
}

function ListaAcoes({ acoes, vazio }: { acoes: AcaoCombinada[]; vazio: string }) {
  if (!acoes.length) return <p className="text-slate-500">{vazio}</p>;
  return (
    <ul className="space-y-3">
      {acoes.map((a) => (
        <li key={a.n} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-base font-semibold xl:text-lg">{a.acao}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {a.feita ? "✓ feita · " : ""}
            {a.responsavel || "sem responsável"} · {a.prazo ? `até ${a.prazo}` : "sem prazo"}
            {a.prova ? ` · prova: ${a.prova}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** tabela completa por agente, aberta por cima da apresentação */
function TabelaAgentes({ linhas }: { linhas: LinhaQuebra[] }) {
  const cab = ["Agente", "Vendas", "Semana ant.", "Ativações", "Receita", "Ticket", "Leads atend.", "Viraram venda", "Conv. safra", "Conv. CRM", "Perdidos"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            {cab.map((c, i) => (
              <th key={c} className={cn("py-2 font-medium", i > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <td className="py-2 font-medium">
                {l.nome}
                {l.detalhe && <span className="block text-xs font-normal text-slate-500">{l.detalhe}</span>}
              </td>
              <td className="text-right font-semibold">{n0(l.vendas)}</td>
              <td className="text-right">{n0(l.vendasAnterior)}</td>
              <td className="text-right">{n0(l.ativacoes)}</td>
              <td className="text-right">{reais(l.receita)}</td>
              <td className="text-right">{reais(l.ticket)}</td>
              <td className="text-right">{n0(l.safraAtendidos)}</td>
              <td className="text-right">{n0(l.safraConvertidos)}</td>
              <td className="text-right">{pct(l.safraTaxa)}</td>
              <td className="text-right">{pct(l.conversao)}</td>
              <td className="text-right">{n0(l.perdidos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BotaoEncerrar({ semana }: { semana: string }) {
  const [estado, acao] = useFormState<EstadoGrr, FormData>(encerrarReuniaoAcao, {});
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="semana" value={semana} />
      <Enviar />
      {estado.erro && <p className="text-sm font-medium text-red-700">{estado.erro}</p>}
      {estado.ok && <p className="text-sm font-medium text-green-700">{estado.ok}</p>}
    </form>
  );
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center rounded-xl bg-interlig-azul px-5 text-base font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60">
      {pending ? "Congelando a semana…" : "Encerrar reunião e congelar a semana"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// apresentação
// ---------------------------------------------------------------------------

export function ApresentacaoGrr(p: Props) {
  const { dados, reuniao } = p;
  const [atual, setAtual] = useState(0);
  const [sumario, setSumario] = useState(false);
  const [detalhe, setDetalhe] = useState<null | "agentes">(null);
  const [cheia, setCheia] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const total = SECOES.length;

  const ir = useCallback(
    (i: number) => {
      const novo = Math.max(0, Math.min(total - 1, i));
      setAtual(novo);
      setSumario(false);
      conteudo.current?.scrollTo({ top: 0 });
      try {
        history.replaceState(null, "", `#${SECOES[novo].chave}`);
      } catch {
        /* sem histórico: segue sem guardar a seção */
      }
    },
    [total]
  );

  // volta para a seção do endereço (#vendas, #planos…) ao recarregar
  useEffect(() => {
    const i = SECOES.findIndex((s) => `#${s.chave}` === window.location.hash);
    if (i > 0) setAtual(i);
  }, []);

  const alternarTelaCheia = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else raiz.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const aoMudar = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  // teclado: setas, Page Up/Down, espaço, Home/End, F para tela cheia, Esc fecha o que estiver aberto
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        setDetalhe(null);
        setSumario(false);
        return;
      }
      if (detalhe || sumario) return;
      if (["ArrowRight", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) {
        e.preventDefault();
        ir(atual + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey)) {
        e.preventDefault();
        ir(atual - 1);
      } else if (e.key === "Home") ir(0);
      else if (e.key === "End") ir(total - 1);
      else if (e.key === "f" || e.key === "F") alternarTelaCheia();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atual, detalhe, sumario, ir, total, alternarTelaCheia]);

  const foto = p.congelamento.foto && !p.congelamento.aoVivo ? p.congelamento.foto : null;
  const statusNumeros = foto
    ? `Números congelados · versão ${foto.versao}, em ${dataHora(foto.congeladoEm)}`
    : p.semana.emAndamento
      ? "Semana em andamento · números de agora, podem mudar"
      : "Semana completa ainda não congelada · números de agora";
  const porVendas = [...dados.porAgente].sort((a, b) => b.vendas - a.vendas || a.nome.localeCompare(b.nome));
  const porConversao = dados.porAgente.filter((l) => l.safraAtendidos > 0).sort((a, b) => (b.safraTaxa ?? -1) - (a.safraTaxa ?? -1) || b.safraConvertidos - a.safraConvertidos);
  const cartao = (k: string) => p.todos.find((c) => c.chave === k);
  const r = reuniao?.reuniao ?? {};

  const telas: React.ReactNode[] = [
    // 1. Abertura
    <div key="abertura" className="flex min-h-full flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-interlig-marinho via-interlig-azul to-interlig-ceu px-6 py-12 text-center text-white">
      <Image src="/marca/logo-fundo-escuro.png" alt="Interlig" width={260} height={80} className="h-auto w-48 sm:w-64" priority />
      <p className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Reunião de resultados</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-6xl">GRR Comercial</h1>
      <p className="mt-3 text-xl text-white/90 sm:text-2xl">{p.escopoRotulo}</p>
      <p className="mt-1 text-lg tabular-nums text-white/80 sm:text-xl">Semana de {p.semana.rotulo}</p>
      <dl className="mt-10 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {[
          ["Data da reunião", r["reuniao-data"] ? dataBr(r["reuniao-data"]) : "não registrada"],
          ["Participantes", r["reuniao-quem"] || "não registrados"],
          ["Situação", foto ? "Números congelados" : p.semana.emAndamento ? "Semana em andamento" : "Aguardando encerramento"],
        ].map(([t, v]) => (
          <div key={t} className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
            <dt className="text-xs font-medium uppercase tracking-wide text-white/60">{t}</dt>
            <dd className="mt-1 text-base font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-white/70">{statusNumeros}</p>
    </div>,

    // 2. Resumo executivo
    <div key="resumo">
      <Titulo sub={`Semana de ${p.semana.rotulo}, comparada à semana anterior.`}>Resumo executivo</Titulo>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {p.destaques.slice(0, 2).map((c) => (
          <CartaoGrande key={c.chave} c={c} />
        ))}
        {cartao("vendas_mes") && <CartaoGrande c={cartao("vendas_mes")!} />}
        {p.destaques.slice(2).map((c) => (
          <CartaoGrande key={c.chave} c={c} />
        ))}
        {cartao("ticket") && <CartaoGrande c={cartao("ticket")!} />}
      </div>
      <Caixa titulo="Principais alertas" className="mt-4">
        {p.alertas.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {p.alertas.map((a) => (
              <li key={a.titulo} className={cn("flex gap-2 rounded-xl border px-4 py-3", a.nivel === "critico" ? "border-farol-vermelho/30 bg-farol-vermelho/[0.07]" : "border-farol-amarelo/40 bg-farol-amarelo/[0.1]")}>
                <AlertTriangle className={cn("mt-1 h-5 w-5 shrink-0", a.nivel === "critico" ? "text-farol-vermelho" : "text-farol-amarelo")} aria-hidden />
                <div>
                  <p className="text-base font-semibold">
                    <span className="sr-only">{a.nivel === "critico" ? "Crítico: " : "Atenção: "}</span>
                    {a.titulo}
                  </p>
                  {a.texto && <p className="text-sm text-slate-600">{a.texto}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">Nenhum indicador em atenção ou crítico.</p>
        )}
      </Caixa>
    </div>,

    // 3. Vendas e ativações
    <div key="vendas">
      <Titulo sub="Evolução, meta, resultado por unidade e por agente, ativações e pendências.">Vendas e ativações</Titulo>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Caixa titulo="Evolução das vendas (8 semanas)">
          <GraficoEvolucaoVendas dados={p.pontos} altura={270} grande />
          <p className="mt-1 text-sm text-slate-500">Barra escura: semana analisada{p.semana.emAndamento ? " (em andamento, mais clara)" : ""}. Traço laranja: meta da semana.</p>
        </Caixa>
        <div className="grid content-start gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <Numero rotulo="Ativações na semana" valor={n0(dados.ativacoes.semana)} detalhe={`semana anterior: ${n0(dados.ativacoes.anterior)}`} />
          <Numero rotulo="Instalações paradas há mais de 7 dias" valor={n0(dados.ativacoes.paradasMais7Dias)} detalhe={`${n0(dados.ativacoes.aguardandoRecentes)} aguardando instalação hoje`} />
          <Numero rotulo="Sem assinar há 48h ou mais" valor={n0(dados.ativacoes.acima48hDaSemana)} detalhe={`${n0(dados.ativacoes.semAssinarDaSemana)} da semana sem assinar`} />
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Caixa titulo="Vendas por unidade">
          <Barras itens={dados.porUnidade.map((l) => ({ nome: l.nome, valor: l.vendas, extra: l.metaMes ? `· mês ${n0(l.vendasMes)}/${n0(l.metaMes)}` : undefined }))} />
        </Caixa>
        <Caixa titulo="Vendas por agente">
          <Barras itens={porVendas.slice(0, 7).map((l) => ({ nome: l.nome, valor: l.vendas }))} />
          <button type="button" onClick={() => setDetalhe("agentes")} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-interlig-azul hover:underline">
            <Table2 className="h-4 w-4" aria-hidden /> Ver todos os agentes
          </button>
        </Caixa>
      </div>
    </div>,

    // 4. Leads e conversão
    <div key="conversao">
      <Titulo sub="Tickets comerciais do CRM (alimentados pelo SZ Chat), reconciliados com as vendas do SGP.">Leads e conversão</Titulo>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Numero rotulo="Leads recebidos" valor={n0(dados.conversao.safra.leads)} detalhe={`${n0(dados.conversao.recebidos)} tickets abertos no trecho`} />
        <Numero rotulo="Leads atendidos" valor={n0(dados.conversao.safra.atendidos)} detalhe={`${n0(dados.conversao.safra.emNegociacao)} ainda em negociação`} />
        <Numero rotulo="Viraram venda" valor={n0(dados.conversao.safra.convertidos)} detalhe={`conversão por safra: ${pct(dados.conversao.safra.taxa)}`} destaque />
        <Numero rotulo="Conversão do CRM" valor={pct(dados.conversao.taxa)} detalhe={`${n0(dados.conversao.convertidos)} de ${n0(dados.conversao.fechados)} tickets fechados`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Caixa titulo="Conversão por safra, por agente">
          <Barras itens={porConversao.slice(0, 8).map((l) => ({ nome: l.nome, valor: Math.round((l.safraTaxa ?? 0) * 100), extra: `(${l.safraConvertidos} de ${l.safraAtendidos})` }))} formato={(v) => `${v}%`} vazio="Nenhum lead atendido no período." />
          <button type="button" onClick={() => setDetalhe("agentes")} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-interlig-azul hover:underline">
            <Table2 className="h-4 w-4" aria-hidden /> Ver a produtividade de todos
          </button>
        </Caixa>
        <Caixa titulo="Motivos de perda">
          <Barras itens={dados.perdas.motivos.slice(0, 6).map((m) => ({ nome: m.motivo, valor: m.quantidade }))} vazio="Nenhuma perda registrada no período." />
          <p className="mt-3 text-sm text-slate-600">
            Follow-up: <b>{n0(dados.perdas.retornosVencidos)}</b> retornos vencidos · <b>{n0(dados.perdas.retornosHoje)}</b> para hoje · <b>{n0(dados.perdas.retornosFeitosSemana)}</b> feitos na semana
          </p>
        </Caixa>
      </div>
      <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-sm text-slate-600">
        Limites da atribuição: {n0(dados.conversao.convertidasSemLead)} vendas da semana foram lançadas direto no SGP, sem atendimento no CRM (contam só na conversão do CRM);{" "}
        {n0(dados.conversao.safra.repetidos)} tickets repetidos do mesmo lead foram juntados na conta por safra. A quantidade de mensagens não é usada como quantidade de leads.
      </p>
    </div>,

    // 5. Receita e qualidade da venda
    <div key="receita">
      <Titulo sub="Mensalidade dos contratos novos e o que ainda depende da régua de qualidade.">Receita e qualidade da venda</Titulo>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Numero rotulo="Receita nova da semana" valor={reais(dados.receita.semana)} detalhe={`semana anterior: ${reais(dados.receita.anterior)}`} destaque />
        <Numero rotulo="Ticket médio da semana" valor={reais(dados.receita.ticket)} detalhe={`semana anterior: ${reais(dados.receita.ticketAnterior)}`} />
        <Numero rotulo={`Receita nova de ${dados.mes.nome}`} valor={reais(dados.receita.mes)} />
        <Numero rotulo={`Ticket médio de ${dados.mes.nome}`} valor={reais(dados.receita.ticketMes)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Caixa titulo="Ticket médio por agente">
          <Barras itens={porVendas.filter((l) => l.ticket != null).slice(0, 8).map((l) => ({ nome: l.nome, valor: Math.round(l.ticket!), extra: `(${l.vendas} vendas)` }))} formato={(v) => reais(v)} />
        </Caixa>
        <div className="grid content-start gap-4">
          <Pendente etapa={5}>Inadimplência da primeira fatura, ranking por agente e clientes suspensos das safras: a regra (faturas não vencidas, vencidas e suspensos) ainda depende de decisão.</Pendente>
          <Pendente etapa={5}>Churn precoce em 90 dias, por safra de ativação.</Pendente>
          <p className="text-sm text-slate-500">Mix de planos: ainda não calculado no GRR.</p>
        </div>
      </div>
    </div>,

    // 6. Diagnóstico dos desvios
    <div key="desvios">
      <Titulo sub="Indicadores em atenção ou críticos no período.">Diagnóstico dos desvios</Titulo>
      {p.desvios.length === 0 ? (
        <Caixa>
          <p className="text-lg text-slate-600">Nenhum indicador em atenção ou crítico nesta semana.</p>
        </Caixa>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {p.desvios.map((c) => (
            <Caixa key={c.chave}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold xl:text-xl">{c.rotulo}</h3>
                <span className={cn("shrink-0 rounded-full border px-3 py-1 text-sm font-medium", SELO_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-slate-50 py-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Realizado</dt>
                  <dd className="text-2xl font-bold tabular-nums">{c.valor}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 py-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Meta</dt>
                  <dd className="text-2xl font-bold tabular-nums">{c.meta ? c.meta.replace(/^meta /, "") : "—"}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 py-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Desvio</dt>
                  <dd className="text-2xl font-bold tabular-nums">
                    {c.atingimento != null ? `${Math.round((c.atingimento - 1) * 100)}%` : c.metaNumero != null && c.numero != null ? `${c.numero > c.metaNumero ? "+" : ""}${n0(c.numero - c.metaNumero)}` : "—"}
                  </dd>
                </div>
              </dl>
              {c.contexto && <p className="mt-3 text-sm text-slate-600">{c.contexto}</p>}
            </Caixa>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Caixa titulo="Motivo real do desvio (registro da reunião)">
          {reuniao ? (
            <div className={CAMPOS}>
            <CampoReuniao id={reuniao.relatorioId} campo="a2" inicial={r.a2 ?? ""} placeholder="O que explica o número, sem desculpa." podeEditar={p.podeEditarReuniao} multilinha ariaLabel="Motivo real do desvio" />
            </div>
          ) : (
            <p className="text-slate-500">Sem registro de reunião para esta semana (o Relatório da diretoria da semana ainda não foi gerado ou o perfil não tem acesso).</p>
          )}
        </Caixa>
        <Pendente etapa={3}>Diagnóstico da coordenação por indicador: causa, evidências, providências já tomadas e solução proposta.</Pendente>
      </div>
      <button type="button" onClick={() => setDetalhe("agentes")} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-interlig-azul hover:underline">
        <Table2 className="h-4 w-4" aria-hidden /> Ver os dados por agente
      </button>
    </div>,

    // 7. Planos de ação
    <div key="planos">
      <Titulo sub="Conferência do que foi combinado e as ações que saem desta reunião.">Planos de ação</Titulo>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Caixa titulo="Combinado na reunião anterior: o que foi feito?">
          {!reuniao ? (
            <p className="text-slate-500">Sem registro de reunião para esta semana (o relatório da semana não foi gerado ou o perfil não tem acesso).</p>
          ) : reuniao.combinadoAnterior.length === 0 && ![1, 2, 3, 4, 5].some((n) => r[`w${n}a`]) ? (
            <p className="text-slate-500">Nenhuma ação registrada na reunião anterior.</p>
          ) : (
            <div className={cn("space-y-3", CAMPOS)}>
              {[1, 2, 3, 4, 5]
                .filter((n) => r[`w${n}a`] || reuniao.combinadoAnterior[n - 1])
                .map((n) => {
                  const a = reuniao.combinadoAnterior[n - 1];
                  return (
                    <div key={n} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_10rem] [&_input]:!mt-0 [&_select]:!mt-0">
                      <div className="min-w-0">
                        <CampoReuniao id={reuniao.relatorioId} campo={`w${n}a`} inicial={r[`w${n}a`] || a?.acao || ""} podeEditar={p.podeEditarReuniao} ariaLabel={`Combinado ${n}`} />
                        <p className="mt-1 text-sm text-slate-600">
                          {r[`w${n}r`] || a?.responsavel || "sem responsável"}
                          {a?.prazo ? ` · até ${a.prazo}` : ""}
                          {a?.prova ? ` · prova: ${a.prova}` : ""}
                        </p>
                      </div>
                      <SelecaoReuniao id={reuniao.relatorioId} campo={`w${n}s`} inicial={r[`w${n}s`] ?? ""} podeEditar={p.podeEditarReuniao} ariaLabel={`Situação do combinado ${n}`} />
                    </div>
                  );
                })}
              <p className="text-sm text-slate-500">A situação (Feito, Parcial, Não feito) se salva no registro da reunião, a mesma conferência da página do relatório.</p>
            </div>
          )}
        </Caixa>
        <div className="grid content-start gap-4">
          <Caixa titulo="Ações desta reunião">
            {reuniao ? <ListaAcoes acoes={reuniao.combinado} vazio="Nenhuma ação registrada ainda. Registre no encerramento." /> : <p className="text-slate-500">Sem registro de reunião para esta semana.</p>}
          </Caixa>
          <Pendente etapa={3}>Planos de ação com situação acompanhada durante a semana (em andamento, aguardando validação, atrasada), evidências de execução e aprovação, ajuste ou rejeição pela diretoria.</Pendente>
        </div>
      </div>
    </div>,

    // 8. Encerramento
    <div key="encerramento">
      <Titulo sub="Resumo, decisões e o fechamento oficial da semana.">Encerramento</Titulo>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-4">
          <Caixa titulo="Situação dos indicadores">
            <RoscaSituacao situacao={p.situacao} gruposSemDados={p.gruposSemDados} />
          </Caixa>
          <Caixa titulo="Fechamento oficial">
            {foto ? (
              <p className="text-base">
                Semana congelada na versão {foto.versao}, em {dataHora(foto.congeladoEm)}. Os números desta apresentação estão preservados; correções criam nova versão com motivo.
              </p>
            ) : p.congelamento.aoVivo && p.congelamento.foto ? (
              <p className="text-base">Esta semana já está congelada (versão {p.congelamento.foto.versao}). A apresentação está mostrando os números de agora.</p>
            ) : !p.semana.completa ? (
              <p className="text-base text-slate-600">A semana ainda está em andamento. O encerramento oficial congela só semana completa.</p>
            ) : !p.congelamento.disponivel ? (
              <p className="text-base text-slate-600">As tabelas do GRR não estão disponíveis; não é possível congelar.</p>
            ) : p.congelamento.podeCongelar ? (
              <div className="space-y-2">
                <p className="text-base text-slate-600">Encerrar congela os números da semana em todos os recortes. As decisões ao lado continuam editáveis.</p>
                <BotaoEncerrar semana={p.semana.inicio} />
              </div>
            ) : (
              <p className="text-base text-slate-600">O encerramento oficial é feito pela diretoria.</p>
            )}
          </Caixa>
        </div>
        <Caixa titulo="Decisões da reunião">
          {reuniao ? (
            <div className={cn("space-y-4", CAMPOS)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-600">
                  Data da reunião
                  <CampoReuniao id={reuniao.relatorioId} campo="reuniao-data" inicial={r["reuniao-data"] ?? ""} tipo="date" podeEditar={p.podeEditarReuniao} ariaLabel="Data da reunião" />
                </label>
                <label className="block text-sm font-medium text-slate-600">
                  Participantes
                  <CampoReuniao id={reuniao.relatorioId} campo="reuniao-quem" inicial={r["reuniao-quem"] ?? ""} placeholder="Quem participou" podeEditar={p.podeEditarReuniao} ariaLabel="Participantes" />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-600">
                O que foi entregue contra a meta?
                <CampoReuniao id={reuniao.relatorioId} campo="a1" inicial={r.a1 ?? ""} placeholder="Vendas, receita, assinaturas, time e origem." podeEditar={p.podeEditarReuniao} multilinha ariaLabel="O que foi entregue contra a meta" />
              </label>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-600">Ações combinadas para a próxima semana (ação, responsável e prazo)</p>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_9rem] [&_input]:!mt-0">
                      <CampoReuniao id={reuniao.relatorioId} campo={`p${n}a`} inicial={r[`p${n}a`] ?? ""} placeholder={`Ação ${n}`} podeEditar={p.podeEditarReuniao} ariaLabel={`Ação ${n}`} />
                      <CampoReuniao id={reuniao.relatorioId} campo={`p${n}r`} inicial={r[`p${n}r`] ?? ""} placeholder="Responsável" podeEditar={p.podeEditarReuniao} ariaLabel={`Responsável da ação ${n}`} />
                      <CampoReuniao id={reuniao.relatorioId} campo={`p${n}p`} inicial={r[`p${n}p`] ?? ""} placeholder="Prazo" podeEditar={p.podeEditarReuniao} ariaLabel={`Prazo da ação ${n}`} />
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">Cada campo se salva sozinho no registro da reunião do Relatório da diretoria (os mesmos campos da página do relatório).</p>
            </div>
          ) : (
            <p className="text-slate-500">
              Sem registro de reunião para esta semana. As decisões ficam no Relatório da diretoria da semana; gere o relatório para registrá-las aqui.
            </p>
          )}
        </Caixa>
      </div>
    </div>,
  ];

  return (
    <div ref={raiz} className="flex h-dvh flex-col bg-slate-100">
      {/* barra superior */}
      <header className="flex shrink-0 items-center gap-3 bg-interlig-marinho px-3 py-2 text-white sm:px-5">
        <Image src="/marca/logo-fundo-escuro.png" alt="Interlig" width={120} height={36} className="hidden h-7 w-auto sm:block" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">GRR Comercial · {p.escopoRotulo}</p>
          <p className="truncate text-xs tabular-nums text-white/70">
            Semana de {p.semana.rotulo} · {foto ? `congelada (v${foto.versao})` : "números de agora"}
          </p>
        </div>
        <button type="button" onClick={() => setSumario((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm hover:bg-white/10" aria-expanded={sumario}>
          <LayoutList className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Seções</span>
        </button>
        <button type="button" onClick={alternarTelaCheia} className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm hover:bg-white/10 sm:inline-flex" aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}>
          {cheia ? <Minimize className="h-4 w-4" aria-hidden /> : <Maximize className="h-4 w-4" aria-hidden />}
          <span className="hidden md:inline">{cheia ? "Sair da tela cheia" : "Tela cheia"}</span>
        </button>
        <Link href={p.hrefVoltar} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-medium hover:bg-white/20">
          <X className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Voltar ao GRR</span>
        </Link>
      </header>

      {/* sumário: acesso direto a uma seção */}
      {sumario && (
        <nav aria-label="Seções da apresentação" className="absolute right-3 top-14 z-30 w-72 rounded-2xl border bg-white p-2 shadow-xl sm:right-24">
          <ol>
            {SECOES.map((s, i) => (
              <li key={s.chave}>
                <button type="button" onClick={() => ir(i)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100", i === atual && "bg-interlig-azul/10 font-semibold text-interlig-azul")}>
                  <span className="w-5 text-right tabular-nums text-slate-400">{i + 1}</span> {s.titulo}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* tela atual */}
      <main ref={conteudo} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto h-full w-full max-w-[96rem] px-4 py-5 sm:px-8 xl:px-12 xl:py-8">{telas[atual]}</div>
      </main>

      {/* navegação */}
      <footer className="flex shrink-0 items-center gap-2 border-t bg-white px-3 py-2 sm:px-5">
        <button type="button" onClick={() => ir(atual - 1)} disabled={atual === 0} className="inline-flex h-10 items-center gap-1 rounded-lg border px-3 text-sm font-medium hover:border-interlig-ceu disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Anterior</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <ol className="hidden items-center gap-1.5 md:flex" aria-label="Etapas">
            {SECOES.map((s, i) => (
              <li key={s.chave}>
                <button type="button" onClick={() => ir(i)} aria-label={`${i + 1}. ${s.titulo}`} aria-current={i === atual ? "step" : undefined} className={cn("block h-2.5 rounded-full transition-all", i === atual ? "w-8 bg-interlig-azul" : "w-2.5 bg-slate-300 hover:bg-slate-400")} />
              </li>
            ))}
          </ol>
          <p className="truncate text-sm font-medium tabular-nums text-slate-700">
            {atual + 1} de {total} · {SECOES[atual].titulo}
          </p>
        </div>
        <button type="button" onClick={() => ir(atual + 1)} disabled={atual === total - 1} className="inline-flex h-10 items-center gap-1 rounded-lg bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-40">
          <span className="hidden sm:inline">Próximo</span> <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </footer>

      {/* detalhamento por cima da apresentação */}
      {detalhe === "agentes" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Dados por agente" onClick={() => setDetalhe(null)}>
          <div className="max-h-full w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Dados por agente · semana de {p.semana.rotulo}</h3>
              <button type="button" onClick={() => setDetalhe(null)} className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm hover:border-interlig-ceu" autoFocus>
                <X className="h-4 w-4" aria-hidden /> Fechar
              </button>
            </div>
            <TabelaAgentes linhas={porVendas} />
          </div>
        </div>
      )}
    </div>
  );
}
