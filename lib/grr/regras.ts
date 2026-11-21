import { ALERTA_ATIVACAO_DIAS, ativacoesPendentes, type ContratoIndicador, osContaComoAguardando, osParaBaixar } from "@/lib/indicadores/regras";
import { LIMITES } from "@/lib/relatorio-semanal/placar";
import type { Status } from "@/lib/relatorio-semanal/tipos";
import { diasEntre, somarDias, type Semana } from "@/lib/relatorio-semanal/periodo";
import type { EscopoGrr, VendedorGrr } from "./escopo";

/**
 * Regras de COMPOSIÇÃO do GRR (funções puras, com teste). Nenhuma fórmula de
 * indicador mora aqui: as contas são as de lib/indicadores. O que fica aqui é
 * o que hoje vive dentro dos serviços das telas e não tem função própria:
 *  - a meta de cada recorte (decisão "Meta por unidade", 23/09/2026 — a mesma
 *    conta do Dashboard, da TV e do Relatório da diretoria);
 *  - a meta da semana e o farol pelo ritmo (limites do Relatório da diretoria);
 *  - quem aguarda instalação (D9: OS aberta no SGP ∪ regra 5.7);
 *  - a data de referência do ticket fechado (regra do painel do CRM).
 */

export type MetaLinha = { escopo: "global" | "pop" | "vendedora"; referencia_id: string | null; quantidade_vendas: number };

/**
 * Meta de vendas do mês para o recorte:
 *  - agentes (equipe ou agente): soma das metas individuais de quem está ativo;
 *  - unidade: a meta cadastrada da unidade ou, sem cadastro, a soma das metas
 *    dos agentes ativos da unidade, sem coordenadores;
 *  - empresa: a meta global cadastrada ou a soma das unidades.
 * Sem nenhuma meta, devolve null ("sem meta cadastrada").
 */
export function metaDoEscopo(
  metas: MetaLinha[],
  vendedores: Pick<VendedorGrr, "id" | "pop_id" | "ativo" | "eh_coordenador">[],
  pops: { id: string }[],
  escopo: Pick<EscopoGrr, "popId" | "vendedorIds">
): number | null {
  const ativos = vendedores.filter((v) => v.ativo);
  const popDoVendedor = new Map(ativos.map((v) => [v.id, v.pop_id]));
  const coordenadores = new Set(ativos.filter((v) => v.eh_coordenador).map((v) => v.id));
  const individuais = metas.filter((m) => m.escopo === "vendedora" && m.referencia_id !== null);

  if (escopo.vendedorIds) {
    const ids = new Set(escopo.vendedorIds);
    const soma = individuais
      .filter((m) => ids.has(m.referencia_id!) && popDoVendedor.has(m.referencia_id!))
      .reduce((s, m) => s + Number(m.quantidade_vendas), 0);
    return soma || null;
  }
  const somaDaUnidade = (popId: string) =>
    individuais
      .filter((m) => popDoVendedor.get(m.referencia_id!) === popId && !coordenadores.has(m.referencia_id!))
      .reduce((s, m) => s + Number(m.quantidade_vendas), 0);
  const metaDaUnidade = (popId: string): number => {
    const cadastrada = metas.find((m) => m.escopo === "pop" && m.referencia_id === popId);
    return cadastrada ? Number(cadastrada.quantidade_vendas) : somaDaUnidade(popId);
  };
  if (escopo.popId) return metaDaUnidade(escopo.popId) || null;
  const global = metas.find((m) => m.escopo === "global");
  if (global) return Number(global.quantidade_vendas);
  return pops.reduce((s, p) => s + metaDaUnidade(p.id), 0) || null;
}

/** meta do trecho = meta do mês ÷ dias de expediente do mês × dias de expediente do trecho */
export function metaDoTrecho(metaMes: number | null, diasExpedienteMes: number, diasExpedienteTrecho: number): number | null {
  if (metaMes == null || diasExpedienteMes <= 0) return null;
  return (metaMes * diasExpedienteTrecho) / diasExpedienteMes;
}

/** farol pelo ritmo (semana e mês aberto): ok no ritmo da meta; atenção a partir de 85% dele */
export function statusRitmo(realizado: number, esperado: number | null): Status {
  if (esperado == null || esperado <= 0) return "sem_meta";
  const ritmo = realizado / esperado;
  return ritmo >= 1 ? "ok" : ritmo >= LIMITES.ritmoAtencao ? "atencao" : "critico";
}

/** farol do mês fechado: ok a partir de 100% da meta; atenção a partir de 90% */
export function statusMesFechado(realizado: number, meta: number | null): Status {
  if (meta == null || meta <= 0) return "sem_meta";
  const at = realizado / meta;
  return at >= 1 ? "ok" : at >= LIMITES.mesAtencao ? "atencao" : "critico";
}

