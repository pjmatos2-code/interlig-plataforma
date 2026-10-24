/**
 * Apuração da Performance Comercial (24/10/2026) — PURA sobre BaseDados.
 * Para cada vendedor do escopo monta as entradas de Esforço, Resultado e
 * Qualidade, calcula os scores e o IPC, e marca quem é comparável no
 * ranking. Também consolida os totais do time (cards da Visão Geral).
 * Testada em calcular.test.ts com bases sintéticas.
 */
import { churnPrecoce, ehVendaContavel, inadimplenciaPrimeiraFatura, type ContratoIndicador } from "@/lib/indicadores/regras";
import { pesosDoSetor } from "../config";
import { segundosUteis } from "../expediente";
import { limitesMs } from "../periodo";
import { linhaDeResponsabilidade, recebeuNoPeriodo, type PeriodoResponsavel } from "../regras/atribuicao";
import { mediana, razao } from "../regras/normalizacao";
import { calcularEsforco, calcularIpc, calcularQualidade, calcularResultado, type EntradasEsforco } from "../regras/scores";
import type { Indicador, Score } from "../tipos";
import type { AcaoHumana, BaseDados, ContratoBase, TicketBase, VendedorBase } from "./base";

const DIA = 86_400_000;
export const diaDe = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const somaDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * DIA).toISOString().slice(0, 10);
const diasCorridos = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);
const entre = (d: string, de: string, ate: string) => d >= de && d <= ate;
const SETOR_ROTULO: Record<string, string> = {
  comercial_interno: "Comercial interno",
  comercial_externo: "Venda externa",
  atendimento: "Atendimento",
  retencao: "Retenção",
  corporativo: "Corporativo",
  gerencia: "Gerência",
};
export const rotuloSetor = (s: string | null) => (s ? (SETOR_ROTULO[s] ?? s) : "Sem função");

export type LinhaPerformance = {
  vendedor: VendedorBase;
  flags: {
    emRampa: boolean;
    coordenador: boolean;
    disponibilidade: number;
    comparavel: boolean;
    motivoNaoComparavel: string | null;
    temCanalChat: boolean;
  };
  esforco: { score: Score; indicadores: Record<string, Indicador> };
  resultado: { score: Score; indicadores: Record<string, Indicador> };
  qualidade: { score: Score; indicadores: Record<string, Indicador> };
  ipc: Score;
  numeros: {
    leadsRecebidos: number;
    leadsTrabalhados: number;
    conversasAtivas: number;
    vendas: number;
    conversao: number | null;
    metaPct: number | null;
    metaPeriodo: number | null;
    receitaNova: number;
    ticketMedio: number | null;
    ativacoes: number;
    propostas: number;
    followupsPendentes: number;
    followupsAtrasados: number;
    leadsSemRetorno: number;
  };
  posicao: number | null;
};

export type TotaisPerformance = {
  leadsRecebidos: number;
  leadsAtendidos: number;
  leadsAguardando: number;
  leadsQualificados: number;
  vendas: number;
  conversao: number | null;
  fechados: number;
  ativacoes: number;
  receitaNova: number;
  ticketMedio: number | null;
  followupsPendentes: number;
  followupsVencidos: number;
  leadsQuentesParados: number;
  primeiraRespostaMediana: number | null;
  slaPct: number | null;
  esforcoMedio: number | null;
  qualidadeMedia: number | null;
  ipcMedio: number | null;
  metaPeriodo: number | null;
  metaPct: number | null;
  serie: { dia: string; leads: number; vendas: number; ativacoes: number; receita: number }[];
};

type Indices = ReturnType<typeof indexar>;

