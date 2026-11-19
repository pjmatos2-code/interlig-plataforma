import {
  ALERTA_ASSINATURA_DIAS,
  pendentesAssinatura,
  percentualMeta,
  receitaContratada,
  taxaInstalacaoEfetiva,
  tempoMedioVendaAtivacao,
  ticketMedio,
  vendasDoPeriodo,
  type ContratoIndicador,
} from "@/lib/indicadores/regras";
import { conversaoReal, foraDaConversao, separarNaoConvertidos, tempoPrimeiraTratativa, type TicketIndicador } from "@/lib/indicadores/crm";
import { diaMes, mesDeReferencia, rotuloSemanaCurto, somarDias, type MesReferencia, type Semana } from "@/lib/relatorio-semanal/periodo";
import { dec1, num, pct, reais, reais2 } from "@/lib/relatorio-semanal/formato";
import type { Status } from "@/lib/relatorio-semanal/tipos";
import type { GrupoGrr } from "./catalogo";
import { noEscopo, type CadastroGrr, type EscopoGrr } from "./escopo";
import {
  aguardandoInstalacao,
  dataRefTicket,
  diaSantarem,
  evolucao,
  metaDoEscopo,
  metaDoTrecho,
  paradaMais7Dias,
  statusAssinatura,
  statusEsteira,
  statusMesFechado,
  statusRitmo,
  trechosDaSemana,
  type Evolucao,
  type MetaLinha,
  type Trecho,
} from "./regras";
import { conversaoPorSafra } from "./safra";
import { semanasAte } from "./semana";

/**
 * Montagem do GRR Comercial (função pura): recebe o que foi lido do banco e
 * devolve os cartões do resumo, as quebras por unidade, equipe e agente e a
 * evolução das últimas semanas. Toda conta de indicador vem de
 * lib/indicadores; aqui só se escolhe o trecho, o recorte e o texto.
 */

export type ContratoGrr = ContratoIndicador & {
  id: string;
  sgp_contrato_id: string | null;
  vendedor_id: string | null;
  pop_id: string | null;
  /** Prefeitura ou rede neutra: fora das vendas do comercial (decisão de 24/10/2026) */
  fora: "Prefeitura" | "rede neutra" | null;
};

export type TicketGrr = TicketIndicador & {
  id: string;
  cliente_nome: string;
  vendedor_id: string | null;
  pop_id: string | null;
  origem_criacao: string;
  /** só para reconhecer tickets repetidos do mesmo lead; não é exibido */
  telefone: string | null;
  followup_em: string | null;
  followup_feito_em: string | null;
  /** data da venda do contrato ligado ao ticket, quando há */
  data_venda_contrato: string | null;
};

export type AcaoGrr = { quando: string; concluida_em: string | null; vendedor_id: string | null; pop_id: string | null; ticketAberto: boolean };

export type BaseGrr = {
  /** contratos com data de venda na janela (8 semanas e o mês de referência) */
  vendas: ContratoGrr[];
  /** contratos ativados na janela */
  ativados: ContratoGrr[];
  /** estoque: não cancelados sem assinatura ou sem ativação */
  pendencias: ContratoGrr[];
  /** contratos com OS de instalação aberta no SGP */
  osAbertas: ContratoGrr[];
  ticketsAbertos: TicketGrr[];
  ticketsFechados: TicketGrr[];
  /** ações agendadas nos tickets (lembretes com data), pendentes e concluídas */
  acoes: AcaoGrr[];
  /** metas do mês de referência */
  metas: MetaLinha[];
};

export type CartaoGrr = {
  chave: string;
  grupo: GrupoGrr;
  rotulo: string;
  valor: string;
  /** o número por trás do valor exibido (para metas e faixas) */
  numero: number | null;
  /** "meta 64" ou null quando o indicador ainda não tem meta */
  meta: string | null;
  contexto: string | null;
  evolucao: Evolucao | null;
  status: Status;
  /** quem responde pelo indicador (configuração do GRR) */
  dono?: string | null;
};

export type LinhaQuebra = {
  id: string;
  nome: string;
  detalhe: string | null;
  vendas: number;
  vendasAnterior: number;
  vendasMes: number;
  metaMes: number | null;
  receita: number;
  ticket: number | null;
  recebidos: number;
  atendidos: number;
  fechados: number;
  convertidos: number;
  conversao: number | null;
  perdidos: number;
  emNegociacao: number;
  ativacoes: number;
  safraAtendidos: number;
  safraConvertidos: number;
  safraTaxa: number | null;
};

