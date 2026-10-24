/**
 * Funil e conversão (24/10/2026) — puro sobre BaseDados, testado em
 * funil.test.ts. Duas coortes, nunca misturadas:
 *  - ENTRADA: leads criados no período, acompanhados até hoje;
 *  - FECHAMENTO: leads fechados no período (convertido pela data da venda).
 * As barras mostram quem chegou PELO MENOS até a etapa (funil monotônico).
 * As conversões entre etapas usam o dado real de cada etapa (ex.: proposta →
 * venda só conta leads com proposta registrada).
 */
import type { BaseDados, TicketBase } from "./base";
import { diaDe, diaReferenciaFechamento, indexar } from "./calcular";
import { mediana, razao } from "../regras/normalizacao";

export type ModoFunil = "entrada" | "fechamento";

export const ETAPAS_FUNIL = [
  { chave: "recebido", rotulo: "Lead recebido", detalhe: "Leads do CRM (fora os criados a partir de vendas lançadas direto no SGP)" },
  { chave: "atribuido", rotulo: "Lead atribuído", detalhe: "Teve vendedor responsável em algum momento" },
  { chave: "atendido", rotulo: "1º atendimento humano", detalhe: "Recebeu ação humana: mensagem do vendedor no chat, tratativa, proposta, visita…" },
  { chave: "qualificado", rotulo: "Qualificado", detalhe: "Proposta registrada, etapa Criação do contrato, venda, ou IA classificou como quente/morno" },
  { chave: "proposta", rotulo: "Proposta enviada", detalhe: "Proposta registrada no CRM (ou etapa posterior)" },
  { chave: "negociacao", rotulo: "Criação do contrato", detalhe: "Chegou à etapa Criação do contrato (ou venda)" },
  { chave: "venda", rotulo: "Venda fechada", detalhe: "Ticket fechado como convertido" },
  { chave: "agendada", rotulo: "Instalação agendada", detalhe: "Contrato com OS de instalação agendada no SGP (ou já ativado)" },
  { chave: "ativado", rotulo: "Cliente ativado", detalhe: "Contrato ativado no SGP" },
] as const;

const ehLead = (t: TicketBase) => t.origem_criacao !== "sgp_auto";
const ROTULO_ETAPA: Record<string, string> = {
  pre_cadastro: "Pré-cadastro",
  novo: "Sem contato",
  em_atendimento: "Contato inicial",
  aguardando: "Criação do contrato",
  proposta: "Proposta",
};
export const ROTULO_ORIGEM_LEAD: Record<string, string> = {
  sz_auto: "WhatsApp (chatbot)",
  site: "Site",
  manual: "Cadastro manual",
  indicacao: "Indicação",
  sgp_auto: "Venda direta no SGP",
};

