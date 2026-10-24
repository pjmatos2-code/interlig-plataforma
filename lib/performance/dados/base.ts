/**
 * Dados brutos já carregados para a apuração (24/10/2026). O carregador
 * (carregar.ts) faz todas as leituras de uma vez; o cálculo (calcular.ts)
 * é puro sobre esta estrutura — testável sem banco.
 */
import type { ConfigPerformance } from "../config";
import type { MetricasAgente } from "../coleta/calculo";
import type { Reatribuicao } from "../regras/atribuicao";

export type VendedorBase = {
  id: string;
  nome: string;
  setor: string | null;
  pop_id: string | null;
  pop_nome: string | null;
  coordenador_id: string | null;
  coordenador_nome: string | null;
  foto_url: string | null;
  ativo: boolean;
  eh_coordenador: boolean;
  admitido_em: string | null;
};

export type TicketBase = {
  id: string;
  cliente_nome: string | null;
  vendedor_id: string | null;
  pop_id: string | null;
  etapa: string;
  desfecho: string | null;
  origem_criacao: string;
  criado_em: string;
  fechado_em: string | null;
  followup_em: string | null;
  telefone: string | null;
  contrato_id: string | null;
  data_venda_contrato: string | null;
  urgencia: string | null;
  valor_estimado: number | null;
  reaberto_de_id: string | null;
  motivo_id: string | null;
  etapa_encerramento: string | null;
  plano_id: string | null;
};

export type FonteAcao = "chat" | "tratativa" | "etapa" | "fechamento" | "reabertura" | "proposta" | "visita";

/** ação humana no lead (CRM, proposta, visita) — o chat vem das conversas */
export type AcaoHumana = { ticketId: string; vendedorId: string | null; em: number; fonte: FonteAcao };

export type ConversaBase = {
  id: string;
  ticket_id: string | null;
  vendedor_id: string | null;
  pop_id: string | null;
  canal: string | null;
  equipe: string | null;
  iniciada_por: string | null;
  iniciada_em: string | null;
  finalizada_em: string | null;
  primeira_resposta_em: string | null;
  primeira_resposta_vendedor_id: string | null;
  primeira_resposta_seg: number | null;
  primeira_resposta_util_seg: number | null;
  cliente_sem_resposta: boolean;
  msgs_cliente: number;
  msgs_agente: number;
  msgs_automacao: number;
  por_agente: Record<string, MetricasAgente>;
  cliente_por_dia: Record<string, number>;
  status_final: string | null;
};

export type FollowupBase = {
  id: string;
  ticket_id: string;
  vendedor_id: string | null;
  origem: string;
  status: string;
  prazo: string;
  concluido_em: string | null;
  prioridade: string;
  tipo: string;
  motivo: string | null;
  proximo_passo: string | null;
  evidencia: string | null;
  criado_em: string;
};

export type ContratoBase = {
  id: string;
  vendedor_id: string | null;
  pop_id: string | null;
  plano_id: string | null;
  data_venda: string;
  data_assinatura: string | null;
  data_ativacao: string | null;
  data_cancelamento: string | null;
  motivo_cancelamento: string | null;
  status: string;
  valor_mensalidade: number;
  origem_cadastro: string | null;
};

export type TituloBase = { contrato_id: string; vencimento: string; data_pagamento: string | null; status: string };
export type MetaBase = { vendedor_id: string; mes_ano: string; quantidade_vendas: number; receita: number | null };
export type IndisponibilidadeBase = { vendedor_id: string; inicio: string; fim: string; tipo: string };
export type AnaliseBase = {
  conversa_id: string;
  ticket_id: string | null;
  vendedor_id: string | null;
  concluido_em: string;
  score_atendimento: number | null;
  temperatura: string | null;
  intencao_compra: boolean | null;
  objecoes: string[];
  status_lead: string | null;
  prioridade_lead: string | null;
  resultado: Record<string, unknown> | null;
  /** houve revisão humana (os valores acima já são os revisados) */
  revisada: boolean;
};
export type PropostaBase = { ticket_id: string; vendedor_id: string | null; em: number; valor: number | null };

export type BaseDados = {
  hoje: string;
  agoraMs: number;
  cfg: ConfigPerformance;
  ehDiaUtil: (dia: string) => boolean;
  vendedores: VendedorBase[];
  tickets: TicketBase[];
  reatribuicoes: Map<string, Reatribuicao[]>;
  acoes: AcaoHumana[];
  conversas: ConversaBase[];
  followups: FollowupBase[];
  contratos: ContratoBase[];
  titulosPrimeira: TituloBase[];
  /** contratos com OS de instalação já agendada (SGP) */
  osAgendadas: Set<string>;
  metas: MetaBase[];
  indisponibilidades: IndisponibilidadeBase[];
  analises: AnaliseBase[];
  propostas: PropostaBase[];
  motivos: Map<string, string>;
  planos: Map<string, string>;
};
