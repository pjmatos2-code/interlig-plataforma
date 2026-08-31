/**
 * Regras de comissão da refidelização — sem dependência de servidor, para o
 * painel (client) e a visão da agente usarem os mesmos números.
 */

export const META_REFIDELIZACAO = 150;

export const FAIXAS_REFIDELIZACAO = [
  { nome: "MÍNIMA", min: 80, pct: 3.5 },
  { nome: "SUPERAÇÃO", min: 101, pct: 4.0 },
  { nome: "ALTA", min: 121, pct: 5.0 },
  { nome: "DESAFIO", min: 167, pct: 7.0 }, // 250 planos sobre a meta de 150
] as const;

export function faixaDe(atingimentoPct: number) {
  const p = Math.round(atingimentoPct);
  return [...FAIXAS_REFIDELIZACAO].reverse().find((f) => p >= f.min) ?? null;
}
