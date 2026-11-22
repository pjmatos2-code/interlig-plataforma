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
  /** OS de suporte encerradas no intervalo, com a abertura da ocorrência */
  suporte: { unidade: UnidadeTecnico | null; abertaEm: string; encerradaEm: string; corporativo: boolean }[];
  /** OS de mudança de endereço encerradas no intervalo */
  mudancas: { unidade: UnidadeTecnico | null; abertaEm: string; agendamento: string | null; encerradaEm: string }[];
  /** serviços de campo encerrados desde a segunda de duas semanas atrás, com o retorno em 7 dias */
  servicos: { unidade: UnidadeTecnico | null; encerradaEm: string; retornou: boolean }[];
  /** estoques medidos agora (null em semana antiga: o número só existe na foto do fechamento) */
  estoques: { agendamentosVencidos: Contagem; faltaValidar: Contagem; osParaBaixar: Contagem; medidoEm: string } | null;
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

/** mudança no prazo: OS encerrada até 24 h depois da data agendada (sem agendamento, da abertura) */
export function mudancaNoPrazo(m: { abertaEm: string; agendamento: string | null; encerradaEm: string }): boolean {
  return Date.parse(m.encerradaEm) - Date.parse(m.agendamento ?? m.abertaEm) <= 24 * HORA;
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
  porUnidade: Contagem;
};

function medir(base: BaseTecnico, t: TrechoTecnico, un: UnidadeTecnico | null): Medidas {
  const daUn = (u: UnidadeTecnico | null) => un == null || u === un;
  const noTrecho = (iso: string) => entre(diaSantarem(iso), t.de, t.ate);
  const ativ = base.ativacoes.filter((a) => daUn(a.unidade) && entre(a.dia, t.de, t.ate));
  const porUnidade: Contagem = {};
  for (const a of ativ) if (a.unidade) porUnidade[a.unidade] = (porUnidade[a.unidade] ?? 0) + 1;
  const inst = base.instalacoes.filter((i) => daUn(i.unidade) && entre(i.diaAtivacao, t.de, t.ate));
  const comHora = inst.filter((i): i is typeof i & { direcionadaEm: string } => Boolean(i.direcionadaEm));
  const sup = base.suporte.filter((s) => daUn(s.unidade) && noTrecho(s.encerradaEm));
  const corp = sup.filter((s) => s.corporativo);
  const dentro = (s: { abertaEm: string; encerradaEm: string }, h: number) => Date.parse(s.encerradaEm) - Date.parse(s.abertaEm) <= h * HORA;
  const mud = base.mudancas.filter((m) => daUn(m.unidade) && noTrecho(m.encerradaEm));
  // retorno: serviços encerrados na semana anterior ao trecho (já com os 7 dias completos)
  const de7 = somarDias(t.de, -7);
  const ate7 = somarDias(t.ate, -7);
  const serv = base.servicos.filter((s) => daUn(s.unidade) && entre(diaSantarem(s.encerradaEm), de7, ate7));
  return {
    instalacoes: ativ.length,
    inst48: { ok: comHora.filter(instalacaoNoPrazo).length, n: comHora.length, semHora: inst.length - comHora.length },
    suporte: { ok: sup.filter((s) => dentro(s, 24)).length, n: sup.length, medianaH: mediana(sup.map((s) => (Date.parse(s.encerradaEm) - Date.parse(s.abertaEm)) / HORA)) },
    corporativo: { ok: corp.filter((s) => dentro(s, 4)).length, n: corp.length },
    mudanca: { ok: mud.filter(mudancaNoPrazo).length, n: mud.length },
    retorno: { voltou: serv.filter((s) => s.retornou).length, n: serv.length },
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
export function montarTecnico(p: ParametrosMontagem): { cartoes: CartaoTecnico[]; emAndamento: boolean; trecho: TrechoTecnico } {
  const { base, semana, hoje, recorte, metas, expediente } = p;
  const tr = trechosTecnico(semana, hoje);
  const un = recorte.unidade;
  const m = medir(base, tr.atual, un);
  const a = medir(base, tr.anterior, un);
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
      "tec_instalacao_48h",
      t48,
      m.inst48.n || m.inst48.semHora ? `${num(m.inst48.ok)} de ${num(m.inst48.n)} instalações${m.inst48.semHora ? ` · ${num(m.inst48.semHora)} sem a hora do direcionamento, fora da conta` : ""}` : "nenhuma instalação no período",
      evolucaoPp(t48, taxa(a.inst48.ok, a.inst48.n))
    ),
    cartao("tec_suporte_24h", tSup, m.suporte.n ? `${num(m.suporte.ok)} de ${num(m.suporte.n)} OS · metade em até ${horasTxt(m.suporte.medianaH)}` : "nenhuma OS de suporte encerrada", evolucaoPp(tSup, taxa(a.suporte.ok, a.suporte.n))),
    cartao("tec_corporativo_4h", tCorp, m.corporativo.n ? `${num(m.corporativo.ok)} de ${num(m.corporativo.n)} OS corporativas` : "nenhuma OS corporativa encerrada", evolucaoPp(tCorp, taxa(a.corporativo.ok, a.corporativo.n))),
    cartao("tec_mudanca_24h", tMud, m.mudanca.n ? `${num(m.mudanca.ok)} de ${num(m.mudanca.n)} mudanças` : "nenhuma mudança encerrada", evolucaoPp(tMud, taxa(a.mudanca.ok, a.mudanca.n))),
    cartao("tec_retorno_7d", tRet, m.retorno.n ? `${num(m.retorno.voltou)} de ${num(m.retorno.n)} serviços da semana anterior voltaram` : "sem serviços na semana anterior", evolucaoPp(tRet, taxa(a.retorno.voltou, a.retorno.n), true)),
    cartao("tec_agendamentos_vencidos", est ? somaContagem(est.agendamentosVencidos, un) : null, `${!un && est ? `${porUnidadeTxt(est.agendamentosVencidos)} · ` : ""}${estTxt}`, null),
    cartao("tec_falta_validar", est ? somaContagem(est.faltaValidar, un) : null, `${!un && est ? `${porUnidadeTxt(est.faltaValidar)} · ` : ""}${estTxt}`, null),
    cartao("tec_os_para_baixar", est ? somaContagem(est.osParaBaixar, un) : null, `${!un && est ? `${porUnidadeTxt(est.osParaBaixar)} · ` : ""}${estTxt}`, null),
  ];
  return { cartoes, emAndamento: tr.emAndamento, trecho: tr.atual };
}