export type PontoSemana = {
  inicio: string;
  rotulo: string;
  vendas: number;
  receita: number;
  ativacoes: number;
  recebidos: number;
  fechados: number;
  convertidos: number;
  conversao: number | null;
  perdidos: number;
  safraAtendidos: number;
  safraConvertidos: number;
  safraTaxa: number | null;
};

export type LinhaTicket = {
  id: string;
  cliente: string;
  agente: string | null;
  unidade: string | null;
  situacao: "convertido" | "perdido" | "fora" | "aberto";
  motivo: string | null;
  criadoEm: string;
  fechadoEm: string | null;
  /** venda lançada direto no SGP, sem atendimento no CRM */
  semLead: boolean;
};

export type DadosGrr = {
  hoje: string;
  semana: Semana;
  trechos: ReturnType<typeof trechosDaSemana>;
  mes: MesReferencia;
  cartoes: CartaoGrr[];
  vendas: {
    semana: number;
    anterior: number;
    mes: number;
    metaMes: number | null;
    metaSemana: number | null;
    esperadoMes: number | null;
    atingimentoMes: number | null;
    foraSemana: number;
    foraMes: number;
    semVendedorSemana: number;
  };
  ativacoes: {
    semana: number;
    anterior: number;
    diasVendaAtivacao: number | null;
    /** ativações do trecho com data de ativação igual à da venda (aproximação do cadastro) */
    noDiaDaVenda: number;
    receitaAtivada: number;
    aguardando: number;
    aguardandoRecentes: number;
    aguardandoDaSemana: number;
    paradasMais7Dias: number;
    antigasAguardando: number;
    semAssinarDaSemana: number;
    acima48hDaSemana: number;
    antigasSemAssinar: number;
    instalacaoEfetiva: { taxa: number | null; base: number; instaladas: number };
  };
  conversao: {
    taxa: number | null;
    fechados: number;
    convertidos: number;
    taxaAnterior: number | null;
    recebidos: number;
    recebidosAnterior: number;
    atendidos: number;
    emNegociacao: number;
    novosSemAtendimento: number;
    foraDaConversao: number;
    /** convertidas da semana que nasceram de venda lançada direto no SGP */
    convertidasSemLead: number;
    /** conta gerencial: leads que chegaram no trecho (lib/grr/safra.ts) */
    safra: { leads: number; atendidos: number; convertidos: number; perdidos: number; emNegociacao: number; taxa: number | null; taxaAnterior: number | null; semAtendimentoPrevio: number; repetidos: number };
  };
  receita: { semana: number; anterior: number; mes: number; ticket: number | null; ticketAnterior: number | null; ticketMes: number | null };
  perdas: {
    perdidos: number;
    perdidosAnterior: number;
    motivos: { motivo: string; quantidade: number }[];
    retornosVencidos: number;
    retornosHoje: number;
    retornosFuturos: number;
    /** ações agendadas concluídas e follow-ups registrados como feitos no trecho */
    retornosFeitosSemana: number;
    primeiraRespostaMin: number | null;
  };
  porUnidade: LinhaQuebra[];
  porEquipe: LinhaQuebra[];
  porAgente: LinhaQuebra[];
  evolucao: PontoSemana[];
  tickets: LinhaTicket[];
  avisos: string[];
};

const entre = (d: string | null | undefined, t: Trecho) => !!d && d >= t.de && d <= t.ate;
const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type Recorte = { contratos: ContratoGrr[]; ativados: ContratoGrr[]; abertos: TicketGrr[]; fechados: TicketGrr[] };

