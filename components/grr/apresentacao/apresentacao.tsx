"use client";

import Image from "next/image";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Table2 } from "lucide-react";
import { encerrarReuniaoAcao, type EstadoGrr } from "@/app/(app)/grr/acoes";
import type { Congelamento } from "@/app/(app)/grr/carregar";
import { CampoReuniao, SelecaoReuniao } from "@/components/relatorio-semanal/reuniao";
import { cn } from "@/lib/utils";
import type { DadosGrr } from "@/lib/grr/montar";
import type { Alerta, CartaoPainel, PontoGrafico, Situacao } from "@/lib/grr/painel";
import type { AcaoCombinada, ReuniaoDaSemana } from "@/lib/grr/reuniao-dados";
import { situacaoExibida, type Diagnostico, type Plano } from "@/lib/grr/planos";
import { FormAprovacaoPlano } from "@/components/grr/planos/formularios";
import { SeloAprovacao, SeloSituacao } from "@/components/grr/planos/selos";
import { FormDecisao, FormEncerrarDiretoria, ListaDecisoesEditavel } from "@/components/grr/reunioes/diretoria-forms";
import type { AtaDiretoria } from "@/lib/grr/reunioes";
import { GraficoEvolucaoVendas } from "@/components/grr/painel/grafico-evolucao";
import { ROTULO_STATUS, SELO_STATUS } from "@/components/grr/painel/icones";
import { RoscaSituacao } from "@/components/grr/painel/rosca";
import { Moldura, Sobreposicao, useSecao } from "./moldura";
import { Barras, Caixa, CartaoGrande, dataBr, dataHora, n0, Numero, pct, reais, TabelaAgentes, Titulo } from "./pecas";

/** os campos do registro da reunião vêm do relatório (sem estilo próprio): aqui ganham caixa e tamanho de tela */
export const CAMPOS =
  "[&_input:not([type=checkbox])]:mt-1 [&_input:not([type=checkbox])]:block [&_input:not([type=checkbox])]:h-11 [&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:rounded-lg [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-slate-300 [&_input:not([type=checkbox])]:bg-white [&_input:not([type=checkbox])]:px-3 [&_input:not([type=checkbox])]:text-base [&_input:not([type=checkbox])]:text-slate-900 [&_select]:mt-1 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-slate-300 [&_select]:bg-white [&_select]:px-2 [&_select]:text-base [&_textarea]:mt-1 [&_textarea]:block [&_textarea]:min-h-[5.5rem] [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-slate-300 [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-base [&_textarea]:text-slate-900 [&_:focus]:border-interlig-ceu [&_:focus]:outline-none [&_[readonly]]:bg-slate-50";

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
  /** Etapa 3: diagnósticos atuais da semana (todos os recortes visíveis) e planos ativos */
  diagnosticos: Diagnostico[];
  planos: Plano[];
  hoje: string;
  diretoria: boolean;
  /** reunião de resultados registrada no GRR (Etapa 4); sem ela, a apresentação é só da semana */
  reuniaoGrr: { id: string; data: string; participantes: string[]; aberta: boolean; encerradaEm: string | null; ata: AtaDiretoria } | null;
  hrefVoltar: string;
};

