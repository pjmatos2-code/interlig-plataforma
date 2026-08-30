export type Perfil =
  | "gestor"
  | "supervisor"
  | "vendedora"
  | "vendedora_externa"
  | "agente_corporativo"
  /** somente leitura do que é pagamento: comissões fechadas e demonstrativos */
  | "financeiro"
  /** Setor de Atendimento: refidelização, não vende */
  | "agente_atendimento";

/** Interna e externa compartilham o mesmo escopo de dados (só o que é delas). */
export const ehVendedora = (p: Perfil): boolean =>
  p === "vendedora" || p === "vendedora_externa" || p === "agente_corporativo";

/**
 * Perfis que precisam de vínculo com um cadastro de agente no SGP. O
 * Atendimento entra aqui: não vende, mas o vínculo é o que liga a pessoa aos
 * aditivos que ela gerou.
 */
export const exigeVinculoAgente = (p: Perfil): boolean =>
  ehVendedora(p) || p === "agente_atendimento";

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  pop_id: string | null;
  vendedor_id: string | null;
  ativo: boolean;
};

export const ROTULO_PERFIL: Record<Perfil, string> = {
  gestor: "Administrador",
  supervisor: "Coordenador",
  vendedora: "Vendedora interna",
  vendedora_externa: "Vendedora externa",
  agente_corporativo: "Agente corporativo",
  financeiro: "Financeiro",
  agente_atendimento: "Agente de atendimento",
};

export type CategoriaOrigem =
  | "venda_externa"
  | "trafego_pago"
  | "presencial"
  | "indicacao"
  | "outro";

export const ROTULO_ORIGEM: Record<CategoriaOrigem, string> = {
  venda_externa: "Venda externa / PAP",
  trafego_pago: "Tráfego pago",
  presencial: "Presencial",
  indicacao: "Indicação",
  outro: "Outro",
};

export type EtapaTicket = "novo" | "em_atendimento" | "proposta" | "aguardando" | "fechado";

export const ROTULO_ETAPA: Record<EtapaTicket, string> = {
  novo: "Sem contato",
  em_atendimento: "Contato inicial",
  proposta: "Interessado",
  aguardando: "Criação do contrato",
  fechado: "Fechado",
};
