import { diasEntre, hojeSantarem, segundaDaSemana, semanaDe, somarDias, ultimaSemanaCompleta, type Semana } from "@/lib/relatorio-semanal/periodo";

/**
 * Semana do GRR (segunda a domingo, fuso de Santarém). O painel abre na
 * semana atual; a reunião usa a última semana completa. As funções de
 * calendário são as do Relatório da diretoria.
 */

/** primeira semana com dados do CRM na plataforma (agosto/2026) */
export const PRIMEIRA_SEMANA = "2026-08-03";

export type SemanaGrr = Semana & { tipo: "atual" | "ultima" | "outra" };

export function semanaAtual(hoje: string = hojeSantarem()): Semana {
  return semanaDe(segundaDaSemana(hoje));
}

/** resolve o parâmetro ?semana= (vazio/"atual", "ultima" ou a data de qualquer dia da semana) */
export function resolverSemana(parametro: string | undefined, hoje: string = hojeSantarem()): SemanaGrr {
  const atual = semanaAtual(hoje);
  const ultima = ultimaSemanaCompleta(hoje);
  if (parametro === "ultima") return { ...ultima, tipo: "ultima" };
  if (parametro && /^\d{4}-\d{2}-\d{2}$/.test(parametro) && !Number.isNaN(Date.parse(`${parametro}T12:00:00Z`))) {
    const inicio = segundaDaSemana(parametro);
    if (inicio >= PRIMEIRA_SEMANA && inicio <= atual.inicio) {
      const s = semanaDe(inicio);
      return { ...s, tipo: s.inicio === atual.inicio ? "atual" : s.inicio === ultima.inicio ? "ultima" : "outra" };
    }
  }
  return { ...atual, tipo: "atual" };
}

/** as N semanas que terminam na semana dada, da mais antiga para a mais recente */
export function semanasAte(semana: Semana, n: number): Semana[] {
  return Array.from({ length: n }, (_, i) => {
    const inicio = somarDias(semana.inicio, -7 * (n - 1 - i));
    return { inicio, fim: somarDias(inicio, 6) };
  }).filter((s) => s.inicio >= PRIMEIRA_SEMANA);
}

/** vizinhas para a navegação (null quando não há) */
export function semanasVizinhas(semana: Semana, hoje: string = hojeSantarem()): { anterior: string | null; proxima: string | null } {
  const anterior = somarDias(semana.inicio, -7);
  const proxima = somarDias(semana.inicio, 7);
  return {
    anterior: anterior >= PRIMEIRA_SEMANA ? anterior : null,
    proxima: diasEntre(proxima, semanaAtual(hoje).inicio) >= 0 ? proxima : null,
  };
}
