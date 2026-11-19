"use client";

import Image from "next/image";
import { useState } from "react";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DadosGrr, LinhaQuebra } from "@/lib/grr/montar";
import type { CartaoPainel } from "@/lib/grr/painel";
import { ROTULO_APROVACAO, ROTULO_SITUACAO, type Compromisso, type Participante } from "@/lib/grr/reunioes";
import { FormCompromisso, FormEncerrar, SeletorSituacao } from "@/components/grr/reunioes/formularios";
import { TabelaEquipe } from "@/components/grr/reunioes/tabela-equipe";
import { Moldura, Sobreposicao, useSecao } from "./moldura";
import { Barras, Caixa, CartaoGrande, dataBr, dataHora, n0, Numero, Pendente, pct, reais, Titulo } from "./pecas";

/**
 * Modo Apresentação da Reunião Semanal da Equipe Comercial (coordenação com os
 * agentes). Mesma moldura e mesmas peças da reunião da diretoria; números da
 * equipe e de cada agente, sem receita individual (dado financeiro).
 */

const SECOES = [
  { chave: "abertura", titulo: "Abertura" },
  { chave: "equipe", titulo: "A equipe na semana" },
  { chave: "vendas", titulo: "Vendas por agente" },
  { chave: "conversao", titulo: "Leads e conversão" },
  { chave: "pendencias", titulo: "Pendências e follow-ups" },
  { chave: "perdas", titulo: "Motivos de perda" },
  { chave: "evolucao", titulo: "Evolução individual" },
  { chave: "compromissos", titulo: "Compromissos" },
  { chave: "qualidade", titulo: "Qualidade da venda" },
  { chave: "encerramento", titulo: "Encerramento" },
] as const;

type Props = {
  reuniao: {
    id: string;
    escopoRotulo: string;
    responsavel: string | null;
    data: string;
    periodo: string;
    participantes: Participante[];
    observacoes: string | null;
    boasPraticas: string | null;
    aberta: boolean;
    encerradaEm: string | null;
  };
  dados: Omit<DadosGrr, "tickets">;
  congelados: boolean;
  agentes: LinhaQuebra[];
  cartoes: CartaoPainel[];
  compromissos: Compromisso[];
  anteriores: Compromisso[];
  pode: boolean;
  hrefVoltar: string;
};

function Variacao({ antes, agora, formato }: { antes: number | null; agora: number | null; formato: (v: number | null) => string }) {
  const diff = antes != null && agora != null ? agora - antes : null;
  return (
    <span className="tabular-nums">
      <span className="text-slate-500">{formato(antes)}</span> → <b>{formato(agora)}</b>
      {diff != null && diff !== 0 && <span className={cn("ml-1", diff > 0 ? "text-green-700" : "text-red-700")}>{diff > 0 ? "▲" : "▼"}</span>}
    </span>
  );
}