function medir(r: Recorte, atual: Trecho, anterior: Trecho, mes: Trecho) {
  const vSemana = vendasDoPeriodo(r.contratos, atual.de, atual.ate);
  const fechadosSemana = r.fechados.filter((t) => entre(dataRefTicket(t), atual));
  const conv = conversaoReal(fechadosSemana);
  const criadoNoTrecho = (t: TicketGrr) => entre(diaSantarem(t.criado_em), atual) && !foraDaConversao(t);
  const recebidos = [...r.abertos.filter(criadoNoTrecho), ...r.fechados.filter(criadoNoTrecho)];
  const safra = conversaoPorSafra([...r.abertos, ...r.fechados], atual.de, atual.ate);
  return {
    safra,
    vSemana,
    fechadosSemana,
    recebidosLista: recebidos,
    vendas: vSemana.length,
    vendasAnterior: vendasDoPeriodo(r.contratos, anterior.de, anterior.ate).length,
    vendasMes: vendasDoPeriodo(r.contratos, mes.de, mes.ate).length,
    receita: receitaContratada(vSemana),
    ticket: vSemana.length ? ticketMedio(vSemana) : null,
    recebidos: recebidos.length,
    atendidos: recebidos.filter((t) => t.primeira_tratativa_em !== null).length,
    fechados: conv.fechados,
    convertidos: conv.convertidos,
    conversao: conv.taxa,
    perdidos: separarNaoConvertidos(fechadosSemana).perdidos.length,
    emNegociacao: r.abertos.length,
    ativacoes: r.ativados.filter((c) => entre(c.data_ativacao, atual)).length,
  };
}

