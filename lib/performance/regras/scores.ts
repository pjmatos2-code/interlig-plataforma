/**
 * Scores da Performance Comercial (24/10/2026) — Esforço, Resultado,
 * Qualidade e IPC (Índice de Performance Comercial). Puro: recebe as
 * contagens já apuradas e devolve indicadores com fórmula, nota 0–100 e a
 * composição de cada score. Testado em scores.test.ts.
 *
 * Princípios (spec do módulo, seções 5–7):
 *  - automação nunca conta como esforço (as contagens já chegam só humanas);
 *  - sem leads/volume suficiente o item fica "Não disponível", nunca zero;
 *  - pesos indisponíveis são redistribuídos entre os aplicáveis;
 *  - mensagens enviadas são só contexto (não pontuam: não premiar volume);
 *  - qualidade só com coorte madura; sem ela o IPC sai provisório.
 */
import type { ConfigPerformance } from "../config";
import type { Indicador, MotivoIndisponivel, Score } from "../tipos";
import { combinar, media, mediana, notaInversa, notaLinear, percentil, razao } from "./normalizacao";

type Pesos = ConfigPerformance["pesos"];

const nd = (motivo: MotivoIndisponivel) => ({ nota: null, disponivel: false, motivo });

// ---------------------------------------------------------------------------
// Esforço
// ---------------------------------------------------------------------------
export type EntradasEsforco = {
  /** o vendedor atende pelo chatbot (tem agente vinculado com conversas) */
  temCanalChat: boolean;
  /** os leads dele nascem no chat, mas nenhum agente do chat está vinculado a ele */
  chatSemVinculo?: boolean;
  leadsRecebidos: number;
  /** dos recebidos no período, quantos já tiveram ação humana */
  leadsRecebidosAtendidos: number;
  /** leads distintos com ação humana válida no período */
  leadsTrabalhados: number;
  /** conversas receptivas em que o vendedor participou */
  conversasAtendidas: number;
  /** dessas, com resposta humana do vendedor a mensagem do cliente */
  conversasTrabalhadas: number;
  /** conversas em que ELE deu a 1ª resposta: tempos em segundos */
  primeiraResposta: { util: number[]; bruto: number[] };
  gaps: { util: number[]; bruto: number[] };
  followups: { previstos: number; devidos: number; noPrazo: number; realizados: number; vencidos: number };
  leadsAbertos: number;
  leadsSemRetorno: number;
  propostas: number;
  /** a função registra propostas no CRM (senão o item não se aplica) */
  funcaoRegistraPropostas: boolean;
  recuperacao: { recuperados: number; elegiveis: number };
  disciplina: { checagens: number; ok: number };
  mensagens: { enviadas: number; recebidas: number };
};

