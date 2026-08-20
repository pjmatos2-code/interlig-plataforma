/**
 * Formato NORMALIZADO das entidades vindas do SGP — é o contrato entre o
 * cliente (real ou mock) e o worker de sync. O mapeamento campo-a-campo da
 * API real da Interlig será fechado na Fase 0 (scripts/sgp-discovery.mjs)
 * dentro do SgpApiClient; o worker não muda.
 */

export type SgpPlano = {
  sgp_plano_id: string;
  nome: string;
  velocidade: string | null;
  valor_referencia: number;
  ativo: boolean;
};

export type SgpCliente = {
  sgp_cliente_id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  bairro: string | null;
  cidade: string | null;
  /** valor cru do SGP; vira categoria via origem_map */
  origem_cadastro_sgp: string | null;
};

export type SgpContrato = {
  sgp_contrato_id: string;
  sgp_cliente_id: string;
  sgp_plano_id: string | null;
  sgp_vendedor_id: string | null;
  valor_mensalidade: number;
  valor_instalacao: number;
  /** status cru do SGP; normalizado pelo worker */
  status_sgp: string;
  origem_cadastro_sgp: string | null;
  data_venda: string;
  data_assinatura: string | null;
  data_ativacao: string | null;
  data_cancelamento: string | null;
  motivo_cancelamento: string | null;
};

export type SgpTitulo = {
  sgp_titulo_id: string;
  sgp_contrato_id: string;
  numero_parcela: number;
  valor: number;
  vencimento: string;
  data_pagamento: string | null;
  /** aberto | liquidado | cancelado (normalizado pelo cliente) */
  status: string;
};

export interface SgpClient {
  /** identifica o modo nos logs de sync_runs */
  modo: "mock" | "real";
  listarPlanos(): Promise<SgpPlano[]>;
  listarClientes(alteradosDesde?: string): Promise<SgpCliente[]>;
  listarContratos(alteradosDesde?: string): Promise<SgpContrato[]>;
  listarTitulos(alteradosDesde?: string): Promise<SgpTitulo[]>;
}