function ListaCompromissos({ lista, reuniaoId, pode, vazio }: { lista: Compromisso[]; reuniaoId: string; pode: boolean; vazio: string }) {
  if (!lista.length) return <p className="text-slate-500">{vazio}</p>;
  return (
    <ul className="space-y-2">
      {lista.map((c) => (
        <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold xl:text-lg">{c.descricao}</p>
            <p className="text-sm text-slate-600">
              {c.responsavel_nome ?? "Equipe"} · {c.prazo ? `até ${dataBr(c.prazo)}` : "sem prazo"}
              {c.tipo === "gerencial" ? ` · gerencial: ${ROTULO_APROVACAO[c.aprovacao]}` : ""}
            </p>
          </div>
          {pode ? (
            <SeletorSituacao id={reuniaoId} compromisso={c.id} situacao={c.situacao} podeEditar />
          ) : (
            <span className="rounded-full border bg-white px-3 py-1 text-sm font-medium">{ROTULO_SITUACAO[c.situacao]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ApresentacaoEquipe(p: Props) {
  const { dados, reuniao: r, agentes } = p;
  const { atual, ir } = useSecao(SECOES);
  const [tabela, setTabela] = useState(false);
  const cartao = (k: string) => p.cartoes.find((c) => c.chave === k);
  const porVendas = [...agentes].sort((a, b) => b.vendas - a.vendas || a.nome.localeCompare(b.nome));
  const porConversao = agentes.filter((l) => l.safraAtendidos > 0).sort((a, b) => (b.safraTaxa ?? -1) - (a.safraTaxa ?? -1));
  const op = (l: LinhaQuebra) => l.operacional;
  const soma = (f: (l: LinhaQuebra) => number) => agentes.reduce((t, l) => t + f(l), 0);
  const status = p.congelados ? `números guardados em ${r.encerradaEm ? dataHora(r.encerradaEm) : "—"}` : `números de agora${dados.trechos.emAndamento ? ", semana em andamento" : ""}`;
  const verTabela = (
    <button type="button" onClick={() => setTabela(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-interlig-azul hover:underline">
      <Table2 className="h-4 w-4" aria-hidden /> Ver a tabela completa da equipe
    </button>
  );

  const telas: React.ReactNode[] = [
    <div key="abertura" className="flex min-h-full flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-interlig-marinho via-interlig-azul to-interlig-ceu px-6 py-12 text-center text-white">
      <Image src="/marca/logo-fundo-escuro.png" alt="Interlig" width={260} height={80} className="h-auto w-48 sm:w-64" priority />
      <p className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Reunião semanal da equipe comercial</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-6xl">{r.escopoRotulo}</h1>
      <p className="mt-3 text-xl text-white/90">Conduzida por {r.responsavel ?? "—"}</p>
      <p className="mt-1 text-lg tabular-nums text-white/80">
        {dataBr(r.data)} · período {r.periodo}
      </p>
      <div className="mt-8 max-w-3xl rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">Participantes</p>
        <p className="mt-1 text-lg">{r.participantes.length ? r.participantes.map((x) => x.nome).join(" · ") : "não registrados"}</p>
      </div>
      <p className="mt-6 text-sm text-white/70">{r.aberta ? "Reunião aberta" : "Reunião encerrada"} · {status}</p>
    </div>,

    <div key="equipe">
      <Titulo sub={`Período ${r.periodo}, comparado à semana anterior.`}>A equipe na semana</Titulo>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cartao("vendas_semana") && <CartaoGrande c={cartao("vendas_semana")!} />}
        {cartao("conversao_safra") && <CartaoGrande c={cartao("conversao_safra")!} />}
        {cartao("ticket") && <CartaoGrande c={cartao("ticket")!} />}
        <Numero rotulo="Leads recebidos / atendidos" valor={`${n0(dados.conversao.recebidos)} / ${n0(dados.conversao.atendidos)}`} detalhe={`${n0(dados.conversao.emNegociacao)} em negociação hoje`} />
        <Numero rotulo="Vendas ativadas" valor={n0(dados.ativacoes.semana)} detalhe={`${n0(soma((l) => op(l)?.semAssinar ?? 0))} sem assinar · ${n0(soma((l) => op(l)?.aguardandoInstalacao ?? 0))} aguardando instalação`} />
        <Numero rotulo="Follow-ups vencidos" valor={n0(dados.perdas.retornosVencidos)} detalhe={`${n0(dados.perdas.retornosHoje)} para hoje · ${n0(dados.perdas.retornosFeitosSemana)} feitos na semana`} />
      </div>
    </div>,

    <div key="vendas">
      <Titulo sub="Vendas da semana; ao lado, o mês contra a meta individual.">Vendas por agente</Titulo>
      <Caixa>
        <Barras itens={porVendas.map((l) => ({ nome: l.nome, valor: l.vendas, extra: l.metaMes ? `· mês ${n0(l.vendasMes)}/${n0(l.metaMes)}` : `· mês ${n0(l.vendasMes)}` }))} vazio="Nenhum agente no recorte." />
        {verTabela}
      </Caixa>
    </div>,

    <div key="conversao">
      <Titulo sub="Leads que chegaram na semana e foram atendidos: quantos viraram venda.">Leads e conversão</Titulo>
      <div className="grid gap-4 lg:grid-cols-2">
        <Caixa titulo="Conversão por safra">
          <Barras itens={porConversao.map((l) => ({ nome: l.nome, valor: Math.round((l.safraTaxa ?? 0) * 100), extra: `(${l.safraConvertidos} de ${l.safraAtendidos})` }))} formato={(v) => `${v}%`} vazio="Nenhum lead atendido no período." />
        </Caixa>
        <Caixa titulo="Leads recebidos e atendidos">
          <Barras itens={[...agentes].sort((a, b) => b.recebidos - a.recebidos).map((l) => ({ nome: l.nome, valor: l.recebidos, extra: `· ${l.atendidos} atendidos` }))} />
        </Caixa>
      </div>
    </div>,

    <div key="pendencias">
      <Titulo sub="O que está parado com cada agente hoje.">Pendências e follow-ups</Titulo>
      <div className="grid gap-4 lg:grid-cols-3">
        <Caixa titulo="Follow-ups vencidos">
          <Barras itens={agentes.map((l) => ({ nome: l.nome, valor: op(l)?.retornosVencidos ?? 0, extra: `· ${op(l)?.retornosPendentes ?? 0} a fazer` })).sort((a, b) => b.valor - a.valor)} />
        </Caixa>
        <Caixa titulo="Vendas sem assinatura">
          <Barras itens={agentes.map((l) => ({ nome: l.nome, valor: op(l)?.semAssinar ?? 0, extra: op(l)?.semAssinar48h ? `· ${op(l)!.semAssinar48h} há 48h+` : undefined })).sort((a, b) => b.valor - a.valor)} />
        </Caixa>
        <Caixa titulo="Aguardando instalação">
          <Barras itens={agentes.map((l) => ({ nome: l.nome, valor: op(l)?.aguardandoInstalacao ?? 0, extra: op(l)?.paradasMais7Dias ? `· ${op(l)!.paradasMais7Dias} paradas 7d+` : undefined })).sort((a, b) => b.valor - a.valor)} />
        </Caixa>
      </div>
    </div>,

    <div key="perdas">
      <Titulo sub="Negociações fechadas sem venda na semana.">Motivos de perda</Titulo>
      <div className="grid gap-4 lg:grid-cols-2">
        <Caixa titulo="Da equipe">
          <Barras itens={dados.perdas.motivos.slice(0, 8).map((m) => ({ nome: m.motivo, valor: m.quantidade }))} vazio="Nenhuma perda registrada." />
        </Caixa>
        <Caixa titulo="Principal motivo de cada agente">
          <ul className="space-y-2 text-base">
            {agentes.filter((l) => l.perdidos > 0).length === 0 && <li className="text-slate-500">Nenhuma perda registrada.</li>}
            {agentes
              .filter((l) => l.perdidos > 0)
              .sort((a, b) => b.perdidos - a.perdidos)
              .map((l) => (
                <li key={l.id} className="flex justify-between gap-3 border-b pb-2 last:border-0">
                  <span className="font-medium">{l.nome}</span>
                  <span className="text-right text-slate-600">
                    {l.perdidos} perdidos · {op(l)?.motivos[0] ? `${op(l)!.motivos[0].motivo} (${op(l)!.motivos[0].quantidade})` : "sem motivo"}
                  </span>
                </li>
              ))}
          </ul>
        </Caixa>
      </div>
    </div>,

    <div key="evolucao">
      <Titulo sub="Semana anterior → esta semana.">Evolução individual</Titulo>
      <Caixa>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-base">
            <thead>
              <tr className="border-b text-left text-sm text-slate-500">
                <th className="py-2 font-medium">Agente</th>
                <th className="text-right font-medium">Vendas</th>
                <th className="text-right font-medium">Leads atendidos</th>
                <th className="text-right font-medium">Conversão</th>
                <th className="text-right font-medium">Ticket médio</th>
                <th className="text-right font-medium">Perdidos</th>
              </tr>
            </thead>
            <tbody>
              {porVendas.map((l) => {
                const a = op(l)?.anterior;
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2.5 font-medium">{l.nome}</td>
                    <td className="text-right"><Variacao antes={a?.vendas ?? null} agora={l.vendas} formato={(v) => (v == null ? "—" : n0(v))} /></td>
                    <td className="text-right"><Variacao antes={a?.atendidos ?? null} agora={l.safraAtendidos} formato={(v) => (v == null ? "—" : n0(v))} /></td>
                    <td className="text-right"><Variacao antes={a?.conversaoSafra ?? null} agora={l.safraTaxa} formato={pct} /></td>
                    <td className="text-right"><Variacao antes={a?.ticket ?? null} agora={l.ticket} formato={(v) => reais(v)} /></td>
                    <td className="text-right"><span className="text-slate-500">{a ? n0(a.perdidos) : "—"}</span> → <b>{n0(l.perdidos)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {dados.trechos.emAndamento && <p className="mt-2 text-sm text-slate-500">Semana em andamento: a comparação é com o mesmo trecho da semana anterior.</p>}
      </Caixa>
    </div>,

    <div key="compromissos">
      <Titulo sub="Conferir o combinado e assumir os compromissos da próxima semana.">Compromissos</Titulo>
      <div className="grid gap-4 xl:grid-cols-2">
        <Caixa titulo="Da reunião anterior">
          <ListaCompromissos lista={p.anteriores} reuniaoId={r.id} pode={p.pode && r.aberta} vazio="Não há compromissos da reunião anterior." />
        </Caixa>
        <Caixa titulo="Desta reunião">
          <ListaCompromissos lista={p.compromissos} reuniaoId={r.id} pode={p.pode} vazio="Nenhum compromisso ainda." />
          {p.pode && r.aberta && (
            <div className="mt-3">
              <FormCompromisso id={r.id} agentes={r.participantes.filter((x) => x.papel === "agente").map((x) => ({ id: x.id, nome: x.nome }))} />
            </div>
          )}
        </Caixa>
      </div>
    </div>,

    <div key="qualidade">
      <Titulo sub="Bloco complementar, quando houver dados e safras elegíveis.">Qualidade da venda</Titulo>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pendente etapa={5}>Inadimplência inicial por agente, com as faturas não vencidas, vencidas e os clientes suspensos separados. A regra ainda depende de decisão.</Pendente>
        <Pendente etapa={5}>Churn precoce em 90 dias por safra de ativação.</Pendente>
      </div>
    </div>,

    <div key="encerramento">
      <Titulo sub="O que fica registrado desta reunião.">Encerramento</Titulo>
      <div className="grid gap-4 xl:grid-cols-2">
        <Caixa titulo="Observações e boas práticas">
          <p className="whitespace-pre-line text-base">{r.observacoes || <span className="text-slate-500">Sem observações registradas.</span>}</p>
          {r.boasPraticas && <p className="mt-3 whitespace-pre-line text-base"><b>Boas práticas:</b> {r.boasPraticas}</p>}
          <p className="mt-3 text-sm text-slate-500">Participantes, observações e boas práticas são editados na página da reunião.</p>
        </Caixa>
        <Caixa titulo="Fechamento">
          <p className="mb-3 text-base">
            {p.compromissos.length} compromissos nesta reunião · {p.anteriores.filter((c) => c.situacao === "concluido").length} de {p.anteriores.length} da anterior concluídos.
          </p>
          {!r.aberta ? (
            <p className="text-base">Reunião encerrada em {r.encerradaEm ? dataHora(r.encerradaEm) : "—"}. Indicadores, participantes e compromissos estão guardados.</p>
          ) : p.pode ? (
            <FormEncerrar id={r.id} />
          ) : (
            <p className="text-base text-slate-600">Quem encerra é a coordenação desta equipe, a administração ou a direção.</p>
          )}
        </Caixa>
      </div>
    </div>,
  ];

  return (
    <Moldura
      titulo={`Reunião da equipe · ${r.escopoRotulo}`}
      subtitulo={`${dataBr(r.data)} · período ${r.periodo} · ${status}`}
      secoes={SECOES}
      telas={telas}
      hrefVoltar={p.hrefVoltar}
      atual={atual}
      ir={ir}
      sobreposicao={
        tabela ? (
          <Sobreposicao titulo={`Equipe por agente · período ${r.periodo}`} aoFechar={() => setTabela(false)}>
            <TabelaEquipe linhas={porVendas} grande />
          </Sobreposicao>
        ) : null
      }
      aoFecharSobreposicao={() => setTabela(false)}
    />
  );
}
