/**
 * Normalização e composição de notas (24/10/2026). Puro — testado em
 * normalizacao.test.ts. Regras:
 *  - notaLinear: no piso vale 0, no alvo (ou acima) vale 100, linear no meio.
 *  - notaInversa: para "quanto menor, melhor" (cancelamento, inadimplência):
 *    até o alvo vale 100, no máximo (ou acima) vale 0.
 *  - combinar: soma ponderada SÓ dos itens com nota; os pesos dos
 *    indisponíveis são redistribuídos proporcionalmente entre os demais.
 *    Nada é misturado sem normalizar: todo item entra já em 0–100.
 */
import type { Faixa } from "../config";
import type { ItemComposicao, MotivoIndisponivel, Score } from "../tipos";

const arred1 = (n: number) => Math.round(n * 10) / 10;
const limitar = (n: number) => Math.max(0, Math.min(100, n));

export function notaLinear(valor: number, faixa: Faixa): number {
  if (!Number.isFinite(valor)) return 0;
  if (faixa.alvo <= faixa.piso) return valor >= faixa.alvo ? 100 : 0;
  return arred1(limitar(((valor - faixa.piso) / (faixa.alvo - faixa.piso)) * 100));
}

export function notaInversa(valor: number, limites: { alvo: number; maximo: number }): number {
  if (!Number.isFinite(valor)) return 0;
  if (valor <= limites.alvo) return 100;
  if (valor >= limites.maximo) return 0;
  return arred1(limitar(((limites.maximo - valor) / (limites.maximo - limites.alvo)) * 100));
}

export type EntradaComposicao = {
  chave: string;
  rotulo: string;
  peso: number;
  nota: number | null;
  motivo?: MotivoIndisponivel;
};

/** cobertura abaixo disto marca o score como provisório */
export const COBERTURA_MINIMA = 0.4;

export function combinar(itens: EntradaComposicao[], opts: { essenciais?: string[] } = {}): Score {
  const comPeso = itens.filter((i) => i.peso > 0);
  const pesoTotal = comPeso.reduce((s, i) => s + i.peso, 0);
  const aplicaveis = comPeso.filter((i) => i.nota !== null && Number.isFinite(i.nota));
  const pesoAplicavel = aplicaveis.reduce((s, i) => s + i.peso, 0);
  const composicao: ItemComposicao[] = itens.map((i) => {
    const ok = i.peso > 0 && i.nota !== null && pesoAplicavel > 0;
    return {
      chave: i.chave,
      rotulo: i.rotulo,
      peso: i.peso,
      pesoEfetivo: ok ? arred1((i.peso / pesoAplicavel) * 100) : 0,
      nota: i.nota,
      contribuicao: ok ? arred1(((i.nota as number) * i.peso) / pesoAplicavel) : 0,
      motivo: i.nota === null ? (i.motivo ?? "sem_dados") : undefined,
    };
  });
  if (pesoAplicavel === 0) {
    return { valor: null, cobertura: 0, composicao, provisorio: true, motivo: "sem_dados" };
  }
  const valor = arred1(aplicaveis.reduce((s, i) => s + ((i.nota as number) * i.peso) / pesoAplicavel, 0));
  const cobertura = pesoTotal > 0 ? Math.round((pesoAplicavel / pesoTotal) * 1000) / 1000 : 0;
  const faltaEssencial = (opts.essenciais ?? []).some((k) => !aplicaveis.find((i) => i.chave === k));
  return { valor, cobertura, composicao, provisorio: cobertura < COBERTURA_MINIMA || faltaEssencial };
}

// ---------------------------------------------------------------------------
// Estatística descritiva (SLA, tempos)
// ---------------------------------------------------------------------------
export function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function media(v: number[]): number | null {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** percentil por interpolação linear (p em 0–100) */
export function percentil(v: number[], p: number): number | null {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (o.length - 1);
  const base = Math.floor(pos);
  const resto = pos - base;
  return o[base + 1] !== undefined ? o[base] + resto * (o[base + 1] - o[base]) : o[base];
}

/** razão segura: denominador zero → null (nunca 0% nem 100% inventado) */
export function razao(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}
