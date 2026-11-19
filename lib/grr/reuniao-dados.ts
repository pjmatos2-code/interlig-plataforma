import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Perfil } from "@/lib/tipos";

/**
 * A reunião de resultados de segunda já tem registro no Relatório da diretoria
 * (`relatorios_semanais.reuniao`): data, participantes, respostas e o
 * checklist de ações (p1 a p5: ação, responsável, prazo e prova). O GRR só lê
 * esse registro e, no Modo Apresentação, grava pelos mesmos campos e pela
 * mesma ação do relatório. Só direção e administração acessam o relatório.
 */

export type AcaoCombinada = { n: number; acao: string; responsavel: string; prazo: string; prova: string; feita: boolean };
/** combinado da reunião anterior com a conferência feita nesta (w{n}: Feito, Parcial, Não feito) */
export type AcaoConferida = AcaoCombinada & { situacao: "Feito" | "Parcial" | "Não feito" | null };
export type ReuniaoDaSemana = {
  relatorioId: string;
  semanaInicio: string;
  reuniao: Record<string, string>;
  /** ações combinadas na reunião desta semana */
  combinado: AcaoCombinada[];
  /** ações combinadas na reunião anterior (a cobrar nesta) */
  combinadoAnterior: AcaoConferida[];
};

export const PERFIS_RELATORIO: Perfil[] = ["gestor", "direcao"];

export function acoesDaReuniao(reuniao: Record<string, string> | null | undefined): AcaoCombinada[] {
  const r = reuniao ?? {};
  return [1, 2, 3, 4, 5]
    .map((n) => ({ n, acao: (r[`p${n}a`] ?? "").trim(), responsavel: (r[`p${n}r`] ?? "").trim(), prazo: (r[`p${n}p`] ?? "").trim(), prova: (r[`p${n}e`] ?? "").trim(), feita: r[`c${n}`] === "1" }))
    .filter((x) => x.acao);
}

const SITUACOES = ["Feito", "Parcial", "Não feito"] as const;

/** a situação marcada nesta reunião para cada ação da anterior (a linha n da conferência é a ação n) */
export function conferir(anteriores: AcaoCombinada[], reuniao: Record<string, string>): AcaoConferida[] {
  return anteriores.map((a, i) => {
    const s = (reuniao[`w${i + 1}s`] ?? "").trim();
    return { ...a, situacao: (SITUACOES as readonly string[]).includes(s) ? (s as AcaoConferida["situacao"]) : null };
  });
}

/** registro da reunião da semana (relatório gerado para ela) e o combinado da anterior; null sem acesso ou sem relatório */
export async function lerReuniaoDaSemana(semanaInicio: string, perfil: Perfil): Promise<ReuniaoDaSemana | null> {
  if (!PERFIS_RELATORIO.includes(perfil)) return null;
  const admin = criarClienteAdmin();
  const [{ data: atual }, { data: anterior }] = await Promise.all([
    admin.from("relatorios_semanais").select("id, semana_inicio, reuniao").eq("semana_inicio", semanaInicio).maybeSingle(),
    admin.from("relatorios_semanais").select("reuniao").lt("semana_inicio", semanaInicio).order("semana_inicio", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!atual) return null;
  const reuniao = (atual.reuniao as Record<string, string> | null) ?? {};
  return {
    relatorioId: atual.id as string,
    semanaInicio: atual.semana_inicio as string,
    reuniao,
    combinado: acoesDaReuniao(reuniao),
    combinadoAnterior: conferir(acoesDaReuniao((anterior?.reuniao as Record<string, string> | null) ?? null), reuniao),
  };
}
