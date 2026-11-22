import type { Status } from "@/lib/relatorio-semanal/tipos";
import type { Semana } from "@/lib/relatorio-semanal/periodo";
import { num, pct } from "@/lib/relatorio-semanal/formato";
import { metaVigente, statusPorFaixa, type ChaveEscopo, type MetaGrr } from "../config";
import { evolucao, metaDoTrecho, type Evolucao } from "../regras";
import { INDICADORES_TECNICO, UNIDADES_TECNICO, type GrupoTecnico, type IndicadorTecnico, type UnidadeTecnico } from "./catalogo";

/**
 * Contas do GRR Técnico (Etapa 1, 21/11/2026). Funções puras: recebem a base
 * já lida do espelho do SGP (lib/grr/tecnico/dados.ts) e devolvem os cartões
 * de um recorte (empresa ou unidade) numa semana.
 */

const HORA = 3_600_000;
const DIA = 24 * HORA;

export type BaseTecnico = {
  /** contratos ativados (dia da ativação) desde a segunda da semana anterior */
  ativacoes: { dia: string; unidade: UnidadeTecnico | null }[];
  /** instalações ativadas no mesmo intervalo; direcionadaEm null = sem a hora do direcionamento */
  instalacoes: { unidade: UnidadeTecnico | null; diaAtivacao: string; ativadoEm: string | null; direcionadaEm: string | null }[];
  /**
   * Serviços de suporte feitos no intervalo, com a abertura da ocorrência.
   * atendidaEm = check-in do técnico no local (sem check-in, a baixa da OS):
   * a baixa no SGP é feita depois, por outra pessoa (decisão de 21/11/2026).
   */
  suporte: { unidade: UnidadeTecnico | null; abertaEm: string; atendidaEm: string; corporativo: boolean }[];
  /** mudanças de endereço feitas no intervalo (atendidaEm como no suporte) */
  mudancas: { unidade: UnidadeTecnico | null; abertaEm: string; agendamento: string | null; atendidaEm: string }[];
  /** serviços de campo feitos desde a segunda de duas semanas atrás, com o retorno em 7 dias */
  servicos: { unidade: UnidadeTecnico | null; atendidaEm: string; retornou: boolean }[];
  /** estoques medidos agora (null em semana antiga: o número só existe na foto do fechamento) */
  estoques: { agendamentosVencidos: Contagem; faltaValidar: Contagem; osParaBaixar: Contagem; medidoEm: string } | null;
  /** OS de instalação (uma por contrato, a primeira) criadas desde 9 semanas antes, com a ativação e o cancelamento do contrato */
  osInstalacao?: { unidade: UnidadeTecnico | null; criadaDia: string; ativacaoDia: string | null; cancelamentoDia: string | null; assinaturaDia?: string | null }[];
  /** OS de campo agendadas desde a segunda da semana anterior, com o técnico designado (agenda cumprida) */
  agendadas?: { unidade: UnidadeTecnico | null; tecnico: string | null; agendamento: string; checkin: string | null; status: string | null }[];
};
export type Contagem = Partial<Record<UnidadeTecnico, number>>;

export type CartaoTecnico = {
  chave: string;
  grupo: GrupoTecnico;
  rotulo: string;
  valor: string;
  numero: number | null;
  meta: string | null;
  metaNumero: number | null;
  contexto: string | null;
  evolucao: Evolucao | null;
  status: Status;
  calculo: string;
};

export type SituacaoAgenda = "cumprida" | "atrasada" | "sem_registro" | "a_vencer";

/**
 * Agenda cumprida (decisão de 21/11/2026): a OS agendada conta como cumprida
 * quando o técnico fez check-in até o fim do dia marcado. Atrasada: chegou em
 * dia posterior, ficou pendente, ou o dia passou sem check-in com a OS aberta.
 * Encerrada sem check-in não dá para avaliar (falha de registro). OS de hoje
 * ou futura sem check-in ainda não venceu.
 */