/** índices reaproveitados entre o período e o comparativo */
export function indexar(base: BaseDados) {
  const ticketPorId = new Map(base.tickets.map((t) => [t.id, t]));
  const linhas = new Map<string, PeriodoResponsavel[]>();
  const linhaDe = (t: TicketBase) => {
    let l = linhas.get(t.id);
    if (!l) {
      l = linhaDeResponsabilidade(t.criado_em, t.vendedor_id, base.reatribuicoes.get(t.id) ?? []);
      linhas.set(t.id, l);
    }
    return l;
  };
  const acoesPorTicket = new Map<string, AcaoHumana[]>();
  const add = (a: AcaoHumana) => {
    const l = acoesPorTicket.get(a.ticketId) ?? [];
    l.push(a);
    acoesPorTicket.set(a.ticketId, l);
  };
  for (const a of base.acoes) add(a);
  // chat: dias com mensagem humana por vendedor e lead, e a última fala humana
  const chatDias = new Map<string, Map<string, Set<string>>>(); // vendedor → ticket → dias
  const ultimaFalaHumana = new Map<string, number>(); // ticket → ms
  const atividadeChat = new Map<string, number>(); // vendedor → última atividade (ms)
  for (const c of base.conversas) {
    for (const ag of Object.values(c.por_agente ?? {})) {
      const ult = Date.parse(ag.ultima_msg_em);
      if (c.ticket_id && Number.isFinite(ult)) ultimaFalaHumana.set(c.ticket_id, Math.max(ultimaFalaHumana.get(c.ticket_id) ?? 0, ult));
      if (!ag.vendedor_id) continue;
      atividadeChat.set(ag.vendedor_id, Math.max(atividadeChat.get(ag.vendedor_id) ?? 0, ult));
      if (!c.ticket_id) continue;
      const porTicket = chatDias.get(ag.vendedor_id) ?? new Map<string, Set<string>>();
      const dias = porTicket.get(c.ticket_id) ?? new Set<string>();
      for (const d of Object.keys(ag.msgs_por_dia ?? {})) dias.add(d);
      porTicket.set(c.ticket_id, dias);
      chatDias.set(ag.vendedor_id, porTicket);
      add({ ticketId: c.ticket_id, vendedorId: ag.vendedor_id, em: Date.parse(ag.primeira_msg_em), fonte: "chat" });
      add({ ticketId: c.ticket_id, vendedorId: ag.vendedor_id, em: ult, fonte: "chat" });
    }
  }
  const ultimaAcao = (ticketId: string) => {
    const a = (acoesPorTicket.get(ticketId) ?? []).reduce((m, x) => Math.max(m, x.em), 0);
    return Math.max(a, ultimaFalaHumana.get(ticketId) ?? 0) || null;
  };
  const analisePorTicket = new Map<string, BaseDados["analises"][number]>();
  for (const a of [...base.analises].sort((x, y) => Date.parse(x.concluido_em) - Date.parse(y.concluido_em)))
    if (a.ticket_id) analisePorTicket.set(a.ticket_id, a);
  const contratosPorVendedor = new Map<string, ContratoBase[]>();
  for (const c of base.contratos) {
    if (!c.vendedor_id) continue;
    const l = contratosPorVendedor.get(c.vendedor_id) ?? [];
    l.push(c);
    contratosPorVendedor.set(c.vendedor_id, l);
  }
  const titulosPorContrato = new Map(base.titulosPrimeira.map((t) => [t.contrato_id, t]));
  return { ticketPorId, linhaDe, acoesPorTicket, chatDias, ultimaAcao, atividadeChat, analisePorTicket, contratosPorVendedor, titulosPorContrato };
}

/** dia de referência do fechamento (mesma régua do CRM: convertido pela data da venda) */
export function diaReferenciaFechamento(t: TicketBase): string | null {
  if (t.etapa !== "fechado") return null;
  if (t.desfecho === "convertido" && t.data_venda_contrato) return t.data_venda_contrato.slice(0, 10);
  return t.fechado_em ? diaDe(Date.parse(t.fechado_em)) : null;
}

const ehLead = (t: TicketBase) => t.origem_criacao !== "sgp_auto";

function diasUteis(base: BaseDados, de: string, ate: string): string[] {
  const out: string[] = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) if (base.ehDiaUtil(d)) out.push(d);
  return out;
}

function indisponivel(base: BaseDados, vendedorId: string, dia: string) {
  return base.indisponibilidades.some((i) => i.vendedor_id === vendedorId && dia >= i.inicio && dia <= i.fim);
}