const SECOES = [
  { chave: "abertura", titulo: "Abertura" },
  { chave: "resumo", titulo: "Resumo executivo" },
  { chave: "vendas", titulo: "Vendas e ativações" },
  { chave: "conversao", titulo: "Leads e conversão" },
  { chave: "receita", titulo: "Receita" },
  { chave: "desvios", titulo: "Diagnóstico dos desvios" },
  { chave: "planos", titulo: "Planos de ação" },
  { chave: "encerramento", titulo: "Encerramento" },
] as const;

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
  const { atual, ir } = useSecao(SECOES);
  const [detalhe, setDetalhe] = useState<null | "agentes">(null);
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
  const g = p.reuniaoGrr;

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
          ["Data da reunião", g ? dataBr(g.data) : r["reuniao-data"] ? dataBr(r["reuniao-data"]) : "não registrada"],
          ["Participantes", g ? g.participantes.join(", ") || "não registrados" : r["reuniao-quem"] || "não registrados"],
          ["Situação", g && !g.aberta ? "Reunião encerrada" : foto ? "Números congelados" : p.semana.emAndamento ? "Semana em andamento" : "Aguardando encerramento"],
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
      <Titulo sub="Mensalidade dos contratos novos e ticket médio.">Receita</Titulo>
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
              <div className="mt-3 space-y-2">
                {p.diagnosticos.filter((d) => d.indicador === c.chave).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Sem diagnóstico registrado pela coordenação.</p>
                ) : (
                  p.diagnosticos
                    .filter((d) => d.indicador === c.chave)
                    .map((d) => (
                      <div key={d.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.escopo_rotulo}</p>
                        <p><b>Causa:</b> {d.causa}</p>
                        <p><b>Evidências:</b> {d.evidencias || <span className="text-amber-700">sem evidência (hipótese)</span>}</p>
                        {d.providencias && <p><b>Providências:</b> {d.providencias}</p>}
                        {d.solucao && <p><b>Solução proposta:</b> {d.solucao}</p>}
                      </div>
                    ))
                )}
              </div>
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
        <Caixa titulo="Diagnósticos de indicadores que não estão em desvio">
          {p.diagnosticos.filter((d) => !p.desvios.some((c) => c.chave === d.indicador)).length === 0 ? (
            <p className="text-slate-500">Nenhum.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {p.diagnosticos
                .filter((d) => !p.desvios.some((c) => c.chave === d.indicador))
                .map((d) => (
                  <li key={d.id}>
                    <b>{d.escopo_rotulo}</b> · {d.indicador}: {d.causa}
                  </li>
                ))}
            </ul>
          )}
        </Caixa>
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
          <Caixa titulo={`Planos de ação aguardando a diretoria (${p.planos.filter((x) => x.aprovacao === "aguardando").length})`}>
            {p.planos.filter((x) => x.aprovacao === "aguardando").length === 0 ? (
              <p className="text-slate-500">Nenhum plano aguardando decisão.</p>
            ) : (
              <ul className="space-y-3">
                {p.planos
                  .filter((x) => x.aprovacao === "aguardando")
                  .map((x) => (
                    <li key={x.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-base font-semibold">{x.descricao}</p>
                      <p className="text-sm text-slate-600">
                        {x.escopo_rotulo} · {x.responsavel_nome} · {x.prazo ? `até ${dataBr(x.prazo)}` : "sem prazo"}
                        {x.resultado_esperado ? ` · espera: ${x.resultado_esperado}` : ""}
                      </p>
                      {p.diretoria && (
                        <div className="mt-2">
                          <FormAprovacaoPlano id={x.id} compacto />
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </Caixa>
        </div>
      </div>
      <Caixa titulo="Acompanhamento dos planos em execução" className="mt-4">
        {p.planos.filter((x) => x.aprovacao === "aprovado" && ["pendente", "em_andamento", "aguardando_validacao"].includes(x.situacao)).length === 0 ? (
          <p className="text-slate-500">Nenhum plano aprovado em execução.</p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {p.planos
              .filter((x) => x.aprovacao === "aprovado" && ["pendente", "em_andamento", "aguardando_validacao"].includes(x.situacao))
              .sort((a, b) => (a.prazo ?? "9").localeCompare(b.prazo ?? "9"))
              .map((x) => (
                <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{x.descricao}</p>
                    <p className="text-sm text-slate-600">
                      {x.escopo_rotulo} · {x.responsavel_nome} · {x.prazo ? `até ${dataBr(x.prazo)}` : "sem prazo"}
                    </p>
                  </div>
                  <SeloSituacao s={situacaoExibida(x, p.hoje)} className="text-sm" />
                </li>
              ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-slate-500">Validar e concluir, registrar evidências e ver o histórico: em Planos de ação, no GRR.</p>
      </Caixa>
    </div>,

    // 8. Encerramento
    <div key="encerramento">
      <Titulo sub="Resumo, decisões e o fechamento oficial da semana.">Encerramento</Titulo>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-4">
          <Caixa titulo="Situação dos indicadores">
            <RoscaSituacao situacao={p.situacao} gruposSemDados={p.gruposSemDados} />
          </Caixa>
          {g ? (
            <Caixa titulo="Fechamento oficial">
              {!g.aberta ? (
                <p className="text-base">Reunião encerrada em {g.encerradaEm ? dataHora(g.encerradaEm) : "—"}. A ata, os números e as decisões estão guardados; o relatório em PDF está na página da reunião.</p>
              ) : p.diretoria ? (
                <div className="space-y-2">
                  <p className="text-base text-slate-600">Encerrar congela a semana (se ainda não estiver) e guarda a ata da reunião.</p>
                  <FormEncerrarDiretoria id={g.id} grande />
                </div>
              ) : (
                <p className="text-base text-slate-600">Só a diretoria encerra a reunião de resultados.</p>
              )}
            </Caixa>
          ) : (
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
          )}
        </div>
        {g ? (
          <Caixa titulo="Decisões da reunião">
            {g.ata.decisoes.length === 0 ? (
              <p className="text-slate-500">Nenhuma decisão registrada ainda.</p>
            ) : (
              <ol className="list-decimal space-y-2 pl-6 text-base">
                {g.ata.decisoes.map((d) => (
                  <li key={d.id}>
                    <b>{d.texto}</b>
                    <span className="text-slate-600"> · {d.responsavel || "sem responsável"} · {d.prazo ? `até ${dataBr(d.prazo)}` : "sem prazo"}</span>
                  </li>
                ))}
              </ol>
            )}
            {g.aberta && p.diretoria && (
              <div className="mt-4 space-y-3">
                <FormDecisao id={g.id} />
                <ListaDecisoesEditavel id={g.id} decisoes={g.ata.decisoes} />
              </div>
            )}
          </Caixa>
        ) : (
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
        )}
      </div>
    </div>,
  ];

  return (
    <Moldura
      titulo={`GRR Comercial · ${p.escopoRotulo}`}
      subtitulo={`Semana de ${p.semana.rotulo} · ${foto ? `congelada (v${foto.versao})` : "números de agora"}`}
      secoes={SECOES}
      telas={telas}
      hrefVoltar={p.hrefVoltar}
      atual={atual}
      ir={ir}
      sobreposicao={
        detalhe === "agentes" ? (
          <Sobreposicao titulo={`Dados por agente · semana de ${p.semana.rotulo}`} aoFechar={() => setDetalhe(null)}>
            <TabelaAgentes linhas={porVendas} />
          </Sobreposicao>
        ) : null
      }
      aoFecharSobreposicao={() => setDetalhe(null)}
    />
  );
}
