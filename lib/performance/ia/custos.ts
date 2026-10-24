/**
 * Custo estimado das análises (24/10/2026) — preços públicos por milhão de
 * tokens (USD), tabela da documentação oficial em 06/10/2026. Modelo fora
 * da tabela usa o preço mais alto conhecido (estimativa conservadora).
 */
const PRECOS: { prefixo: string; entrada: number; saida: number }[] = [
  { prefixo: "claude-haiku-5-5", entrada: 0.1, saida: 0.5 },
  { prefixo: "claude-haiku-4-5", entrada: 1, saida: 5 },
  { prefixo: "claude-sonnet-5-5", entrada: 2, saida: 10 },
  { prefixo: "claude-sonnet-5", entrada: 2, saida: 10 },
  { prefixo: "claude-sonnet-4-6", entrada: 3, saida: 15 },
  { prefixo: "claude-opus-5-5", entrada: 4, saida: 20 },
  { prefixo: "claude-opus-5", entrada: 5, saida: 25 },
  { prefixo: "claude-opus-4", entrada: 5, saida: 25 },
];

export function custoEstimadoUsd(modelo: string, tokensEntrada: number, tokensSaida: number): number {
  const p = PRECOS.find((x) => modelo.startsWith(x.prefixo)) ?? { entrada: 10, saida: 50 };
  return Math.round(((tokensEntrada * p.entrada + tokensSaida * p.saida) / 1_000_000) * 100_000) / 100_000;
}

/** modelos oferecidos na tela de Configurações (IDs exatos da documentação) */
export const MODELOS_OFERECIDOS = [
  { id: "claude-haiku-5-5", rotulo: "Claude Haiku 5.5 — mais barato" },
  { id: "claude-sonnet-5-5", rotulo: "Claude Sonnet 5.5 — equilíbrio" },
  { id: "claude-opus-5-5", rotulo: "Claude Opus 5.5 — mais capaz" },
];