/** meta de vendas (e de receita) proporcional aos dias úteis disponíveis no período */
export function metaProporcional(base: BaseDados, vendedorId: string, de: string, ate: string) {
  let vendas: number | null = null;
  let receita: number | null = null;
  for (let mes = `${de.slice(0, 7)}-01`; mes <= ate; mes = somaDias(`${mes.slice(0, 7)}-28`, 5).slice(0, 7) + "-01") {
    const meta = base.metas.find((m) => m.vendedor_id === vendedorId && m.mes_ano.slice(0, 7) === mes.slice(0, 7));
    if (!meta) continue;
    const fimMes = somaDias(`${somaDias(`${mes.slice(0, 7)}-28`, 5).slice(0, 7)}-01`, -1);
    const uteisMes = diasUteis(base, mes, fimMes).length;
    if (!uteisMes) continue;
    const ini = de > mes ? de : mes;
    const fim = ate < fimMes ? ate : fimMes;
    const disponiveis = diasUteis(base, ini, fim).filter((d) => !indisponivel(base, vendedorId, d)).length;
    vendas = (vendas ?? 0) + (meta.quantidade_vendas * disponiveis) / uteisMes;
    if (meta.receita !== null) receita = (receita ?? 0) + (meta.receita * disponiveis) / uteisMes;
  }
  const arred = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return { vendas: arred(vendas), receita: arred(receita) };
}