export function montarGrr(
  base: BaseGrr,
  semana: Semana,
  escopo: EscopoGrr,
  cadastro: CadastroGrr,
  ehExpediente: (dia: string) => boolean,
  hoje: string
): DadosGrr {
  const trechos = trechosDaSemana(semana, hoje);
  const { atual, anterior } = trechos;
  const mes = mesDeReferencia(semana);
  const fimMes = mes.fechado ? mes.ate : atual.ate;
  const trechoMes: Trecho = { de: mes.de, ate: fimMes };

  // ---------- recorte ----------
  const dentro = <T extends { pop_id: string | null; vendedor_id: string | null }>(l: T[]) => l.filter((x) => noEscopo(escopo, x));
  const todasAsVendas = dentro(base.vendas);
  const recorte: Recorte = {
    contratos: todasAsVendas.filter((c) => !c.fora),
    // vendas ativadas do comercial: Prefeitura e rede neutra ficam fora, como nas vendas
    ativados: dentro(base.ativados).filter((c) => !c.fora),
    abertos: dentro(base.ticketsAbertos),
    fechados: dentro(base.ticketsFechados),
  };
  const m = medir(recorte, atual, anterior, trechoMes);
  const mAnt = medir(recorte, anterior, anterior, trechoMes);

  // ---------- vendas e metas ----------
  const diasDoMes: string[] = [];
  for (let d = mes.de; d <= mes.ate; d = somarDias(d, 1)) if (ehExpediente(d)) diasDoMes.push(d);
  const expedienteEm = (t: Trecho) => diasDoMes.filter((d) => d >= t.de && d <= t.ate).length || contarExpediente(t, ehExpediente);
  const metaMes = metaDoEscopo(base.metas, cadastro.vendedores, cadastro.pops, escopo);
  const metaSemana = metaDoTrecho(metaMes, diasDoMes.length, contarExpediente({ de: semana.inicio, ate: semana.fim }, ehExpediente));
  // o ritmo olha só dias completos: semana em andamento conta até ontem
  const ontem = somarDias(hoje, -1);
  const fimRitmoSemana = semana.fim <= ontem ? semana.fim : ontem;
  const esperadoSemana = fimRitmoSemana < semana.inicio ? null : metaDoTrecho(metaMes, diasDoMes.length, contarExpediente({ de: semana.inicio, ate: fimRitmoSemana }, ehExpediente));
  const vendasAteRitmo = fimRitmoSemana < semana.inicio ? 0 : vendasDoPeriodo(recorte.contratos, semana.inicio, fimRitmoSemana).length;
  const statusSemana = statusRitmo(vendasAteRitmo, esperadoSemana);
  const fimRitmoMes = mes.fechado ? mes.ate : fimMes <= ontem ? fimMes : ontem;
  const esperadoMes = mes.fechado || fimRitmoMes < mes.de ? null : metaDoTrecho(metaMes, diasDoMes.length, expedienteEm({ de: mes.de, ate: fimRitmoMes }));
  const statusMes = mes.fechado
    ? statusMesFechado(m.vendasMes, metaMes)
    : statusRitmo(fimRitmoMes < mes.de ? 0 : vendasDoPeriodo(recorte.contratos, mes.de, fimRitmoMes).length, esperadoMes);
  const foraSemana = vendasDoPeriodo(todasAsVendas.filter((c) => c.fora), atual.de, atual.ate).length;
  const foraMes = vendasDoPeriodo(todasAsVendas.filter((c) => c.fora), mes.de, fimMes).length;

  // ---------- ativações ----------
  const ativSemana = recorte.ativados.filter((c) => entre(c.data_ativacao, atual));
  // a base grava a data de cadastro como ativação quando o contrato já chega ativo do SGP:
  // nesse caso o número mostra vendas já ativas, não instalações feitas no trecho
  const ativNoDiaDaVenda = ativSemana.filter((c) => c.data_ativacao === c.data_venda).length;
  const ativacaoAproximada = ativSemana.length >= 5 && ativNoDiaDaVenda / ativSemana.length >= 0.9;
  const pendencias = dentro(base.pendencias).filter((c) => !c.fora);
  const semAssinarDaSemana = pendentesAssinatura(m.vSemana, hoje);
  const acima48h = semAssinarDaSemana.filter((p) => p.idadeDias >= ALERTA_ASSINATURA_DIAS).length;
  const antigasSemAssinar = pendentesAssinatura(pendencias.filter((c) => c.data_venda < semana.inicio), hoje).length;
  const aguardando = aguardandoInstalacao(dentro(base.osAbertas).filter((c) => !c.fora), pendencias, hoje);
  const paradas = aguardando.filter((i) => paradaMais7Dias(i, hoje)).length;
  const antigasAguardando = aguardando.filter((i) => i.contrato.data_venda < semana.inicio).length;
  const aguardandoRecentes = aguardando.filter((i) => i.contrato.data_venda >= somarDias(hoje, -60)).length;
  const instalacaoEfetiva = taxaInstalacaoEfetiva(vendasDoPeriodo(recorte.contratos, somarDias(hoje, -45), hoje), hoje, 15);

  // ---------- conversão, perdas e retornos ----------
  const naoConvertidos = separarNaoConvertidos(m.fechadosSemana);
  const motivos = new Map<string, number>();
  for (const t of naoConvertidos.perdidos) {
    const nome = t.motivos_nao_conversao?.nome ?? "Sem motivo";
    motivos.set(nome, (motivos.get(nome) ?? 0) + 1);
  }
  const listaMotivos = [...motivos.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
  const diaRetorno = (t: TicketGrr) => (t.followup_em ? diaSantarem(t.followup_em) : null);
  // retornos = retorno agendado no ticket ∪ ações agendadas do ticket (lembretes com data)
  const acoes = dentro(base.acoes);
  const acoesPendentes = acoes.filter((x) => x.concluida_em === null && x.ticketAberto).map((x) => diaSantarem(x.quando));
  const retornosVencidos = recorte.abertos.filter((t) => (diaRetorno(t) ?? "9") < hoje).length + acoesPendentes.filter((dia) => dia < hoje).length;
  const retornosHoje = recorte.abertos.filter((t) => diaRetorno(t) === hoje).length + acoesPendentes.filter((dia) => dia === hoje).length;
  const retornosFuturos = recorte.abertos.filter((t) => (diaRetorno(t) ?? "") > hoje).length + acoesPendentes.filter((dia) => dia > hoje).length;
  const retornosFeitosSemana =
    [...recorte.abertos, ...recorte.fechados].filter((t) => t.followup_feito_em && entre(diaSantarem(t.followup_feito_em), atual)).length +
    acoes.filter((x) => x.concluida_em && entre(diaSantarem(x.concluida_em), atual)).length;
  const convertidasSemLead = m.fechadosSemana.filter((t) => t.desfecho === "convertido" && t.origem_criacao === "sgp_auto").length;

  // ---------- cartões ----------
  const rotuloTrecho = trechos.emAndamento ? `até ${NOMES_DIA[new Date(`${atual.ate}T12:00:00Z`).getUTCDay()]}` : "semana completa";
  const pp = (a: number | null, b: number | null): Evolucao | null => {
    if (a == null || b == null) return null;
    const d = Math.round((a - b) * 100);
    return { texto: d === 0 ? "igual à semana anterior" : `${Math.abs(d)} p.p. ${d > 0 ? "acima" : "abaixo"} da semana anterior`, direcao: d === 0 ? ("neutro" as const) : d > 0 ? ("sobe" as const) : ("desce" as const), bom: d === 0 ? null : d > 0 };
  };
  const cartoes: CartaoGrr[] = [
    {
      chave: "vendas_semana",
      grupo: "vendas",
      rotulo: "Vendas da semana",
      valor: num(m.vendas),
      numero: m.vendas,
      meta: metaSemana != null ? `meta ${num(Math.round(metaSemana))}` : null,
      contexto: metaSemana ? `${pct(percentualMeta(m.vendas, metaSemana))} da meta da semana · ${rotuloTrecho}` : `sem meta cadastrada · ${rotuloTrecho}`,
      evolucao: evolucao(m.vendas, m.vendasAnterior),
      status: statusSemana,
    },
    {
      chave: "vendas_mes",
      grupo: "vendas",
      rotulo: `Vendas de ${mes.nome}`,
      valor: num(m.vendasMes),
      numero: m.vendasMes,
      meta: metaMes != null ? `meta ${num(metaMes)}` : null,
      contexto: metaMes
        ? `${pct(percentualMeta(m.vendasMes, metaMes))} da meta${esperadoMes != null ? ` · esperado até ${diaMes(fimRitmoMes)}: ${num(Math.round(esperadoMes))}` : mes.fechado ? " · mês fechado" : ""}`
        : "sem meta cadastrada",
      evolucao: null,
      status: statusMes,
    },
    {
      chave: "ativacoes_semana",
      grupo: "ativacoes",
      rotulo: "Ativações na semana",
      valor: num(ativSemana.length),
      numero: ativSemana.length,
      meta: null,
      contexto: (() => {
        if (ativacaoAproximada) return `${num(ativNoDiaDaVenda)} de ${num(ativSemana.length)} com a data de ativação igual à da venda`;
        const prazo = tempoMedioVendaAtivacao(ativSemana);
        return prazo != null ? `${dec1(prazo)} ${prazo < 2 ? "dia" : "dias"} da venda à ativação` : "sem ativações no trecho";
      })(),
      evolucao: evolucao(ativSemana.length, mAnt.ativacoes),
      status: "sem_meta",
    },
    {
      chave: "instalacoes_paradas",
      grupo: "ativacoes",
      rotulo: "Instalações paradas há mais de 7 dias",
      valor: num(paradas),
      numero: paradas,
      meta: "meta 0",
      contexto: `${num(aguardandoRecentes)} aguardando instalação hoje, das vendas dos últimos 60 dias`,
      evolucao: null,
      status: statusEsteira(paradas, antigasAguardando),
    },
    {
      chave: "assinatura_48h",
      grupo: "ativacoes",
      rotulo: "Sem assinar há 48h ou mais",
      valor: num(acima48h),
      numero: acima48h,
      meta: "meta 0 acima de 48h",
      contexto: `${num(semAssinarDaSemana.length)} da semana sem assinar · ${num(antigasSemAssinar)} de vendas antigas`,
      evolucao: null,
      status: statusAssinatura(acima48h),
    },
    {
      chave: "conversao",
      grupo: "conversao",
      rotulo: "Conversão do CRM",
      valor: m.conversao == null ? "—" : pct(m.conversao),
      numero: m.conversao,
      meta: null,
      contexto: `${num(m.convertidos)} de ${num(m.fechados)} tickets fechados`,
      evolucao: pp(m.conversao, mAnt.conversao),
      status: "sem_meta",
    },
    {
      chave: "conversao_safra",
      grupo: "conversao",
      rotulo: "Conversão por safra de leads",
      valor: m.safra.taxa == null ? "—" : pct(m.safra.taxa),
      numero: m.safra.taxa,
      meta: null,
      contexto: `${num(m.safra.convertidos)} de ${num(m.safra.atendidos)} leads atendidos${m.safra.emNegociacao ? ` · ${num(m.safra.emNegociacao)} ainda em negociação` : ""}`,
      evolucao: pp(m.safra.taxa, mAnt.safra.taxa),
      status: "sem_meta",
    },
    {
      chave: "leads",
      grupo: "conversao",
      rotulo: "Leads recebidos",
      valor: num(m.recebidos),
      numero: m.recebidos,
      meta: null,
      contexto: `${num(m.atendidos)} atendidos · ${num(m.emNegociacao)} em negociação hoje`,
      evolucao: evolucao(m.recebidos, mAnt.recebidos),
      status: "sem_meta",
    },
    {
      chave: "receita",
      grupo: "receita",
      rotulo: "Receita nova (mensalidades)",
      valor: reais(m.receita),
      numero: m.receita,
      meta: null,
      contexto: `em ${mes.nome}: ${reais(receitaContratada(vendasDoPeriodo(recorte.contratos, mes.de, fimMes)))}`,
      evolucao: evolucao(m.receita, mAnt.receita),
      status: "sem_meta",
    },
    {
      chave: "ticket",
      grupo: "receita",
      rotulo: "Ticket médio",
      valor: m.ticket == null ? "—" : reais2(m.ticket),
      numero: m.ticket,
      meta: null,
      contexto: (() => {
        const vm = vendasDoPeriodo(recorte.contratos, mes.de, fimMes);
        return vm.length ? `em ${mes.nome}: ${reais2(ticketMedio(vm))}` : null;
      })(),
      evolucao: m.ticket != null && mAnt.ticket != null ? evolucao(m.ticket, mAnt.ticket) : null,
      status: "sem_meta",
    },
    {
      chave: "perdidos",
      grupo: "perdas",
      rotulo: "Perdidos na semana",
      valor: num(m.perdidos),
      numero: m.perdidos,
      meta: null,
      contexto: listaMotivos.length ? `principal motivo: ${listaMotivos[0].motivo} (${num(listaMotivos[0].quantidade)})` : "nenhum ticket perdido no trecho",
      evolucao: evolucao(m.perdidos, mAnt.perdidos, { menorEMelhor: true }),
      status: "sem_meta",
    },
    {
      chave: "retornos",
      grupo: "perdas",
      rotulo: "Retornos vencidos (hoje)",
      valor: num(retornosVencidos),
      numero: retornosVencidos,
      meta: null,
      contexto: `${num(retornosHoje)} para hoje · ${num(retornosFuturos)} agendados · ${num(retornosFeitosSemana)} feitos na semana`,
      evolucao: null,
      status: "sem_meta",
    },
  ];

  // ---------- quebras ----------
  const nomePop = new Map(cadastro.pops.map((p) => [p.id, p.nome]));
  const individuais = new Map(base.metas.filter((x) => x.escopo === "vendedora" && x.referencia_id).map((x) => [x.referencia_id as string, Number(x.quantidade_vendas)]));
  const linha = (id: string, nome: string, detalhe: string | null, r: Recorte, metaDaLinha: number | null): LinhaQuebra => {
    const x = medir(r, atual, anterior, trechoMes);
    return {
      id, nome, detalhe,
      vendas: x.vendas, vendasAnterior: x.vendasAnterior, vendasMes: x.vendasMes, metaMes: metaDaLinha,
      receita: x.receita, ticket: x.ticket,
      recebidos: x.recebidos, atendidos: x.atendidos, fechados: x.fechados, convertidos: x.convertidos, conversao: x.conversao,
      perdidos: x.perdidos, emNegociacao: x.emNegociacao, ativacoes: x.ativacoes,
      safraAtendidos: x.safra.atendidos, safraConvertidos: x.safra.convertidos, safraTaxa: x.safra.taxa,
    };
  };
  const cortar = (f: (x: { pop_id: string | null; vendedor_id: string | null }) => boolean): Recorte => ({
    contratos: recorte.contratos.filter(f),
    ativados: recorte.ativados.filter(f),
    abertos: recorte.abertos.filter(f),
    fechados: recorte.fechados.filter(f),
  });
  const temNumero = (l: LinhaQuebra) => l.vendas + l.vendasAnterior + l.vendasMes + l.recebidos + l.fechados + l.emNegociacao + l.ativacoes > 0;

  const porUnidade = cadastro.pops
    .filter((p) => !escopo.popId || p.id === escopo.popId)
    .map((p) => linha(p.id, p.nome, null, cortar((x) => x.pop_id === p.id), escopo.vendedorIds ? null : metaDoEscopo(base.metas, cadastro.vendedores, cadastro.pops, { popId: p.id, vendedorIds: null })))
    .filter((l) => temNumero(l) || l.metaMes != null);
  const semUnidade = linha("sem-unidade", "Sem unidade", null, cortar((x) => x.pop_id === null), null);
  if (temNumero(semUnidade)) porUnidade.push(semUnidade);

  const porEquipe =
    escopo.podeFiltrar.equipe && escopo.nivel !== "agente"
      ? cadastro.equipes
          .map((e) => {
            const ids = new Set(e.vendedorIds);
            return linha(e.coordenadorId, e.nome, `${e.vendedorIds.length} ${e.vendedorIds.length === 1 ? "agente" : "agentes"}`, cortar((x) => !!x.vendedor_id && ids.has(x.vendedor_id)), metaDoEscopo(base.metas, cadastro.vendedores, cadastro.pops, { popId: null, vendedorIds: e.vendedorIds }));
          })
          .filter(temNumero)
      : [];

  const idsComDado = new Set<string>();
  for (const c of [...recorte.contratos, ...recorte.ativados]) if (c.vendedor_id) idsComDado.add(c.vendedor_id);
  for (const t of [...recorte.abertos, ...recorte.fechados]) if (t.vendedor_id) idsComDado.add(t.vendedor_id);
  const porId = new Map(cadastro.vendedores.map((v) => [v.id, v]));
  const idsAgentes = new Set([...escopo.agentesDisponiveis.map((v) => v.id), ...idsComDado]);
  const porAgente = [...idsAgentes]
    .map((id) => {
      const v = porId.get(id);
      return linha(id, v?.nome ?? "Agente sem cadastro", v?.pop_id ? nomePop.get(v.pop_id) ?? null : null, cortar((x) => x.vendedor_id === id), individuais.get(id) ?? null);
    })
    .filter((l) => temNumero(l) || escopo.agentesDisponiveis.some((v) => v.id === l.id))
    .sort((a, b) => b.vendas - a.vendas || b.vendasMes - a.vendasMes || a.nome.localeCompare(b.nome, "pt-BR"));
  const semAgente = linha("sem-agente", "Sem agente", null, cortar((x) => x.vendedor_id === null), null);
  if (temNumero(semAgente)) porAgente.push(semAgente);
  const agentesDoTime = porAgente.filter((l) => escopo.agentesDisponiveis.some((v) => v.id === l.id));
  const comVenda = agentesDoTime.filter((l) => l.vendas > 0).length;
  cartoes.splice(cartoes.findIndex((c) => c.chave === "perdidos"), 0, {
    chave: "agentes_com_venda",
    grupo: "produtividade",
    rotulo: "Agentes com venda na semana",
    valor: `${num(comVenda)} de ${num(agentesDoTime.length)}`,
    numero: comVenda,
    meta: null,
    contexto: agentesDoTime.length ? `${num(agentesDoTime.length - comVenda)} sem venda no trecho` : "nenhum agente no recorte",
    evolucao: null,
    status: "sem_meta",
  });

  // ---------- evolução das últimas semanas ----------
  const evolucaoSemanas: PontoSemana[] = semanasAte(semana, 8).map((s) => {
    const t: Trecho = { de: s.inicio, ate: s.fim <= hoje ? s.fim : hoje };
    const x = medir(recorte, t, t, trechoMes);
    return { inicio: s.inicio, rotulo: rotuloSemanaCurto(s), vendas: x.vendas, receita: x.receita, ativacoes: x.ativacoes, recebidos: x.recebidos, fechados: x.fechados, convertidos: x.convertidos, conversao: x.conversao, perdidos: x.perdidos, safraAtendidos: x.safra.atendidos, safraConvertidos: x.safra.convertidos, safraTaxa: x.safra.taxa };
  });

  // ---------- tickets que compõem a semana ----------
  const nomeAgente = (id: string | null) => (id ? porId.get(id)?.nome ?? null : null);
  const vistos = new Set<string>();
  const tickets: LinhaTicket[] = [];
  for (const t of [...m.fechadosSemana, ...m.recebidosLista]) {
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    const fechado = t.etapa === "fechado";
    tickets.push({
      id: t.id,
      cliente: t.cliente_nome,
      agente: nomeAgente(t.vendedor_id),
      unidade: t.pop_id ? nomePop.get(t.pop_id) ?? null : null,
      situacao: !fechado ? "aberto" : t.desfecho === "convertido" ? "convertido" : foraDaConversao(t) ? "fora" : "perdido",
      motivo: fechado && t.desfecho === "nao_convertido" ? t.motivos_nao_conversao?.nome ?? null : null,
      criadoEm: t.criado_em,
      fechadoEm: t.fechado_em,
      semLead: t.origem_criacao === "sgp_auto",
    });
  }
  tickets.sort((a, b) => ((b.fechadoEm ?? b.criadoEm) > (a.fechadoEm ?? a.criadoEm) ? 1 : -1));

  // ---------- avisos ----------
  const avisos: string[] = [];
  if (trechos.emAndamento) avisos.push(`Semana em andamento: a comparação usa segunda a ${NOMES_DIA[new Date(`${anterior.ate}T12:00:00Z`).getUTCDay()]} da semana anterior, e o farol de vendas considera os dias completos (até ontem).`);
  if (foraSemana + foraMes > 0) avisos.push(`Fora da conta de vendas, pela régua do Relatório da diretoria: ${num(foraSemana)} na semana e ${num(foraMes)} em ${mes.nome}, de Prefeitura e rede neutra, que o Dashboard soma.`);
  if (ativacaoAproximada)
    avisos.push(`Ativações: em ${num(ativNoDiaDaVenda)} de ${num(ativSemana.length)} contratos a data de ativação gravada é a mesma da venda. O cartão mostra vendas do trecho que já estão ativas, não instalações feitas no trecho, e o prazo da venda à ativação não é confiável.`);
  if (metaMes == null) avisos.push(`Sem meta de vendas cadastrada para ${mes.nome} neste recorte: os cartões de vendas ficam sem farol.`);
  if (convertidasSemLead > 0) avisos.push(`${num(convertidasSemLead)} das ${num(m.convertidos)} convertidas da semana vieram de venda lançada direto no SGP, sem atendimento no CRM. Elas entram na conversão do CRM e ficam fora da conversão por safra.`);

  return {
    hoje,
    semana,
    trechos,
    mes,
    cartoes,
    vendas: {
      semana: m.vendas,
      anterior: m.vendasAnterior,
      mes: m.vendasMes,
      metaMes,
      metaSemana,
      esperadoMes,
      atingimentoMes: metaMes ? percentualMeta(m.vendasMes, metaMes) : null,
      foraSemana,
      foraMes,
      semVendedorSemana: m.vSemana.filter((c) => c.vendedor_id === null).length,
    },
    ativacoes: {
      semana: ativSemana.length,
      anterior: mAnt.ativacoes,
      diasVendaAtivacao: tempoMedioVendaAtivacao(ativSemana),
      noDiaDaVenda: ativNoDiaDaVenda,
      receitaAtivada: receitaContratada(ativSemana),
      aguardando: aguardando.length,
      aguardandoRecentes,
      aguardandoDaSemana: aguardando.filter((i) => entre(i.contrato.data_venda, atual)).length,
      paradasMais7Dias: paradas,
      antigasAguardando,
      semAssinarDaSemana: semAssinarDaSemana.length,
      acima48hDaSemana: acima48h,
      antigasSemAssinar,
      instalacaoEfetiva,
    },
    conversao: {
      taxa: m.conversao,
      fechados: m.fechados,
      convertidos: m.convertidos,
      taxaAnterior: mAnt.conversao,
      recebidos: m.recebidos,
      recebidosAnterior: mAnt.recebidos,
      atendidos: m.atendidos,
      emNegociacao: m.emNegociacao,
      novosSemAtendimento: recorte.abertos.filter((t) => t.primeira_tratativa_em === null).length,
      foraDaConversao: naoConvertidos.fora.length,
      convertidasSemLead,
      safra: {
        leads: m.safra.leads,
        atendidos: m.safra.atendidos,
        convertidos: m.safra.convertidos,
        perdidos: m.safra.perdidos,
        emNegociacao: m.safra.emNegociacao,
        taxa: m.safra.taxa,
        taxaAnterior: mAnt.safra.taxa,
        semAtendimentoPrevio: m.safra.semAtendimentoPrevio,
        repetidos: m.safra.repetidos,
      },
    },
    receita: {
      semana: m.receita,
      anterior: mAnt.receita,
      mes: receitaContratada(vendasDoPeriodo(recorte.contratos, mes.de, fimMes)),
      ticket: m.ticket,
      ticketAnterior: mAnt.ticket,
      ticketMes: (() => {
        const vm = vendasDoPeriodo(recorte.contratos, mes.de, fimMes);
        return vm.length ? ticketMedio(vm) : null;
      })(),
    },
    perdas: {
      perdidos: m.perdidos,
      perdidosAnterior: mAnt.perdidos,
      motivos: listaMotivos,
      retornosVencidos,
      retornosHoje,
      retornosFuturos,
      retornosFeitosSemana,
      primeiraRespostaMin: tempoPrimeiraTratativa(m.recebidosLista),
    },
    porUnidade,
    porEquipe,
    porAgente,
    evolucao: evolucaoSemanas,
    tickets: tickets.slice(0, 300),
    avisos,
  };
}

function contarExpediente(t: Trecho, ehExpediente: (dia: string) => boolean): number {
  let n = 0;
  for (let d = t.de; d <= t.ate; d = somarDias(d, 1)) if (ehExpediente(d)) n++;
  return n;
}