export function situacaoAgenda(os: { agendamento: string; checkin: string | null; status: string | null }, hoje: string): SituacaoAgenda {
  const diaAg = diaSantarem(os.agendamento);
  if (/pendente/i.test(os.status ?? "")) return "atrasada";
  if (os.checkin) return diaSantarem(os.checkin) <= diaAg ? "cumprida" : "atrasada";
  if (/encerrad/i.test(os.status ?? "")) return "sem_registro";
  return diaAg < hoje ? "atrasada" : "a_vencer";
}

export type LinhaAgendaTecnico = { tecnico: string; agendadas: number; cumpridas: number; atrasadas: number; semRegistro: number; taxa: number | null; status: Status };
/** técnico com menos de 10 OS avaliadas na semana fica sem farol (amostra pequena) */
export const MINIMO_FAROL_TECNICO = 10;

/** semanas de turmas que contam para os clientes deixados para trás */
export const SEMANAS_TURMAS = 8;
/** pendentes = deixados pelo técnico (contrato assinado); aguardandoAssinatura = com o comercial (decisão de 21/11/2026) */
export type TurmaInstalacao = { inicio: string; criadas: number; ativadas: number; canceladas: number; pendentes: number; aguardandoAssinatura?: number };

/** a OS já estava apta para o técnico (contrato assinado) no fim do período? Sem a informação (fotos antigas), conta como apta. */
const apta = (o: { assinaturaDia?: string | null }, ate: string) => o.assinaturaDia === undefined || (o.assinaturaDia !== null && o.assinaturaDia <= ate);

export type RecorteTecnico = { tipo: "empresa" | "unidade"; unidade: UnidadeTecnico | null; chave: ChaveEscopo; rotulo: string };

const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** dia (aaaa-mm-dd) em Santarém */
export const diaSantarem = (iso: string) => new Date(Date.parse(iso) - 3 * HORA).toISOString().slice(0, 10);
const entre = (dia: string, de: string, ate: string) => dia >= de && dia <= ate;

/** instalação no prazo: até 48 h do direcionamento; sem a hora da ativação (antes de 21/11/2026), até 2 dias pelo calendário */
export function instalacaoNoPrazo(i: { diaAtivacao: string; ativadoEm: string | null; direcionadaEm: string }): boolean {
  if (i.ativadoEm) return Date.parse(i.ativadoEm) - Date.parse(i.direcionadaEm) <= 48 * HORA;
  const dias = (Date.parse(`${i.diaAtivacao}T12:00:00Z`) - Date.parse(`${diaSantarem(i.direcionadaEm)}T12:00:00Z`)) / DIA;
  return dias <= 2;
}

/** mudança no prazo: técnico no local até 24 h depois da data agendada (sem agendamento, da abertura) */
export function mudancaNoPrazo(m: { abertaEm: string; agendamento: string | null; atendidaEm: string }): boolean {
  return Date.parse(m.atendidaEm) - Date.parse(m.agendamento ?? m.abertaEm) <= 24 * HORA;
}

const taxa = (ok: number, n: number) => (n > 0 ? ok / n : null);
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const horasTxt = (h: number | null) => (h == null ? "—" : h < 10 ? `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h` : `${Math.round(h)} h`);

export type TrechoTecnico = { de: string; ate: string };

