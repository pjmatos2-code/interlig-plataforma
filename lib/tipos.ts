export type Perfil = "gestor" | "supervisor" | "vendedora" | "vendedora_externa";

/** Interna e externa compartilham o mesmo escopo de dados (só o que é delas). */
export const ehVendedora = (p: Perfil): boolean =>
  p === "vendedora" || p === "vendedora_externa";

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