/** assinaturas da semana paradas há 48h ou mais: ok com 0, atenção até 3 */
export function statusAssinatura(acima48h: number): Status {
  return acima48h === 0 ? "ok" : acima48h <= LIMITES.assinaturaAtencao ? "atencao" : "critico";
}

/** instalações paradas há mais de 7 dias: atenção até 5; vendas antigas ainda aguardando também acendem atenção */
export function statusEsteira(paradasMais7Dias: number, antigasAguardando: number): Status {
  if (paradasMais7Dias > LIMITES.esteiraCritico) return "critico";
  return paradasMais7Dias > 0 || antigasAguardando > 0 ? "atencao" : "ok";
}

export type ItemAguardando<T> = { contrato: T; idadeDias: number };

/**
 * Quem aguarda instalação (D9): contratos com OS de instalação aberta no SGP
 * (idade desde a venda) ∪ assinados sem ativação pela regra 5.7.
 */
export function aguardandoInstalacao<T extends ContratoIndicador & { id: string }>(osAbertas: T[], pendencias: T[], hoje: string): ItemAguardando<T>[] {
  const itens = new Map<string, ItemAguardando<T>>();
  for (const c of osAbertas) {
    // contrato já em serviço com a OS aberta não espera instalação (OS para baixar)
    if (!osContaComoAguardando(c.status)) continue;
    itens.set(c.id, { contrato: c, idadeDias: diasEntre(c.data_venda, hoje) });
  }
  for (const p of ativacoesPendentes(pendencias, hoje)) {
    const c = p.contrato as T;
    if (!itens.has(c.id)) itens.set(c.id, { contrato: c, idadeDias: p.idadeDias });
  }
  return [...itens.values()];
}

/** OS de instalação aberta de contrato já em serviço (baixar no SGP), uma por contrato */
export function osAbertasParaBaixar<T extends ContratoIndicador & { id: string }>(osAbertas: T[]): T[] {
  const vistos = new Map<string, T>();
  for (const c of osAbertas) if (osParaBaixar(c.status) && !vistos.has(c.id)) vistos.set(c.id, c);
  return [...vistos.values()];
}

/** instalação parada: venda dos últimos 60 dias aguardando há mais de 7 dias */
export function paradaMais7Dias(item: ItemAguardando<ContratoIndicador>, hoje: string): boolean {
  return item.contrato.data_venda >= somarDias(hoje, -60) && item.idadeDias > ALERTA_ATIVACAO_DIAS;
}

/** dia (aaaa-mm-dd) de um instante, no fuso de Santarém (UTC−3 o ano todo) */
export function diaSantarem(iso: string): string {
  return new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Data em que o ticket fechado conta (regra do painel do CRM): a venda
 * convertida conta no dia da VENDA do contrato ligado; os demais, no dia do
 * fechamento. No GRR o dia é o de Santarém.
 */
export function dataRefTicket(t: { desfecho: string | null; fechado_em: string | null; data_venda_contrato: string | null }): string | null {
  if (t.desfecho === "convertido" && t.data_venda_contrato) return t.data_venda_contrato;
  return t.fechado_em ? diaSantarem(t.fechado_em) : null;
}

export type Trecho = { de: string; ate: string };

/**
 * Trechos de comparação da semana: semana completa compara com a anterior
 * completa; semana em andamento compara segunda até hoje com o MESMO trecho
 * da semana anterior (segunda até o mesmo dia da semana).
 */
export function trechosDaSemana(semana: Semana, hoje: string): { atual: Trecho; anterior: Trecho; emAndamento: boolean; dias: number } {
  const ate = semana.fim <= hoje ? semana.fim : hoje < semana.inicio ? semana.inicio : hoje;
  const dias = diasEntre(semana.inicio, ate) + 1;
  const inicioAnterior = somarDias(semana.inicio, -7);
  return {
    atual: { de: semana.inicio, ate },
    anterior: { de: inicioAnterior, ate: somarDias(inicioAnterior, dias - 1) },
    emAndamento: semana.fim > hoje,
    dias,
  };
}

export type Evolucao = { texto: string; direcao: "sobe" | "desce" | "neutro"; /** a mudança é boa? null = sem leitura */ bom: boolean | null };

/** variação para o cartão: a seta segue o número; `bom` diz se subir (ou cair) é bom */
export function evolucao(atual: number, anterior: number, opcoes: { menorEMelhor?: boolean } = {}): Evolucao {
  if (!anterior) return { texto: atual ? "sem base na semana anterior" : "igual à semana anterior", direcao: "neutro", bom: null };
  const d = (atual - anterior) / anterior;
  if (Math.abs(d) < 0.005) return { texto: "igual à semana anterior", direcao: "neutro", bom: null };
  return {
    texto: `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "acima" : "abaixo"} da semana anterior`,
    direcao: d > 0 ? "sobe" : "desce",
    bom: opcoes.menorEMelhor ? d < 0 : d > 0,
  };
}
