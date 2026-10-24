import "server-only";
import * as React from "react";
import { lerEstado } from "../config-servidor";
import type { EscopoPerformance } from "../escopo";
import type { PeriodoPerf } from "../periodo";
import type { BaseDados } from "./base";
import { calcularLinha, calcularTotais, indexar, ordenarRanking, type LinhaPerformance, type TotaisPerformance } from "./calcular";
import { carregarBase } from "./carregar";

const cache: <T extends (...a: never[]) => unknown>(fn: T) => T =
  (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

export type FiltrosPerformance = {
  popId?: string | null;
  setor?: string | null;
  vendedorId?: string | null;
  coordenadorId?: string | null;
};

export type CoberturaDados = {
  conversasNoPeriodo: number;
  conversasComLead: number;
  ultimaColeta: string | null;
  agentesSemVinculo: string[];
  analisesIa: number;
  iaHabilitada: boolean;
  followupsRegistrados: number;
  primeiroFollowup: string | null;
};

export type Apuracao = {
  periodo: PeriodoPerf;
  /** comparação contaminada por lacuna de coleta (ex.: robô parado) */
  avisoComparacao: string | null;
  linhas: LinhaPerformance[];
  anteriores: Map<string, LinhaPerformance>;
  totais: TotaisPerformance;
  totaisAnteriores: TotaisPerformance;
  cobertura: CoberturaDados;
  base: BaseDados;
  /**
   * Item (lead, conversa, análise) dentro do escopo e dos filtros. Sem dono
   * (sem vendedor) só no escopo total e sem filtro de pessoa — senão um
   * vendedor ou supervisor veria conversas/leads de outros.
   */
  noEscopo: (vendedorId: string | null | undefined, popId?: string | null) => boolean;
};

// cache em memória (60 s) da base carregada: trocar de aba não refaz a leitura.
// As ações do módulo chamam invalidarCachePerformance() depois de gravar.
const CACHE_MS = 60_000;
const cacheBase = new Map<string, { expira: number; base: Promise<BaseDados> }>();
export function invalidarCachePerformance() {
  cacheBase.clear();
}
function baseComCache(escopo: EscopoPerformance, periodo: PeriodoPerf): Promise<BaseDados> {
  const chave = JSON.stringify([escopo.vendedorIds, periodo.de, periodo.ate, periodo.deAnterior]);
  const agora = Date.now();
  for (const [k, v] of cacheBase) if (v.expira < agora) cacheBase.delete(k);
  const achado = cacheBase.get(chave);
  if (achado) return achado.base;
  const base = carregarBase(escopo, periodo);
  cacheBase.set(chave, { expira: agora + CACHE_MS, base });
  base.catch(() => cacheBase.delete(chave));
  return base;
}

/**
 * Apuração completa do período e do comparativo para o escopo do usuário
 * (24/10/2026). Uma leitura do banco por requisição (cache do React); todo
 * o cálculo é feito em memória por funções puras e testadas.
 */
export const apurarPerformance = cache(async (escopo: EscopoPerformance, periodo: PeriodoPerf, filtros: FiltrosPerformance = {}): Promise<Apuracao> => {
  const base = await baseComCache(escopo, periodo);
  const idx = indexar(base);
  const setores = filtros.setor ? [filtros.setor] : base.cfg.setores;
  const avaliados = base.vendedores.filter(
    (v) =>
      setores.includes(v.setor ?? "") &&
      (!filtros.popId || v.pop_id === filtros.popId) &&
      (!filtros.vendedorId || v.id === filtros.vendedorId) &&
      (!filtros.coordenadorId || v.coordenador_id === filtros.coordenadorId)
  );
  const temAtividade = (l: LinhaPerformance) =>
    l.vendedor.ativo || l.numeros.vendas > 0 || l.numeros.leadsRecebidos > 0 || l.numeros.conversasAtivas > 0 || l.numeros.leadsTrabalhados > 0;

  const linhas = ordenarRanking(avaliados.map((v) => calcularLinha(base, idx, v, periodo.de, periodo.ate)).filter(temAtividade));
  const anterioresLista = ordenarRanking(avaliados.map((v) => calcularLinha(base, idx, v, periodo.deAnterior, periodo.ateAnterior)));
  const anteriores = new Map(anterioresLista.map((l) => [l.vendedor.id, l]));

  const incluirSemDono = escopo.vendedorIds === null && !filtros.vendedorId && !filtros.coordenadorId && !filtros.setor;
  const idsLinhas = new Set(linhas.map((l) => l.vendedor.id));
  const noEscopo = (vendedorId: string | null | undefined, popId?: string | null) =>
    vendedorId ? idsLinhas.has(vendedorId) : incluirSemDono && (!filtros.popId || popId === filtros.popId);
  const totais = calcularTotais(base, idx, linhas, periodo.de, periodo.ate, { incluirSemDono, popId: filtros.popId });
  const totaisAnteriores = calcularTotais(base, idx, anterioresLista.filter(temAtividade), periodo.deAnterior, periodo.ateAnterior, { incluirSemDono, popId: filtros.popId });

  // lacuna de coleta: leads que nascem no chat por dia útil, período × comparativo
  const porDiaUtil = (de: string, ate: string) => {
    let n = 0;
    for (const t of base.tickets) {
      if (t.origem_criacao !== "sz_auto") continue;
      const d = new Date(Date.parse(t.criado_em) - 3 * 3_600_000).toISOString().slice(0, 10);
      if (d >= de && d <= ate) n++;
    }
    let dias = 0;
    for (let d = de; d <= ate; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) if (base.ehDiaUtil(d)) dias++;
    return dias ? n / dias : 0;
  };
  const rAtual = porDiaUtil(periodo.de, periodo.ate);
  const rAnt = porDiaUtil(periodo.deAnterior, periodo.ateAnterior);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const avisoComparacao =
    (rAtual >= 2 && rAnt < rAtual * 0.4) || (rAnt >= 2 && rAtual < rAnt * 0.4)
      ? `A criação automática de leads pelo chat teve volumes muito diferentes nos dois períodos (${fmt(rAtual)} por dia útil agora contra ${fmt(rAnt)} no comparativo). Variações de leads e de conversão podem refletir falha de coleta (ex.: robô do chat parado), não desempenho.`
      : null;

  const estado = await lerEstado<{ ultimaExecucao?: string; agentesSemVinculo?: string[] }>("performance_estado_coleta");
  const [deMs, ateMs] = [Date.parse(`${periodo.de}T00:00:00-03:00`), Date.parse(`${periodo.ate}T23:59:59.999-03:00`)];
  const conversasPeriodo = base.conversas.filter((c) => c.finalizada_em && Date.parse(c.finalizada_em) >= deMs && Date.parse(c.finalizada_em) <= ateMs);
  const fuOrdenados = [...base.followups].sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em));
  return {
    periodo,
    avisoComparacao,
    linhas,
    anteriores,
    totais,
    totaisAnteriores,
    cobertura: {
      conversasNoPeriodo: conversasPeriodo.length,
      conversasComLead: conversasPeriodo.filter((c) => c.ticket_id).length,
      ultimaColeta: estado.ultimaExecucao ?? null,
      agentesSemVinculo: estado.agentesSemVinculo ?? [],
      analisesIa: base.analises.filter((a) => Date.parse(a.concluido_em) >= deMs && Date.parse(a.concluido_em) <= ateMs).length,
      iaHabilitada: base.cfg.ia.habilitada,
      followupsRegistrados: base.followups.length,
      primeiroFollowup: fuOrdenados[0]?.criado_em ?? null,
    },
    base,
    noEscopo,
  };
});
