/**
 * Tipos compartilhados da Performance Comercial (24/10/2026).
 * Indicador sem dado NUNCA vira zero: fica "Não disponível" com o motivo,
 * e o peso dele é redistribuído só entre os itens aplicáveis.
 */

export type MotivoIndisponivel =
  | "sem_dados" // ainda não há registro para medir
  | "volume_insuficiente" // poucos casos: a taxa seria ruído
  | "nao_aplicavel" // não faz parte da função (ex.: SLA de chat para venda externa)
  | "sem_integracao" // a fonte não existe (ex.: ligações)
  | "em_maturacao" // coorte ainda sem os 30/90 dias necessários
  | "sem_meta"; // depende de meta não cadastrada

export const ROTULO_MOTIVO: Record<MotivoIndisponivel, string> = {
  sem_dados: "Sem dados no período",
  volume_insuficiente: "Volume insuficiente",
  nao_aplicavel: "Não se aplica à função",
  sem_integracao: "Sem integração",
  em_maturacao: "Aguardando maturação",
  sem_meta: "Sem meta cadastrada",
};

export type Unidade = "pct" | "qtd" | "seg" | "brl" | "nota";

export type Indicador = {
  chave: string;
  rotulo: string;
  unidade: Unidade;
  valor: number | null;
  numerador?: number | null;
  denominador?: number | null;
  /** nota 0–100 quando o indicador compõe um score */
  nota: number | null;
  disponivel: boolean;
  motivo?: MotivoIndisponivel;
  /** como é calculado — aparece no detalhamento para o vendedor e o gestor */
  formula: string;
  detalhe?: string;
};

export type ItemComposicao = {
  chave: string;
  rotulo: string;
  /** peso configurado */
  peso: number;
  /** peso depois de redistribuir entre os aplicáveis (soma 100) */
  pesoEfetivo: number;
  nota: number | null;
  /** pontos que o item somou ao score */
  contribuicao: number;
  motivo?: MotivoIndisponivel;
};

export type Score = {
  valor: number | null;
  /** fração do peso total que tinha dado (0–1) */
  cobertura: number;
  composicao: ItemComposicao[];
  /** score parcial: componente essencial indisponível ou cobertura baixa */
  provisorio: boolean;
  motivo?: MotivoIndisponivel;
};