export function calcularLinha(base: BaseDados, idx: Indices, v: VendedorBase, de: string, ate: string): LinhaPerformance {
  const cfg = base.cfg;
  const [deMs, ateMs] = limitesMs(de, ate);
  const noPeriodo = (ms: number) => ms >= deMs && ms <= ateMs;
  const pesos = pesosDoSetor(cfg, v.setor);
  const leads = base.tickets.filter(ehLead);

  // ---------- leads recebidos / trabalhados
  const minhasAcoesNoPeriodo = (t: TicketBase) =>
    (idx.acoesPorTicket.get(t.id) ?? []).some((a) => a.vendedorId === v.id && a.fonte !== "chat" && noPeriodo(a.em)) ||
    [...(idx.chatDias.get(v.id)?.get(t.id) ?? [])].some((d) => entre(d, de, ate));
  let recebidos = 0;
  let recebidosAtendidos = 0;
  for (const t of leads) {
    const quando = recebeuNoPeriodo(idx.linhaDe(t), v.id, deMs, ateMs);
    if (quando === null) continue;
    recebidos++;
    const atendeu =
      (idx.acoesPorTicket.get(t.id) ?? []).some((a) => a.vendedorId === v.id && a.em >= quando) ||
      [...(idx.chatDias.get(v.id)?.get(t.id) ?? [])].some((d) => d >= diaDe(quando));
    if (atendeu) recebidosAtendidos++;
  }
  const trabalhados = leads.filter(minhasAcoesNoPeriodo);

  // ---------- conversas (só receptivas contam para atendimento/SLA)
  let conversasAtendidas = 0;
  let conversasTrabalhadas = 0;
  const prUtil: number[] = [];
  const prBruto: number[] = [];
  const gapsUtil: number[] = [];
  const gapsBruto: number[] = [];
  let enviadas = 0;
  let recebidasMsgs = 0;
  let conversasAtivas = 0;
  for (const c of base.conversas) {
    const meu = Object.values(c.por_agente ?? {}).find((a) => a.vendedor_id === v.id);
    const diasMeus = meu ? Object.entries(meu.msgs_por_dia ?? {}).filter(([d]) => entre(d, de, ate)) : [];
    if (meu) {
      enviadas += diasMeus.reduce((s, [, n]) => s + n, 0);
      for (const g of meu.gaps ?? [])
        if (noPeriodo(g[0] * 1000)) {
          gapsBruto.push(g[1]);
          gapsUtil.push(g[2]);
        }
    }
    if (c.vendedor_id === v.id)
      recebidasMsgs += Object.entries(c.cliente_por_dia ?? {}).filter(([d]) => entre(d, de, ate)).reduce((s, [, n]) => s + n, 0);
    const deuPrimeira = c.primeira_resposta_vendedor_id === v.id && c.primeira_resposta_em && noPeriodo(Date.parse(c.primeira_resposta_em));
    if (deuPrimeira) {
      if (c.primeira_resposta_util_seg !== null) prUtil.push(c.primeira_resposta_util_seg);
      if (c.primeira_resposta_seg !== null) prBruto.push(c.primeira_resposta_seg);
    }
    if (diasMeus.length) conversasAtivas++;
    if (c.iniciada_por === "cliente" && (diasMeus.length || deuPrimeira)) {
      conversasAtendidas++;
      const respondeu = deuPrimeira || (meu?.gaps ?? []).some((g) => noPeriodo(g[0] * 1000));
      if (respondeu) conversasTrabalhadas++;
    }
  }
  const temCanalChat = (idx.atividadeChat.get(v.id) ?? 0) >= base.agoraMs - 60 * DIA || conversasAtivas > 0;

  // ---------- follow-ups
  const origensValidas = new Set(["crm", "manual", "ia", "regra", ...(cfg.followup.incluir_automaticos ? ["robo"] : [])]);
  const meusFu = base.followups.filter((f) => f.vendedor_id === v.id && origensValidas.has(f.origem));
  const comPrazoNoPeriodo = meusFu.filter((f) => noPeriodo(Date.parse(f.prazo)) && f.status !== "sugerido" && f.status !== "rejeitado");
  const devidos = comPrazoNoPeriodo.filter((f) => ["concluido_prazo", "concluido_atraso", "vencido"].includes(f.status));
  const followups = {
    previstos: comPrazoNoPeriodo.length,
    devidos: devidos.length,
    noPrazo: devidos.filter((f) => f.status === "concluido_prazo").length,
    realizados: meusFu.filter((f) => f.concluido_em && noPeriodo(Date.parse(f.concluido_em)) && f.status.startsWith("concluido")).length,
    vencidos: devidos.filter((f) => f.status === "vencido").length,
  };
  const fuAbertos = meusFu.filter((f) => ["programado", "pendente", "vencido"].includes(f.status));

  // ---------- leads abertos agora: sem retorno e disciplina
  const abertos = leads.filter((t) => t.vendedor_id === v.id && t.etapa !== "fechado");
  const limiteSemRetorno = cfg.sla.sem_retorno_horas * 3600;
  let semRetorno = 0;
  let checagens = 0;
  let checagensOk = 0;
  for (const t of abertos) {
    const ultima = idx.ultimaAcao(t.id);
    const temFuturo =
      (t.followup_em && Date.parse(t.followup_em) > base.agoraMs) ||
      base.followups.some((f) => f.ticket_id === t.id && ["programado", "pendente"].includes(f.status) && Date.parse(f.prazo) > base.agoraMs);
    const desde = ultima ?? Date.parse(t.criado_em);
    if (!temFuturo && segundosUteis(new Date(desde).toISOString(), new Date(base.agoraMs).toISOString(), cfg.expediente, base.ehDiaUtil) > limiteSemRetorno)
      semRetorno++;
    // disciplina: telefone válido; etapa coerente; próximo passo em negociação
    checagens++;
    if ((t.telefone ?? "").replace(/\D/g, "").length >= 10) checagensOk++;
    checagens++;
    if (!(t.etapa === "novo" && ultima)) checagensOk++;
    if (["em_atendimento", "aguardando", "proposta", "pre_cadastro"].includes(t.etapa)) {
      checagens++;
      if (t.followup_em || t.urgencia || base.followups.some((f) => f.ticket_id === t.id && ["programado", "pendente", "vencido"].includes(f.status))) checagensOk++;
    }
  }

  // ---------- propostas e recuperação
  const propostas = base.propostas.filter((p) => p.vendedor_id === v.id && noPeriodo(p.em)).length;
  const inicio30 = Date.parse(`${somaDias(ate, -29)}T00:00:00-03:00`);
  const doSetor = new Set(base.vendedores.filter((x) => x.setor === v.setor).map((x) => x.id));
  const propostasSetor30 = base.propostas.filter((p) => p.vendedor_id && doSetor.has(p.vendedor_id) && p.em >= inicio30 && p.em <= ateMs).length;
  const deElegivel = somaDias(de, -60);
  const perdidos = leads.filter(
    (t) => t.vendedor_id === v.id && t.etapa === "fechado" && t.desfecho === "nao_convertido" && t.fechado_em && entre(diaDe(Date.parse(t.fechado_em)), deElegivel, ate)
  );
  const telefonesPerdidos = new Map<string, number>();
  for (const p of perdidos) {
    const tel = (p.telefone ?? "").replace(/\D/g, "");
    if (tel.length >= 10) telefonesPerdidos.set(tel, Math.max(telefonesPerdidos.get(tel) ?? 0, Date.parse(p.fechado_em!)));
  }
  const convertidosNoPeriodo = leads.filter((t) => t.vendedor_id === v.id && t.desfecho === "convertido" && entre(diaReferenciaFechamento(t) ?? "", de, ate));
  const recuperados = convertidosNoPeriodo.filter((t) => {
    if (t.reaberto_de_id) return true;
    if ((idx.acoesPorTicket.get(t.id) ?? []).some((a) => a.fonte === "reabertura")) return true;
    const tel = (t.telefone ?? "").replace(/\D/g, "");
    const perdidoEm = telefonesPerdidos.get(tel);
    return perdidoEm !== undefined && perdidoEm < Date.parse(t.criado_em) + DIA && Date.parse(t.criado_em) - perdidoEm <= 60 * DIA;
  }).length;

  // leads que nascem no chat sem agente vinculado: atendimento invisível, não zero
  const recebidosChat = leads.filter((t) => t.origem_criacao === "sz_auto" && recebeuNoPeriodo(idx.linhaDe(t), v.id, deMs, ateMs) !== null).length;
  const chatSemVinculo = !temCanalChat && recebidos > 0 && recebidosChat / recebidos > 0.5;

  const entradasEsforco: EntradasEsforco = {
    temCanalChat,
    chatSemVinculo,
    leadsRecebidos: recebidos,
    leadsRecebidosAtendidos: recebidosAtendidos,
    leadsTrabalhados: trabalhados.length,
    conversasAtendidas,
    conversasTrabalhadas,
    primeiraResposta: { util: prUtil, bruto: prBruto },
    gaps: { util: gapsUtil, bruto: gapsBruto },
    followups,
    leadsAbertos: abertos.length,
    leadsSemRetorno: semRetorno,
    propostas,
    funcaoRegistraPropostas: propostasSetor30 >= cfg.volume_minimo.propostas_equipe,
    recuperacao: { recuperados, elegiveis: perdidos.length },
    disciplina: { checagens, ok: checagensOk },
    mensagens: { enviadas, recebidas: recebidasMsgs },
  };
  const esforco = calcularEsforco(entradasEsforco, cfg, pesos.esforco);

  // ---------- resultado
  const meus = idx.contratosPorVendedor.get(v.id) ?? [];
  const comoIndicador = (c: ContratoBase) => c as unknown as ContratoIndicador;
  const vendasLista = meus.filter((c) => entre(c.data_venda, de, ate) && ehVendaContavel(comoIndicador(c)));
  const receitaNova = Math.round(vendasLista.reduce((s, c) => s + c.valor_mensalidade, 0) * 100) / 100;
  const ativacoes = meus.filter((c) => c.data_ativacao && entre(c.data_ativacao.slice(0, 10), de, ate)).length;
  // coordenador tem a meta DA COORDENAÇÃO no próprio registro (não vende): não é meta individual
  const meta = v.eh_coordenador ? { vendas: null, receita: null } : metaProporcional(base, v.id, de, ate);
  const fechadosLista = leads.filter((t) => t.vendedor_id === v.id && entre(diaReferenciaFechamento(t) ?? "", de, ate));
  const convertidos = fechadosLista.filter((t) => t.desfecho === "convertido").length;
  const resultado = calcularResultado(
    { vendas: vendasLista.length, metaPeriodo: meta.vendas, fechados: fechadosLista.length, convertidos, receitaNova, metaReceita: meta.receita, ativacoes },
    cfg,
    pesos.resultado
  );

  // ---------- qualidade (coortes maduras relativas ao fim do período)
  const mat = cfg.qualidade.maturidade_dias;
  const jan = cfg.qualidade.janela_dias;
  const coorteVenda = meus.filter((c) => entre(c.data_venda, somaDias(ate, -(mat + jan)), somaDias(ate, -mat)) && ehVendaContavel(comoIndicador(c)));
  const cancelAntes = { casos: coorteVenda.filter((c) => c.status === "cancelado" && !c.data_ativacao).length, base: coorteVenda.length };
  const ativ30 = meus.filter((c) => c.data_ativacao && entre(c.data_ativacao.slice(0, 10), somaDias(ate, -(30 + jan)), somaDias(ate, -30)));
  const cancel30 = {
    casos: ativ30.filter((c) => c.data_cancelamento && diasCorridos(c.data_ativacao!.slice(0, 10), c.data_cancelamento.slice(0, 10)) <= 30).length,
    base: ativ30.length,
  };
  const ativ90 = meus.filter((c) => c.data_ativacao && entre(c.data_ativacao.slice(0, 10), somaDias(ate, -(90 + jan)), somaDias(ate, -90)));
  const ch = churnPrecoce(ativ90.map(comoIndicador), ate);
  const titulos = meus
    .map((c) => idx.titulosPorContrato.get(c.id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t) && entre(t!.vencimento, somaDias(ate, -(10 + jan)), somaDias(ate, -10)));
  const inad = inadimplenciaPrimeiraFatura(titulos, ate);
  const notasAtendimento = base.analises
    .filter((a) => a.vendedor_id === v.id && a.score_atendimento !== null && noPeriodo(Date.parse(a.concluido_em)))
    .map((a) => a.score_atendimento as number);
  const qualidade = calcularQualidade(
    {
      cancelAntesInstalacao: cancelAntes,
      cancel30,
      churn90: { casos: ch.cancelados, base: ch.base },
      inad1: { casos: inad.inadimplentes, base: inad.base },
      atendimento: notasAtendimento,
      iaHabilitada: cfg.ia.habilitada,
    },
    cfg,
    pesos.qualidade
  );

  const ipc = calcularIpc(esforco.score, resultado.score, qualidade.score, pesos.ipc);

  // ---------- comparabilidade
  const uteis = diasUteis(base, de, ate);
  const disponibilidade = uteis.length ? uteis.filter((d) => !indisponivel(base, v.id, d)).length / uteis.length : 1;
  const emRampa = Boolean(v.admitido_em && diasCorridos(v.admitido_em, ate) < cfg.rampa_dias);
  // decisão do gestor (20/10/2026): no mês, só conta quem tem meta — férias e
  // desligamentos ficam sem meta e saem da comparação
  const setorTemMetas = base.metas.some((m) => {
    const dono = m.vendedor_id !== v.id ? base.vendedores.find((x) => x.id === m.vendedor_id) : undefined;
    return Boolean(dono && dono.setor === v.setor && !dono.eh_coordenador);
  });
  const semMeta = meta.vendas === null && setorTemMetas;
  const motivo = !v.ativo
    ? "Inativo"
    : v.eh_coordenador
      ? "Coordenação"
      : emRampa && !cfg.rampa_no_ranking
        ? "Em rampa (recém-contratado)"
        : disponibilidade < 0.5
          ? "Disponível menos da metade do período"
          : semMeta
            ? "Sem meta no período (afastamento, desligamento ou conta de loja)"
            : esforco.score.valor === null && resultado.score.valor === null
              ? "Sem dados de esforço nem de resultado"
              : esforco.score.cobertura < cfg.cobertura_minima_ranking
                ? `Dados de esforço insuficientes (cobertura ${Math.round(esforco.score.cobertura * 100)}%)`
                : null;

  return {
    vendedor: v,
    flags: { emRampa, coordenador: v.eh_coordenador, disponibilidade: Math.round(disponibilidade * 100) / 100, comparavel: motivo === null, motivoNaoComparavel: motivo, temCanalChat },
    esforco,
    resultado,
    qualidade,
    ipc,
    numeros: {
      leadsRecebidos: recebidos,
      leadsTrabalhados: trabalhados.length,
      conversasAtivas,
      vendas: vendasLista.length,
      conversao: razao(convertidos, fechadosLista.length),
      metaPct: meta.vendas ? vendasLista.length / meta.vendas : null,
      metaPeriodo: meta.vendas,
      receitaNova,
      ticketMedio: vendasLista.length ? Math.round((receitaNova / vendasLista.length) * 100) / 100 : null,
      ativacoes,
      propostas,
      followupsPendentes: fuAbertos.filter((f) => f.status !== "vencido").length,
      followupsAtrasados: fuAbertos.filter((f) => f.status === "vencido").length,
      leadsSemRetorno: semRetorno,
    },
    posicao: null,
  };
}

