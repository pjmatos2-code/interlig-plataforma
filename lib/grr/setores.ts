import type { Perfil } from "@/lib/tipos";
import { acessoDoModulo, type AjusteModulo, type Modulo } from "@/lib/acessos";

/**
 * Setores do GRR (21/11/2026): ao abrir o módulo, a pessoa escolhe o setor
 * antes de ver os números. Cada setor tem o seu painel, metas, reuniões e
 * conferência. Para incluir um setor novo, acrescente a linha aqui.
 */
export type SetorGrr = {
  chave: "comercial" | "tecnico";
  rotulo: string;
  descricao: string;
  conteudo: string[];
  href: string;
  /** começo do endereço das telas do setor (para marcar o setor atual) */
  prefixo: string;
  perfis: Perfil[];
  /** módulo de acesso por usuário (lib/acessos.ts) */
  modulo: Modulo;
};

export const SETORES_GRR: SetorGrr[] = [
  {
    chave: "comercial",
    rotulo: "Setor comercial",
    descricao: "Vendas, ativações, conversão, receita e produtividade dos agentes.",
    conteudo: ["Resumo executivo e indicadores", "Reunião da diretoria e reunião de equipe", "Planos de ação, histórico e rotinas"],
    href: "/grr",
    prefixo: "/grr",
    perfis: ["gestor", "direcao", "supervisor"],
    modulo: "grr_comercial",
  },
  {
    chave: "tecnico",
    rotulo: "Setor técnico",
    descricao: "Instalações, prazos de atendimento, qualidade e processo da equipe técnica.",
    conteudo: ["Indicadores por empresa e unidade", "Reunião operacional de terça", "Metas e conferência dos dados"],
    href: "/grr/tecnico",
    prefixo: "/grr/tecnico",
    perfis: ["gestor", "direcao", "gestor_tecnico"],
    modulo: "grr_tecnico",
  },
];

export const setoresDoPerfil = (perfil: Perfil, ajustes: AjusteModulo[] = []): SetorGrr[] => SETORES_GRR.filter((s) => acessoDoModulo(perfil, ajustes, s.modulo).permitido);
