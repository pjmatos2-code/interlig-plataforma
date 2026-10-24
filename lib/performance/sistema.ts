import type { EscopoPerformance } from "./escopo";

/**
 * Escopo das rotinas automáticas (cron): empresa inteira, sem usuário. Só
 * para LER e calcular — nenhuma permissão de ação de tela.
 */
export const ESCOPO_SISTEMA = {
  usuario: { id: "sistema", nome: "Sistema", email: "", perfil: "gestor", pop_id: null, vendedor_id: null, ativo: true },
  papel: "admin",
  vendedorIds: null,
  vendedorProprio: null,
  podeVerConversas: false,
  podeConfigurar: false,
  podeGerirMetas: false,
  podeTratarAlertas: false,
  verValoresDeColegas: true,
  podeExportar: false,
} as unknown as EscopoPerformance;