/** posição no ranking: só comparáveis, dentro da mesma função */
export function ordenarRanking(linhas: LinhaPerformance[], chave: "ipc" | "esforco" | "resultado" | "qualidade" = "ipc"): LinhaPerformance[] {
  const valor = (l: LinhaPerformance) => (chave === "ipc" ? l.ipc.valor : l[chave].score.valor);
  const porSetor = new Map<string, LinhaPerformance[]>();
  for (const l of linhas) {
    const k = l.vendedor.setor ?? "";
    porSetor.set(k, [...(porSetor.get(k) ?? []), l]);
  }
  for (const grupo of porSetor.values()) {
    const comparaveis = grupo.filter((l) => l.flags.comparavel && valor(l) !== null).sort((a, b) => (valor(b) ?? 0) - (valor(a) ?? 0));
    comparaveis.forEach((l, i) => (l.posicao = i + 1));
    for (const l of grupo) if (!comparaveis.includes(l)) l.posicao = null;
  }
  return [...linhas].sort(
    (a, b) =>
      (a.vendedor.setor ?? "").localeCompare(b.vendedor.setor ?? "") ||
      (a.posicao ?? 999) - (b.posicao ?? 999) ||
      (valor(b) ?? -1) - (valor(a) ?? -1)
  );
}