export function calcularEsforco(e: EntradasEsforco, cfg: ConfigPerformance, pesos: Pesos["esforco"]) {
  const v = cfg.volume_minimo;
  const f = cfg.faixas;
  const limiteSla = cfg.sla.primeira_resposta_min * 60;
  const ind: Record<string, Indicador> = {};

  ind.leads_recebidos = {
    chave: "leads_recebidos", rotulo: "Leads recebidos", unidade: "qtd", valor: e.leadsRecebidos, nota: null, disponivel: true,
    formula: "Leads (tickets do CRM, fora os criados a partir de vendas do SGP) atribuídos ao vendedor no período — na criação ou por reatribuição.",
  };
  ind.leads_trabalhados = {
    chave: "leads_trabalhados", rotulo: "Leads trabalhados", unidade: "qtd", valor: e.leadsTrabalhados, nota: null, disponivel: true,
    formula: "Leads distintos com ação humana válida do vendedor no período (mensagem dele no chat, tratativa, proposta, visita, mudança de etapa ou fechamento). Automação não conta.",
  };

  const taxaAtend = razao(e.leadsRecebidosAtendidos, e.leadsRecebidos);
  ind.leads_atendidos = {
    chave: "leads_atendidos", rotulo: "Leads atendidos", unidade: "pct", valor: taxaAtend,
    numerador: e.leadsRecebidosAtendidos, denominador: e.leadsRecebidos,
    formula: "Leads recebidos no período que já tiveram ação humana ÷ leads recebidos.",
    ...(e.chatSemVinculo
      ? nd("sem_integracao")
      : e.leadsRecebidos < v.leads
        ? nd("volume_insuficiente")
        : { nota: notaLinear(taxaAtend ?? 0, f.leads_atendidos), disponivel: true }),
    detalhe: e.chatSemVinculo ? "Os leads deste vendedor nascem no chat, mas nenhum agente do chat está vinculado a ele (Administração → vínculo de atendentes). Sem isso o atendimento dele no chat não aparece." : undefined,
  };

  const pr = e.primeiraResposta.util;
  const dentro = pr.filter((s) => s <= limiteSla).length;
  const taxaSla = razao(dentro, pr.length);
  ind.sla_primeira_resposta = {
    chave: "sla_primeira_resposta", rotulo: `1ª resposta em até ${cfg.sla.primeira_resposta_min} min`, unidade: "pct", valor: taxaSla,
    numerador: dentro, denominador: pr.length,
    formula: `Conversas em que o vendedor deu a 1ª resposta humana em até ${cfg.sla.primeira_resposta_min} minutos de expediente (contados da entrada na fila de atendimento) ÷ conversas em que ele deu a 1ª resposta.`,
    ...(!e.temCanalChat ? nd("nao_aplicavel") : pr.length < v.conversas ? nd("volume_insuficiente") : { nota: notaLinear(taxaSla ?? 0, f.sla_primeira_resposta), disponivel: true }),
  };
  const medUtil = mediana(pr);
  ind.tempo_primeira_resposta = {
    chave: "tempo_primeira_resposta", rotulo: "Tempo de 1ª resposta (mediana)", unidade: "seg", valor: medUtil, nota: null,
    disponivel: e.temCanalChat && pr.length > 0, motivo: !e.temCanalChat ? "nao_aplicavel" : pr.length ? undefined : "sem_dados",
    denominador: pr.length,
    formula: "Mediana do tempo entre a entrada do cliente na fila de atendimento humano e a 1ª mensagem humana, só no expediente.",
    detalhe: pr.length
      ? `média ${Math.round(media(pr)!)} s · p90 ${Math.round(percentil(pr, 90)!)} s · bruto (24h) mediana ${Math.round(mediana(e.primeiraResposta.bruto) ?? 0)} s`
      : undefined,
  };
  const gu = e.gaps.util;
  ind.tempo_entre_interacoes = {
    chave: "tempo_entre_interacoes", rotulo: "Tempo entre interações (mediana)", unidade: "seg", valor: mediana(gu), nota: null,
    disponivel: e.temCanalChat && gu.length > 0, motivo: !e.temCanalChat ? "nao_aplicavel" : gu.length ? undefined : "sem_dados",
    denominador: gu.length,
    formula: "Mediana do tempo entre a manifestação do cliente e a próxima mensagem humana do vendedor (depois da 1ª resposta), só no expediente.",
    detalhe: gu.length ? `bruto (24h) mediana ${Math.round(mediana(e.gaps.bruto) ?? 0)} s · ${gu.length} respostas` : undefined,
  };

  const taxaConv = razao(e.conversasTrabalhadas, e.conversasAtendidas);
  ind.conversas_trabalhadas = {
    chave: "conversas_trabalhadas", rotulo: "Conversas efetivamente trabalhadas", unidade: "pct", valor: taxaConv,
    numerador: e.conversasTrabalhadas, denominador: e.conversasAtendidas,
    formula: "Conversas receptivas em que o vendedor respondeu ao cliente ÷ conversas receptivas em que ele participou.",
    ...(!e.temCanalChat ? nd("nao_aplicavel") : e.conversasAtendidas < v.conversas ? nd("volume_insuficiente") : { nota: notaLinear(taxaConv ?? 0, f.conversas_trabalhadas), disponivel: true }),
  };

  ind.followups_previstos = {
    chave: "followups_previstos", rotulo: "Follow-ups previstos", unidade: "qtd", valor: e.followups.previstos, nota: null, disponivel: true,
    formula: "Retornos programados com prazo no período (agendados por gente ou sugestões da IA aceitas).",
  };
  ind.followups_realizados = {
    chave: "followups_realizados", rotulo: "Follow-ups realizados", unidade: "qtd", valor: e.followups.realizados, nota: null, disponivel: true,
    formula: "Retornos concluídos no período — detectados por ação humana no lead depois do agendamento, ou marcados como feitos.",
  };
  const taxaFu = razao(e.followups.noPrazo, e.followups.devidos);
  ind.followups_prazo = {
    chave: "followups_prazo", rotulo: "Follow-ups no prazo", unidade: "pct", valor: taxaFu,
    numerador: e.followups.noPrazo, denominador: e.followups.devidos,
    formula: "Retornos concluídos no prazo ÷ retornos com vencimento no período (os cancelados porque o lead fechou antes ficam fora; os vencidos contam contra).",
    ...(e.followups.devidos < v.followups ? nd(e.followups.devidos === 0 ? "sem_dados" : "volume_insuficiente") : { nota: notaLinear(taxaFu ?? 0, f.followups_prazo), disponivel: true }),
  };

  const fracAtraso = razao(e.leadsSemRetorno, e.leadsAbertos);
  ind.leads_sem_retorno = {
    chave: "leads_sem_retorno", rotulo: "Leads sem retorno", unidade: "qtd", valor: e.leadsSemRetorno, nota: null, disponivel: true,
    denominador: e.leadsAbertos,
    formula: `Leads abertos do vendedor sem ação humana há mais de ${cfg.sla.sem_retorno_horas} h de expediente e sem retorno agendado.`,
  };
  ind.sem_atraso = {
    chave: "sem_atraso", rotulo: "Ausência de leads atrasados", unidade: "nota", valor: fracAtraso,
    numerador: e.leadsSemRetorno, denominador: e.leadsAbertos,
    formula: `100 quando nenhum lead aberto está sem retorno; cai linearmente até 0 quando ${Math.round(f.sem_atraso_limite * 100)}% ou mais dos leads abertos estão sem retorno.`,
    ...(e.leadsAbertos < v.abertos
      ? nd(e.leadsAbertos === 0 ? "sem_dados" : "volume_insuficiente")
      : { nota: Math.round(Math.max(0, 1 - Math.min(1, (fracAtraso ?? 0) / f.sem_atraso_limite)) * 1000) / 10, disponivel: true }),
  };

  const taxaProp = razao(e.propostas, e.leadsTrabalhados);
  ind.propostas = {
    chave: "propostas", rotulo: "Propostas enviadas", unidade: "qtd", valor: e.propostas,
    numerador: e.propostas, denominador: e.leadsTrabalhados,
    formula: "Propostas registradas no CRM pelo vendedor no período (só registro estruturado — preço citado no chat não conta). Nota: propostas ÷ leads trabalhados contra o alvo configurado.",
    ...(!e.funcaoRegistraPropostas
      ? nd("nao_aplicavel")
      : e.leadsTrabalhados < v.leads
        ? nd("volume_insuficiente")
        : { nota: notaLinear(taxaProp ?? 0, f.propostas), disponivel: true }),
  };

  const taxaRec = razao(e.recuperacao.recuperados, e.recuperacao.elegiveis);
  ind.recuperacao = {
    chave: "recuperacao", rotulo: "Leads recuperados", unidade: "pct", valor: taxaRec,
    numerador: e.recuperacao.recuperados, denominador: e.recuperacao.elegiveis,
    formula: "Leads antes perdidos/encerrados (reabertos, ou o mesmo telefone voltando em até 60 dias) que viraram venda no período ÷ leads perdidos elegíveis à recuperação.",
    ...(e.recuperacao.elegiveis < v.recuperacao ? nd(e.recuperacao.elegiveis === 0 ? "sem_dados" : "volume_insuficiente") : { nota: notaLinear(taxaRec ?? 0, f.recuperacao), disponivel: true }),
  };

  const taxaDisc = razao(e.disciplina.ok, e.disciplina.checagens);
  ind.disciplina_crm = {
    chave: "disciplina_crm", rotulo: "Disciplina do CRM", unidade: "pct", valor: taxaDisc,
    numerador: e.disciplina.ok, denominador: e.disciplina.checagens,
    formula: "Checagens atendidas ÷ checagens nos leads abertos: telefone válido, etapa coerente com o atendimento (não ficou em \"Sem contato\" depois de atendido) e próximo passo definido (retorno agendado) em negociação.",
    ...(e.disciplina.checagens === 0 ? nd("sem_dados") : { nota: notaLinear(taxaDisc ?? 0, f.disciplina_crm), disponivel: true }),
  };

  ind.mensagens_enviadas = {
    chave: "mensagens_enviadas", rotulo: "Mensagens enviadas", unidade: "qtd", valor: e.mensagens.enviadas, nota: null,
    disponivel: e.temCanalChat, motivo: e.temCanalChat ? undefined : "nao_aplicavel",
    formula: "Mensagens humanas do vendedor no chat no período. Só contexto: não pontua (não premia volume).",
  };
  ind.mensagens_recebidas = {
    chave: "mensagens_recebidas", rotulo: "Mensagens recebidas", unidade: "qtd", valor: e.mensagens.recebidas, nota: null,
    disponivel: e.temCanalChat, motivo: e.temCanalChat ? undefined : "nao_aplicavel",
    formula: "Mensagens dos clientes nas conversas em que o vendedor foi o atendente principal, no período.",
  };
  ind.ligacoes = {
    chave: "ligacoes", rotulo: "Ligações", unidade: "qtd", valor: null, nota: null, disponivel: false, motivo: "sem_integracao",
    formula: "Exige integração com a telefonia (não há hoje).",
  };

  const itensScore: [keyof Pesos["esforco"], string][] = [
    ["leads_atendidos", "leads_atendidos"],
    ["sla_primeira_resposta", "sla_primeira_resposta"],
    ["followups_prazo", "followups_prazo"],
    ["sem_atraso", "sem_atraso"],
    ["conversas_trabalhadas", "conversas_trabalhadas"],
    ["propostas", "propostas"],
    ["recuperacao", "recuperacao"],
    ["disciplina_crm", "disciplina_crm"],
  ];
  const score = combinar(
    itensScore.map(([peso, k]) => ({ chave: k, rotulo: ind[k].rotulo, peso: pesos[peso], nota: ind[k].nota, motivo: ind[k].motivo }))
  );
  return { score, indicadores: ind };
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
export type EntradasResultado = {
  /** vendas do período (PRD 5.1, pelo vendedor do contrato no SGP) */
  vendas: number;
  /** meta de vendas proporcional aos dias úteis disponíveis no período */
  metaPeriodo: number | null;
  /** tickets fechados no período (PRD 5.14: inatividade conta como não convertido) */
  fechados: number;
  convertidos: number;
  receitaNova: number;
  metaReceita: number | null;
  ativacoes: number;
};

export function calcularResultado(e: EntradasResultado, cfg: ConfigPerformance, pesos: Pesos["resultado"]) {
  const ind: Record<string, Indicador> = {};
  const pctMeta = e.metaPeriodo ? e.vendas / e.metaPeriodo : null;
  ind.meta_vendas = {
    chave: "meta_vendas", rotulo: "Cumprimento da meta de vendas", unidade: "pct", valor: pctMeta,
    numerador: e.vendas, denominador: e.metaPeriodo,
    formula: "Vendas do período (PRD 5.1) ÷ meta proporcional: meta mensal × dias úteis disponíveis no período ÷ dias úteis do mês (descontando afastamentos). Nota = % da meta, limitada a 100.",
    ...(e.metaPeriodo ? { nota: Math.round(Math.min(1, pctMeta!) * 1000) / 10, disponivel: true } : nd("sem_meta")),
  };
  const conv = razao(e.convertidos, e.fechados);
  ind.conversao = {
    chave: "conversao", rotulo: "Conversão real", unidade: "pct", valor: conv,
    numerador: e.convertidos, denominador: e.fechados,
    formula: "Tickets fechados como convertidos ÷ tickets fechados no período (PRD 5.14; fechados por inatividade contam como não convertidos).",
    ...(e.fechados < cfg.volume_minimo.fechados ? nd(e.fechados === 0 ? "sem_dados" : "volume_insuficiente") : { nota: notaLinear(conv ?? 0, cfg.faixas.conversao), disponivel: true }),
  };
  const pctRec = e.metaReceita ? e.receitaNova / e.metaReceita : null;
  ind.receita_nova = {
    chave: "receita_nova", rotulo: "Receita mensal nova", unidade: "brl", valor: e.receitaNova,
    numerador: e.receitaNova, denominador: e.metaReceita,
    formula: "Soma das mensalidades dos contratos vendidos no período (PRD 5.2). Pontua só se houver meta de receita.",
    ...(e.metaReceita ? { nota: Math.round(Math.min(1, pctRec!) * 1000) / 10, disponivel: true } : nd("sem_meta")),
  };
  ind.vendas = {
    chave: "vendas", rotulo: "Vendas", unidade: "qtd", valor: e.vendas, nota: null, disponivel: true,
    formula: "Contratos com data de venda no período (PRD 5.1).",
  };
  ind.ativacoes = {
    chave: "ativacoes", rotulo: "Ativações", unidade: "qtd", valor: e.ativacoes, nota: null, disponivel: true,
    formula: "Contratos do vendedor ativados no período (data de ativação no SGP).",
  };
  const score = combinar([
    { chave: "meta_vendas", rotulo: ind.meta_vendas.rotulo, peso: pesos.meta_vendas, nota: ind.meta_vendas.nota, motivo: ind.meta_vendas.motivo },
    { chave: "conversao", rotulo: ind.conversao.rotulo, peso: pesos.conversao, nota: ind.conversao.nota, motivo: ind.conversao.motivo },
    { chave: "receita_nova", rotulo: ind.receita_nova.rotulo, peso: pesos.receita_nova, nota: ind.receita_nova.nota, motivo: ind.receita_nova.motivo },
  ]);
  return { score, indicadores: ind };
}

// ---------------------------------------------------------------------------
// Qualidade
// ---------------------------------------------------------------------------
type Taxa = { casos: number; base: number };
export type EntradasQualidade = {
  /** vendas com a maturidade mínima, canceladas sem chegar a ativar */
  cancelAntesInstalacao: Taxa;
  /** ativadas há 30+ dias, canceladas em até 30 dias da ativação */
  cancel30: Taxa;
  /** ativadas há 90+ dias, canceladas em até 90 dias (PRD 5.10) */
  churn90: Taxa;
  /** 1ª fatura não paga até vencimento + 10 dias (PRD 5.11) */
  inad1: Taxa;
  /** notas 0–100 de qualidade do atendimento dadas pela IA */
  atendimento: number[];
  iaHabilitada: boolean;
};

export function calcularQualidade(e: EntradasQualidade, cfg: ConfigPerformance, pesos: Pesos["qualidade"]) {
  const q = cfg.qualidade;
  const min = cfg.volume_minimo.vendas_maduras;
  const ind: Record<string, Indicador> = {};
  const sub = (chave: string, rotulo: string, t: Taxa, lim: { alvo: number; maximo: number }, formula: string): Indicador => {
    const taxa = razao(t.casos, t.base);
    return {
      chave, rotulo, unidade: "pct", valor: taxa, numerador: t.casos, denominador: t.base, formula,
      ...(t.base < min ? nd("em_maturacao") : { nota: notaInversa(taxa ?? 0, lim), disponivel: true }),
    };
  };
  ind.cancel_antes_instalacao = sub("cancel_antes_instalacao", "Cancelamento antes da instalação", e.cancelAntesInstalacao, q.cancel_antes_instalacao,
    `Vendas com ${q.maturidade_dias}+ dias canceladas sem ativar (fora erro de cadastro/duplicidade) ÷ vendas com ${q.maturidade_dias}+ dias.`);
  ind.cancel_30 = sub("cancel_30", "Cancelamento em até 30 dias", e.cancel30, q.cancel_30,
    "Ativados há 30+ dias que cancelaram em até 30 dias da ativação ÷ ativados há 30+ dias.");
  ind.churn_90 = sub("churn_90", "Churn em até 90 dias", e.churn90, q.churn_90,
    "Cancelados em até 90 dias da ativação ÷ ativados há 90+ dias (PRD 5.10).");
  ind.inad_1a = sub("inad_1a", "Inadimplência da 1ª fatura", e.inad1, q.inad_1a,
    "1ªs faturas não pagas até vencimento + 10 dias ÷ 1ªs faturas vencidas (PRD 5.11).");

  const subs = ["cancel_antes_instalacao", "cancel_30", "churn_90", "inad_1a"].map((k) => ind[k]);
  const disponiveis = subs.filter((s) => s.nota !== null);
  const notaVendas = disponiveis.length ? Math.round((disponiveis.reduce((s, x) => s + (x.nota as number), 0) / disponiveis.length) * 10) / 10 : null;
  ind.qualidade_vendas = {
    chave: "qualidade_vendas", rotulo: "Qualidade das vendas", unidade: "nota", valor: notaVendas, nota: notaVendas,
    disponivel: notaVendas !== null, motivo: notaVendas === null ? "em_maturacao" : undefined,
    formula: "Média das notas dos sinais maduros (cancelamento antes da instalação, em 30 dias, churn 90 dias, inadimplência da 1ª fatura). Cada sinal vale 100 até o alvo e 0 no máximo configurado. É sinal de investigação, não culpa automática do vendedor.",
    detalhe: `${disponiveis.length} de ${subs.length} sinais com volume maduro`,
  };
  const at = e.atendimento;
  const notaAt = at.length >= cfg.volume_minimo.analises_ia ? Math.round((at.reduce((s, x) => s + x, 0) / at.length) * 10) / 10 : null;
  ind.qualidade_atendimento = {
    chave: "qualidade_atendimento", rotulo: "Qualidade do atendimento (IA)", unidade: "nota", valor: at.length ? Math.round((media(at) ?? 0) * 10) / 10 : null,
    nota: notaAt, disponivel: notaAt !== null, denominador: at.length,
    motivo: notaAt !== null ? undefined : !e.iaHabilitada ? "sem_integracao" : "volume_insuficiente",
    formula: "Média das notas de atendimento (0–100) dadas pela IA às conversas analisadas no período, pela rubrica configurada. Apoio à gestão — exige revisão humana antes de qualquer decisão.",
  };
  const score = combinar(
    [
      { chave: "qualidade_vendas", rotulo: ind.qualidade_vendas.rotulo, peso: pesos.qualidade_vendas, nota: ind.qualidade_vendas.nota, motivo: ind.qualidade_vendas.motivo },
      { chave: "qualidade_atendimento", rotulo: ind.qualidade_atendimento.rotulo, peso: pesos.qualidade_atendimento, nota: ind.qualidade_atendimento.nota, motivo: ind.qualidade_atendimento.motivo },
    ],
    { essenciais: ["qualidade_vendas"] }
  );
  return { score, indicadores: ind };
}

// ---------------------------------------------------------------------------
// IPC = 35% Esforço + 40% Resultado + 25% Qualidade (pesos configuráveis)
// ---------------------------------------------------------------------------
export function calcularIpc(esforco: Score, resultado: Score, qualidade: Score, pesos: Pesos["ipc"]): Score {
  const s = combinar(
    [
      { chave: "esforco", rotulo: "Esforço", peso: pesos.esforco, nota: esforco.valor, motivo: esforco.motivo },
      { chave: "resultado", rotulo: "Resultado", peso: pesos.resultado, nota: resultado.valor, motivo: resultado.motivo },
      { chave: "qualidade", rotulo: "Qualidade", peso: pesos.qualidade, nota: qualidade.valor, motivo: qualidade.motivo ?? "em_maturacao" },
    ],
    { essenciais: ["resultado", "qualidade"] }
  );
  // componente que saiu provisório contamina o IPC
  return { ...s, provisorio: s.provisorio || esforco.provisorio || resultado.provisorio || qualidade.provisorio };
}
