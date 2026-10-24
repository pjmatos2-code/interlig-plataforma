/**
 * Atribuição de responsabilidade (24/10/2026) — puro, testado em
 * atribuicao.test.ts. Regras explícitas (spec, seção 22):
 *  - "Lead recebido" é de quem passou a ser responsável NO período (na
 *    criação ou por reatribuição). Quem recebe por transferência também
 *    "recebe"; quem perdeu o lead não tem o recebimento apagado.
 *  - ESFORÇO é sempre de quem executou a ação (autor da mensagem, da
 *    tratativa, da proposta) — nunca do último responsável por tabela.
 *  - RESULTADO (venda) é do vendedor do contrato no SGP (mesma régua de
 *    comissão e dashboard); conversão do lead, de quem era responsável no
 *    fechamento.
 *  - Bot/robô antes do humano: não gera responsabilidade (só ação humana).
 * O histórico de reatribuições vem do ticket_eventos (imutável).
 */

export type Reatribuicao = { em: string; de: string | null; para: string | null };
export type PeriodoResponsavel = { vendedorId: string; desde: number; ate: number | null };

export function linhaDeResponsabilidade(
  criadoEm: string,
  vendedorAtual: string | null,
  reatribuicoes: Reatribuicao[]
): PeriodoResponsavel[] {
  const evs = [...reatribuicoes].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
  // responsável na criação: o "de" da 1ª troca (o gatilho só registra mudanças)
  const inicial = evs.length ? evs[0].de : vendedorAtual;
  const linha: PeriodoResponsavel[] = [];
  let atual: PeriodoResponsavel | null = inicial ? { vendedorId: inicial, desde: Date.parse(criadoEm), ate: null } : null;
  for (const ev of evs) {
    const t = Date.parse(ev.em);
    if (atual) {
      atual.ate = t;
      linha.push(atual);
    }
    atual = ev.para ? { vendedorId: ev.para, desde: t, ate: null } : null;
  }
  if (atual) linha.push(atual);
  return linha;
}

/** recebeu o lead dentro do período? (início de uma responsabilidade nele) */
export function recebeuNoPeriodo(linha: PeriodoResponsavel[], vendedorId: string, deMs: number, ateMs: number): number | null {
  const p = linha.find((x) => x.vendedorId === vendedorId && x.desde >= deMs && x.desde <= ateMs);
  return p ? p.desde : null;
}

export function responsavelEm(linha: PeriodoResponsavel[], ms: number): string | null {
  const p = linha.find((x) => x.desde <= ms && (x.ate === null || ms < x.ate));
  return p?.vendedorId ?? null;
}