export function calcularTotais(
  base: BaseDados,
  idx: Indices,
  linhas: LinhaPerformance[],
  de: string,
  ate: string,
  opts: { incluirSemDono: boolean; popId?: string | null }
): TotaisPerformance {
  const cfg = base.cfg;
  const [deMs, ateMs] = limitesMs(de, ate);
  const ids = new Set(linhas.map((l) => l.vendedor.id));
  const noEscopo = (t: TicketBase) => (t.vendedor_id ? ids.has(t.vendedor_id) : opts.incluirSemDono && (!opts.popId || t.pop_id === opts.popId));
  const leads = base.tickets.filter((t) => ehLead(t) && noEscopo(t));
  const doPeriodo = leads.filter((t) => {
    const ms = Date.parse(t.criado_em);
    return ms >= deMs && ms <= ateMs;
  });
  const atendido = (t: TicketBase) => (idx.acoesPorTicket.get(t.id) ?? []).length > 0 || idx.ultimaAcao(t.id) !== null;
  const qualificado = (t: TicketBase) => {
    if (t.desfecho === "convertido" || t.etapa === "aguardando") return true;
    if (base.propostas.some((p) => p.ticket_id === t.id)) return true;
    const a = idx.analisePorTicket.get(t.id);
    return Boolean(a && (a.temperatura === "quente" || a.temperatura === "morno" || a.intencao_compra));
  };
  const fechados = leads.filter((t) => entre(diaReferenciaFechamento(t) ?? "", de, ate));
  const convertidos = fechados.filter((t) => t.desfecho === "convertido").length;
  const abertos = leads.filter((t) => t.etapa !== "fechado");

  // lead quente parado: IA (quente/intenção) ou urgência alta do robô, sem ação humana depois do sinal
  const limiteQuente = cfg.lead_quente.minutos_sem_resposta * 60;
  const agoraIso = new Date(base.agoraMs).toISOString();
  let quentesParados = 0;
  for (const t of abertos) {
    const a = idx.analisePorTicket.get(t.id);
    const quentePelaIa = cfg.lead_quente.usar_ia && a && (a.temperatura === "quente" || a.intencao_compra);
    const quentePelaUrgencia = cfg.lead_quente.usar_urgencia_alta && t.urgencia === "alta";
    if (!quentePelaIa && !quentePelaUrgencia) continue;
    const sinal = quentePelaIa ? Date.parse(a!.concluido_em) : Date.parse(t.criado_em);
    const ultima = idx.ultimaAcao(t.id) ?? 0;
    const referencia = Math.max(sinal, ultima);
    if (ultima < sinal && segundosUteis(new Date(referencia).toISOString(), agoraIso, cfg.expediente, base.ehDiaUtil) > limiteQuente) quentesParados++;
  }

  // mesmas origens dos indicadores individuais (retorno automático do robô fica fora por padrão)
  const origensValidas = new Set(["crm", "manual", "ia", "regra", ...(cfg.followup.incluir_automaticos ? ["robo"] : [])]);
  const fu = base.followups.filter((f) => f.vendedor_id && ids.has(f.vendedor_id) && origensValidas.has(f.origem));
  const vendas = linhas.reduce((s, l) => s + l.numeros.vendas, 0);
  const receita = Math.round(linhas.reduce((s, l) => s + l.numeros.receitaNova, 0) * 100) / 100;
  const metaPeriodo = linhas.reduce<number | null>((s, l) => (l.numeros.metaPeriodo === null ? s : (s ?? 0) + l.numeros.metaPeriodo), null);
  const pr = base.conversas
    .filter((c) => c.primeira_resposta_vendedor_id && ids.has(c.primeira_resposta_vendedor_id) && c.primeira_resposta_em && Date.parse(c.primeira_resposta_em) >= deMs && Date.parse(c.primeira_resposta_em) <= ateMs)
    .map((c) => c.primeira_resposta_util_seg)
    .filter((x): x is number => x !== null);
  const media = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
  };
  const comparaveis = linhas.filter((l) => l.flags.comparavel);

  const serie: TotaisPerformance["serie"] = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) serie.push({ dia: d, leads: 0, vendas: 0, ativacoes: 0, receita: 0 });
  const porDia = new Map(serie.map((s) => [s.dia, s]));
  for (const t of doPeriodo) {
    const s = porDia.get(diaDe(Date.parse(t.criado_em)));
    if (s) s.leads++;
  }
  for (const c of base.contratos) {
    if (!c.vendedor_id || !ids.has(c.vendedor_id)) continue;
    const sv = porDia.get(c.data_venda);
    if (sv && ehVendaContavel(c as unknown as ContratoIndicador)) {
      sv.vendas++;
      sv.receita = Math.round((sv.receita + c.valor_mensalidade) * 100) / 100;
    }
    const sa = c.data_ativacao ? porDia.get(c.data_ativacao.slice(0, 10)) : undefined;
    if (sa) sa.ativacoes++;
  }

  return {
    leadsRecebidos: doPeriodo.length,
    leadsAtendidos: doPeriodo.filter(atendido).length,
    leadsAguardando: abertos.filter((t) => !atendido(t)).length,
    leadsQualificados: doPeriodo.filter(qualificado).length,
    vendas,
    conversao: razao(convertidos, fechados.length),
    fechados: fechados.length,
    ativacoes: linhas.reduce((s, l) => s + l.numeros.ativacoes, 0),
    receitaNova: receita,
    ticketMedio: vendas ? Math.round((receita / vendas) * 100) / 100 : null,
    followupsPendentes: fu.filter((f) => f.status === "programado" || f.status === "pendente").length,
    followupsVencidos: fu.filter((f) => f.status === "vencido").length,
    leadsQuentesParados: quentesParados,
    primeiraRespostaMediana: mediana(pr),
    slaPct: razao(pr.filter((s) => s <= cfg.sla.primeira_resposta_min * 60).length, pr.length),
    esforcoMedio: media(comparaveis.map((l) => l.esforco.score.valor)),
    qualidadeMedia: media(comparaveis.map((l) => l.qualidade.score.valor)),
    ipcMedio: media(comparaveis.map((l) => l.ipc.valor)),
    metaPeriodo: metaPeriodo === null ? null : Math.round(metaPeriodo * 10) / 10,
    metaPct: metaPeriodo ? vendas / metaPeriodo : null,
    serie,
  };
}