export function calcularFunil(base: BaseDados, idx: ReturnType<typeof indexar>, de: string, ate: string, noEscopo: (t: TicketBase) => boolean, modo: ModoFunil) {
  const contratoPorId = new Map(base.contratos.map((c) => [c.id, c]));
  const comProposta = new Set(base.propostas.map((p) => p.ticket_id));
  const coorte = base.tickets.filter((t) => {
    if (!ehLead(t) || !noEscopo(t)) return false;
    const d = modo === "entrada" ? diaDe(Date.parse(t.criado_em)) : diaReferenciaFechamento(t);
    return Boolean(d && d >= de && d <= ate);
  });

  const nivel = (t: TicketBase): number => {
    const contrato = t.contrato_id ? contratoPorId.get(t.contrato_id) : undefined;
    const ativado = Boolean(contrato?.data_ativacao);
    const agendada = ativado || (t.contrato_id ? base.osAgendadas.has(t.contrato_id) : false);
    const venda = t.desfecho === "convertido";
    const negociacao = venda || t.etapa === "aguardando" || t.etapa_encerramento === "aguardando";
    const proposta = negociacao || comProposta.has(t.id);
    const analise = idx.analisePorTicket.get(t.id);
    const qualificado = proposta || Boolean(analise && (analise.temperatura === "quente" || analise.temperatura === "morno" || analise.intencao_compra));
    const atendido = qualificado || (idx.acoesPorTicket.get(t.id) ?? []).length > 0 || idx.ultimaAcao(t.id) !== null;
    const atribuido = atendido || idx.linhaDe(t).length > 0 || t.vendedor_id !== null;
    const passos = [true, atribuido, atendido, qualificado, proposta, negociacao, venda, agendada, ativado];
    let n = 0;
    passos.forEach((ok, i) => {
      if (ok) n = i;
    });
    return n;
  };
  const niveis = coorte.map((t) => ({ t, n: nivel(t) }));
  const etapas = ETAPAS_FUNIL.map((e, i) => ({ chave: e.chave, rotulo: e.rotulo, detalhe: e.detalhe, valor: niveis.filter((x) => x.n >= i).length }));

  // conversões com o dado real de cada etapa
  const conta = (f: (x: { t: TicketBase; n: number }) => boolean) => niveis.filter(f).length;
  const vendas = conta((x) => x.n >= 6);
  const comPropostaReal = niveis.filter((x) => comProposta.has(x.t.id));
  const conversoes = {
    leadVenda: razao(vendas, niveis.length),
    qualificadoVenda: razao(vendas, conta((x) => x.n >= 3)),
    propostaVenda: razao(comPropostaReal.filter((x) => x.n >= 6).length, comPropostaReal.length),
    vendaInstalacao: razao(conta((x) => x.n >= 7), vendas),
    instalacaoAtivacao: razao(conta((x) => x.n >= 8), conta((x) => x.n >= 7)),
  };

  // perdas: em que etapa e por qual motivo os não convertidos pararam
  const perdidos = coorte.filter((t) => t.etapa === "fechado" && t.desfecho === "nao_convertido");
  const porEtapa = new Map<string, number>();
  const porMotivo = new Map<string, number>();
  for (const t of perdidos) {
    const etapa = ROTULO_ETAPA[t.etapa_encerramento ?? ""] ?? "Não informada";
    porEtapa.set(etapa, (porEtapa.get(etapa) ?? 0) + 1);
    const motivo = t.motivo_id ? (base.motivos.get(t.motivo_id) ?? "Outro") : "Sem motivo";
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
  }

  // tempos entre etapas (medianas)
  const horas = (a: number, b: number) => (b - a) / 3_600_000;
  const t1: number[] = [];
  const tProp: number[] = [];
  const tFech: number[] = [];
  const tAtiv: number[] = [];
  for (const { t } of niveis) {
    const criado = Date.parse(t.criado_em);
    const primeira = (idx.acoesPorTicket.get(t.id) ?? []).map((a) => a.em).filter((m) => m >= criado).sort((a, b) => a - b)[0];
    if (primeira) t1.push(horas(criado, primeira));
    const prop = base.propostas.filter((p) => p.ticket_id === t.id).map((p) => p.em).sort((a, b) => a - b)[0];
    if (prop && prop >= criado) tProp.push(horas(criado, prop) / 24);
    if (t.desfecho === "convertido" && t.fechado_em) tFech.push(horas(criado, Date.parse(t.fechado_em)) / 24);
    const c = t.contrato_id ? contratoPorId.get(t.contrato_id) : undefined;
    if (c?.data_ativacao) tAtiv.push(horas(Date.parse(`${c.data_venda}T12:00:00-03:00`), Date.parse(`${c.data_ativacao.slice(0, 10)}T12:00:00-03:00`)) / 24);
  }
  const tempos = [
    { chave: "primeiro_atendimento", rotulo: "Criação → 1º atendimento humano", valor: mediana(t1), unidade: "horas" as const, amostra: t1.length },
    { chave: "proposta", rotulo: "Criação → proposta", valor: mediana(tProp), unidade: "dias" as const, amostra: tProp.length },
    { chave: "fechamento", rotulo: "Criação → venda fechada", valor: mediana(tFech), unidade: "dias" as const, amostra: tFech.length },
    { chave: "ativacao", rotulo: "Venda → ativação", valor: mediana(tAtiv), unidade: "dias" as const, amostra: tAtiv.length },
  ];

  // origem dos leads
  const porOrigem = new Map<string, { leads: number; vendas: number; receita: number }>();
  for (const { t, n } of niveis) {
    const o = ROTULO_ORIGEM_LEAD[t.origem_criacao] ?? t.origem_criacao;
    const g = porOrigem.get(o) ?? { leads: 0, vendas: 0, receita: 0 };
    g.leads++;
    if (n >= 6) {
      g.vendas++;
      const c = t.contrato_id ? contratoPorId.get(t.contrato_id) : undefined;
      if (c) g.receita += c.valor_mensalidade;
    }
    porOrigem.set(o, g);
  }

  const reabertos = coorte.filter((t) => t.reaberto_de_id || (idx.acoesPorTicket.get(t.id) ?? []).some((a) => a.fonte === "reabertura"));
  return {
    modo,
    total: coorte.length,
    etapas,
    conversoes,
    perdas: {
      total: perdidos.length,
      porEtapa: [...porEtapa.entries()].map(([etapa, quantidade]) => ({ etapa, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
      porMotivo: [...porMotivo.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    },
    tempos,
    recuperacao: { reabertos: reabertos.length, recuperados: reabertos.filter((t) => t.desfecho === "convertido").length },
    porOrigem: [...porOrigem.entries()]
      .map(([origem, g]) => ({ origem, ...g, receita: Math.round(g.receita * 100) / 100, conversao: razao(g.vendas, g.leads), ticketMedio: g.vendas ? Math.round((g.receita / g.vendas) * 100) / 100 : null }))
      .sort((a, b) => b.leads - a.leads),
  };
}

export type ResultadoFunil = ReturnType<typeof calcularFunil>;
