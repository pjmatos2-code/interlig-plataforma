import type { Perfil } from "@/lib/tipos";

/**
 * Acesso aos módulos por usuário (23/11/2026). O padrão vem do perfil; a
 * administração libera ou bloqueia módulo por módulo, pessoa por pessoa
 * (tabela usuario_modulos), e pode prender a pessoa a uma unidade. Função pura.
 */

export type Modulo = "operacao" | "infraestrutura" | "grr_tecnico" | "grr_comercial";

export const MODULOS: { chave: Modulo; rotulo: string; descricao: string }[] = [
  { chave: "operacao", rotulo: "Operação Técnica", descricao: "Quadro de ocorrências, calendário e clientes deixados para trás." },
  { chave: "infraestrutura", rotulo: "Infraestrutura", descricao: "Ocorrências da infraestrutura da rede: quadro e calendário." },
  { chave: "grr_tecnico", rotulo: "GRR Técnico", descricao: "Indicadores, reunião de terça e conferência do setor técnico." },
  { chave: "grr_comercial", rotulo: "GRR Comercial", descricao: "Indicadores, reuniões e planos de ação do setor comercial." },
];

/** quem tem o módulo sem ajuste nenhum */
export const PADRAO_MODULO: Record<Modulo, Perfil[]> = {
  operacao: ["gestor", "gestor_tecnico", "direcao"],
  infraestrutura: ["gestor", "direcao", "gestor_infraestrutura"],
  grr_tecnico: ["gestor", "gestor_tecnico", "direcao"],
  grr_comercial: ["gestor", "supervisor", "direcao"],
};

export type AjusteModulo = { modulo: Modulo; permitido: boolean; popId: string | null };

/** o módulo vale para a pessoa? popId = unidade a que ela fica presa (null = todas as que o perfil permite) */
export function acessoDoModulo(perfil: Perfil, ajustes: AjusteModulo[], modulo: Modulo): { permitido: boolean; popId: string | null; ajustado: boolean } {
  const a = ajustes.find((x) => x.modulo === modulo);
  if (a) return { permitido: a.permitido, popId: a.permitido ? a.popId : null, ajustado: true };
  return { permitido: PADRAO_MODULO[modulo].includes(perfil), popId: null, ajustado: false };
}