/** semana atual (até hoje) e a semana anterior com o mesmo número de dias */
export function trechosTecnico(semana: Semana, hoje: string): { atual: TrechoTecnico; anterior: TrechoTecnico; emAndamento: boolean } {
  const ate = semana.fim <= hoje ? semana.fim : hoje;
  const dias = Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${semana.inicio}T12:00:00Z`)) / DIA);
  const ini = somarDias(semana.inicio, -7);
  return { atual: { de: semana.inicio, ate }, anterior: { de: ini, ate: somarDias(ini, dias) }, emAndamento: semana.fim > hoje };
}

type Medidas = {
  instalacoes: number;
  inst48: { ok: number; n: number; semHora: number };
  suporte: { ok: number; n: number; medianaH: number | null };
  corporativo: { ok: number; n: number };
  mudanca: { ok: number; n: number };
  retorno: { voltou: number; n: number };
  agenda: { cumpridas: number; atrasadas: number; semRegistro: number };
  osCriadas: number;
  osInstaladas: number;
  deixados: number;
  porUnidade: Contagem;
};

function medir(base: BaseTecnico, t: TrechoTecnico, un: UnidadeTecnico | null, hoje: string): Medidas {
  const daUn = (u: UnidadeTecnico | null) => un == null || u === un;
  const noTrecho = (iso: string) => entre(diaSantarem(iso), t.de, t.ate);
  const ativ = base.ativacoes.filter((a) => daUn(a.unidade) && entre(a.dia, t.de, t.ate));
  const porUnidade: Contagem = {};
  for (const a of ativ) if (a.unidade) porUnidade[a.unidade] = (porUnidade[a.unidade] ?? 0) + 1;
  const inst = base.instalacoes.filter((i) => daUn(i.unidade) && entre(i.diaAtivacao, t.de, t.ate));
  const comHora = inst.filter((i): i is typeof i & { direcionadaEm: string } => Boolean(i.direcionadaEm));
  const sup = base.suporte.filter((s) => daUn(s.unidade) && noTrecho(s.atendidaEm));
  const corp = sup.filter((s) => s.corporativo);
  const dentro = (s: { abertaEm: string; atendidaEm: string }, h: number) => Date.parse(s.atendidaEm) - Date.parse(s.abertaEm) <= h * HORA;
  const mud = base.mudancas.filter((m) => daUn(m.unidade) && noTrecho(m.atendidaEm));
  // retorno: serviços encerrados na semana anterior ao trecho (já com os 7 dias completos)
  const de7 = somarDias(t.de, -7);
  const ate7 = somarDias(t.ate, -7);
  const serv = base.servicos.filter((s) => daUn(s.unidade) && entre(diaSantarem(s.atendidaEm), de7, ate7));
  const osDaUn = (base.osInstalacao ?? []).filter((o) => daUn(o.unidade));
  const daSemana = osDaUn.filter((o) => entre(o.criadaDia, t.de, t.ate));
  const osCriadas = daSemana.length;
  // a mesma OS: o contrato do cliente da OS ativado até o fim do período (decisão de 21/11/2026)
  const osInstaladas = daSemana.filter((o) => o.ativacaoDia && o.ativacaoDia <= t.ate).length;
  // o técnico responde só pelos clientes já aptos (contrato assinado); os que esperam assinatura vão para o comercial
  const deixados = osDaUn.filter((o) => entre(o.criadaDia, somarDias(t.de, -7 * SEMANAS_TURMAS), somarDias(t.de, -1)) && !(o.ativacaoDia && o.ativacaoDia <= t.ate) && !(o.cancelamentoDia && o.cancelamentoDia <= t.ate) && apta(o, t.ate)).length;
  const ag = (base.agendadas ?? []).filter((x) => daUn(x.unidade) && entre(diaSantarem(x.agendamento), t.de, t.ate)).map((x) => situacaoAgenda(x, hoje));
  return {
    instalacoes: ativ.length,
    inst48: { ok: comHora.filter(instalacaoNoPrazo).length, n: comHora.length, semHora: inst.length - comHora.length },
    suporte: { ok: sup.filter((s) => dentro(s, 24)).length, n: sup.length, medianaH: mediana(sup.map((s) => (Date.parse(s.atendidaEm) - Date.parse(s.abertaEm)) / HORA)) },
    corporativo: { ok: corp.filter((s) => dentro(s, 4)).length, n: corp.length },
    mudanca: { ok: mud.filter(mudancaNoPrazo).length, n: mud.length },
    retorno: { voltou: serv.filter((s) => s.retornou).length, n: serv.length },
    osCriadas,
    osInstaladas,
    deixados,
    agenda: { cumpridas: ag.filter((x) => x === "cumprida").length, atrasadas: ag.filter((x) => x === "atrasada").length, semRegistro: ag.filter((x) => x === "sem_registro").length },
    porUnidade,
  };
}

/** variação em pontos percentuais entre duas taxas */
function evolucaoPp(a: number | null, b: number | null, menorEMelhor = false): Evolucao | null {
  if (a == null || b == null) return null;
  const d = Math.round((a - b) * 100);
  if (d === 0) return { texto: "igual à semana anterior", direcao: "neutro", bom: null };
  return { texto: `${Math.abs(d)} p.p. ${d > 0 ? "acima" : "abaixo"} da semana anterior`, direcao: d > 0 ? "sobe" : "desce", bom: menorEMelhor ? d < 0 : d > 0 };
}

const somaContagem = (c: Contagem, un: UnidadeTecnico | null) => (un ? c[un] ?? 0 : UNIDADES_TECNICO.reduce((s, u) => s + (c[u] ?? 0), 0));
const siglas: Record<UnidadeTecnico, string> = { Altamira: "ATM", "Vitória do Xingu": "VTX", "Brasil Novo": "BN" };
const porUnidadeTxt = (c: Contagem) => UNIDADES_TECNICO.map((u) => `${siglas[u]} ${num(c[u] ?? 0)}`).join(" · ");

export type ParametrosMontagem = {
  base: BaseTecnico;
  semana: Semana;
  hoje: string;
  recorte: RecorteTecnico;
  metas: MetaGrr[];
  /** dias de expediente do mês da semana e da semana (inteira e até hoje), para a meta mensal */
  expediente: { mes: number; semana: number; ateHoje: number };
};

/** os cartões do GRR Técnico num recorte e numa semana */
export function montarTecnico(p: ParametrosMontagem): { cartoes: CartaoTecnico[]; emAndamento: boolean; trecho: TrechoTecnico; porTecnico: LinhaAgendaTecnico[]; turmas: TurmaInstalacao[] } {
  const { base, semana, hoje, recorte, metas, expediente } = p;
  const tr = trechosTecnico(semana, hoje);
  const un = recorte.unidade;
  const m = medir(base, tr.atual, un, hoje);
  // a semana anterior já passou inteira: nenhuma OS dela está "a vencer"
  const a = medir(base, tr.anterior, un, tr.atual.de);
  const rotuloTrecho = tr.emAndamento ? `até ${tr.atual.ate.slice(8, 10)}/${tr.atual.ate.slice(5, 7)}` : "semana completa";

  const def = (chave: string) => INDICADORES_TECNICO.find((i) => i.chave === chave)!;
  const faixa = (d: IndicadorTecnico, valor: number | null): { meta: string | null; metaNumero: number | null; status: Status } => {
    const linha = metaVigente(metas, d, recorte.chave, semana.inicio);
    if (!linha || linha.meta == null || linha.limite_atencao == null) return { meta: null, metaNumero: null, status: "sem_meta" };
    if (d.metaMensal) {
      const metaSemana = metaDoTrecho(linha.meta, expediente.mes, expediente.semana);
      const metaAteHoje = metaDoTrecho(linha.meta, expediente.mes, tr.emAndamento ? expediente.ateHoje : expediente.semana);
      const limiteAteHoje = metaDoTrecho(linha.limite_atencao, expediente.mes, tr.emAndamento ? expediente.ateHoje : expediente.semana);
      if (metaSemana == null || metaAteHoje == null || limiteAteHoje == null) return { meta: null, metaNumero: null, status: "sem_meta" };
      return {
        meta: `meta ${num(Math.round(metaSemana))} na semana${tr.emAndamento ? ` · ${num(Math.round(metaAteHoje))} até hoje` : ""}`,
        metaNumero: Math.round(metaSemana),
        status: statusPorFaixa(valor, metaAteHoje, limiteAteHoje, d.polaridade),
      };
    }
    const txt = d.unidade === "percentual" ? pct(linha.meta) : num(linha.meta);
    return { meta: `meta ${d.polaridade === "menor_melhor" ? "até " : ""}${txt}`, metaNumero: linha.meta, status: statusPorFaixa(valor, linha.meta, linha.limite_atencao, d.polaridade) };
  };
  const cartao = (chave: string, valor: number | null, contexto: string | null, ev: Evolucao | null): CartaoTecnico => {
    const d = def(chave);
    return {
      chave,
      grupo: d.grupo,
      rotulo: d.nome,
      valor: valor == null ? "—" : d.unidade === "percentual" ? pct(valor) : num(valor),
      numero: valor,
      ...faixa(d, valor),
      contexto,
      evolucao: ev,
      calculo: d.calculo,
    };
  };

  const t48 = taxa(m.inst48.ok, m.inst48.n);
  const tSup = taxa(m.suporte.ok, m.suporte.n);
  const tCorp = taxa(m.corporativo.ok, m.corporativo.n);
  const tMud = taxa(m.mudanca.ok, m.mudanca.n);
  const tRet = taxa(m.retorno.voltou, m.retorno.n);
  const est = base.estoques;
  const estTxt = est ? `medido em ${est.medidoEm}` : "só existe na foto do fechamento de segunda";

  const cartoes: CartaoTecnico[] = [
    cartao("tec_instalacoes", m.instalacoes, `${un ? "" : `${porUnidadeTxt(m.porUnidade)} · `}${rotuloTrecho}`, evolucao(m.instalacoes, a.instalacoes)),
    cartao(
      "tec_instalacoes_vs_os",
      taxa(m.osInstaladas, m.osCriadas),
      m.osCriadas ? `${num(m.osInstaladas)} de ${num(m.osCriadas)} OS de instalação criadas na semana já instaladas · ${num(m.osCriadas - m.osInstaladas)} ficaram · ${rotuloTrecho}` : "nenhuma OS de instalação criada no período",
      evolucaoPp(taxa(m.osInstaladas, m.osCriadas), taxa(a.osInstaladas, a.osCriadas))
    ),
    cartao("tec_deixados_para_tras", m.deixados, `Clientes já aptos (contrato assinado) das ${SEMANAS_TURMAS} semanas anteriores ainda sem ativação · os que esperam assinatura ficam com o comercial`, evolucao(m.deixados, a.deixados, { menorEMelhor: true })),
    cartao(
      "tec_instalacao_48h",
      t48,
      m.inst48.n || m.inst48.semHora ? `${num(m.inst48.ok)} de ${num(m.inst48.n)} instalações${m.inst48.semHora ? ` · ${num(m.inst48.semHora)} sem a hora do direcionamento, fora da conta` : ""}` : "nenhuma instalação no período",
      evolucaoPp(t48, taxa(a.inst48.ok, a.inst48.n))
    ),
    cartao("tec_suporte_24h", tSup, m.suporte.n ? `${num(m.suporte.ok)} de ${num(m.suporte.n)} OS · metade em até ${horasTxt(m.suporte.medianaH)}` : "nenhuma OS de suporte encerrada", evolucaoPp(tSup, taxa(a.suporte.ok, a.suporte.n))),
    cartao("tec_corporativo_4h", tCorp, m.corporativo.n ? `${num(m.corporativo.ok)} de ${num(m.corporativo.n)} OS corporativas` : "nenhuma OS corporativa encerrada", evolucaoPp(tCorp, taxa(a.corporativo.ok, a.corporativo.n))),
    cartao(
      "tec_agenda_no_dia",
      taxa(m.agenda.cumpridas, m.agenda.cumpridas + m.agenda.atrasadas),
      m.agenda.cumpridas + m.agenda.atrasadas
        ? `${num(m.agenda.cumpridas)} de ${num(m.agenda.cumpridas + m.agenda.atrasadas)} OS no dia marcado · ${num(m.agenda.atrasadas)} atrasada${m.agenda.atrasadas === 1 ? "" : "s"}${m.agenda.semRegistro ? ` · ${num(m.agenda.semRegistro)} encerrada${m.agenda.semRegistro === 1 ? "" : "s"} sem check-in` : ""}`
        : "nenhuma OS agendada vencida no período",
      evolucaoPp(taxa(m.agenda.cumpridas, m.agenda.cumpridas + m.agenda.atrasadas), taxa(a.agenda.cumpridas, a.agenda.cumpridas + a.agenda.atrasadas))
    ),
    cartao("tec_mudanca_24h", tMud, m.mudanca.n ? `${num(m.mudanca.ok)} de ${num(m.mudanca.n)} mudanças` : "nenhuma mudança encerrada", evolucaoPp(tMud, taxa(a.mudanca.ok, a.mudanca.n))),
    cartao("tec_retorno_7d", tRet, m.retorno.n ? `${num(m.retorno.voltou)} de ${num(m.retorno.n)} serviços da semana anterior voltaram` : "sem serviços na semana anterior", evolucaoPp(tRet, taxa(a.retorno.voltou, a.retorno.n), true)),
    cartao("tec_agendamentos_vencidos", est ? somaContagem(est.agendamentosVencidos, un) : null, `${!un && est ? `${porUnidadeTxt(est.agendamentosVencidos)} · ` : ""}${estTxt}`, null),
    cartao("tec_falta_validar", est ? somaContagem(est.faltaValidar, un) : null, `${!un && est ? `${porUnidadeTxt(est.faltaValidar)} · ` : ""}${estTxt}`, null),
    cartao("tec_os_para_baixar", est ? somaContagem(est.osParaBaixar, un) : null, `${!un && est ? `${porUnidadeTxt(est.osParaBaixar)} · ` : ""}${estTxt}`, null),
  ];
  // agenda por técnico (apresentação da reunião de terça): mesma régua, sem farol abaixo de 10 OS
  const metaAgenda = metaVigente(metas, def("tec_agenda_no_dia"), recorte.chave, semana.inicio);
  const porNome = new Map<string, LinhaAgendaTecnico>();
  for (const x of base.agendadas ?? []) {
    if ((un && x.unidade !== un) || !entre(diaSantarem(x.agendamento), tr.atual.de, tr.atual.ate)) continue;
    const sit = situacaoAgenda(x, hoje);
    if (sit === "a_vencer") continue;
    const nome = x.tecnico?.trim() || "Sem técnico designado";
    const l = porNome.get(nome) ?? { tecnico: nome, agendadas: 0, cumpridas: 0, atrasadas: 0, semRegistro: 0, taxa: null, status: "sem_meta" as Status };
    l.agendadas++;
    if (sit === "cumprida") l.cumpridas++;
    else if (sit === "atrasada") l.atrasadas++;
    else l.semRegistro++;
    porNome.set(nome, l);
  }
  const porTecnico = [...porNome.values()]
    .map((l) => {
      const avaliadas = l.cumpridas + l.atrasadas;
      const tx = avaliadas ? l.cumpridas / avaliadas : null;
      const status: Status = metaAgenda && metaAgenda.meta != null && metaAgenda.limite_atencao != null && avaliadas >= MINIMO_FAROL_TECNICO ? statusPorFaixa(tx, metaAgenda.meta, metaAgenda.limite_atencao, "maior_melhor") : "sem_meta";
      return { ...l, taxa: tx, status };
    })
    .sort((x, y) => y.atrasadas - x.atrasadas || (x.taxa ?? 1) - (y.taxa ?? 1) || x.tecnico.localeCompare(y.tecnico));
  // turmas de instalação: a semana atual e as 8 anteriores, com o que ficou para trás até o fim do período
  const turmas: TurmaInstalacao[] = [];
  for (let i = SEMANAS_TURMAS; i >= 0; i--) {
    const ini = somarDias(semana.inicio, -7 * i);
    const fim = somarDias(ini, 6);
    const daTurma = (base.osInstalacao ?? []).filter((o) => (!un || o.unidade === un) && entre(o.criadaDia, ini, fim < tr.atual.ate ? fim : tr.atual.ate));
    const ativadas = daTurma.filter((o) => o.ativacaoDia && o.ativacaoDia <= tr.atual.ate).length;
    const canceladas = daTurma.filter((o) => !(o.ativacaoDia && o.ativacaoDia <= tr.atual.ate) && o.cancelamentoDia && o.cancelamentoDia <= tr.atual.ate).length;
    const abertas = daTurma.filter((o) => !(o.ativacaoDia && o.ativacaoDia <= tr.atual.ate) && !(o.cancelamentoDia && o.cancelamentoDia <= tr.atual.ate));
    const semAssinatura = abertas.filter((o) => !apta(o, tr.atual.ate)).length;
    turmas.push({ inicio: ini, criadas: daTurma.length, ativadas, canceladas, pendentes: abertas.length - semAssinatura, aguardandoAssinatura: semAssinatura });
  }
  return { cartoes, emAndamento: tr.emAndamento, trecho: tr.atual, porTecnico, turmas };
}
