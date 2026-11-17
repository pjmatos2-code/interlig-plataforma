/**
 * Quem refideliza, pelo login do SGP (é o login que assina o aditivo). A lista
 * define o setor para a comissão, o fechamento, o painel e a meta do pilar da
 * Gerência (150 por agente da lista).
 *
 * Vale para o cadastro de QUALQUER setor (17/11/2026): a Talia passou a vender
 * no comercial interno e continua refidelizando durante a migração. Quando ela
 * deixar a refidelização, sai daqui.
 *
 * Arquivo à parte das regras de propósito: as regras vão para o navegador, e
 * os logins não precisam ir.
 */
export const AGENTES_SETOR = ["talia.marques", "myllena.araujo"];

/** O login do SGP é de alguém que refideliza? */
export function refidelizaPeloLogin(login: string | null | undefined): boolean {
  return !!login && AGENTES_SETOR.includes(login.trim().toLowerCase());
}

/**
 * Vende no comercial e também refideliza: tem os dois painéis e mantém as
 * telas do Atendimento (Fidelidade da base e Prevenção de cancelamento).
 */
export function vendeERefideliza(
  cadastro: { setor?: string | null; sgp_login?: string | null } | null | undefined
): boolean {
  return !!cadastro && cadastro.setor !== "atendimento" && refidelizaPeloLogin(cadastro.sgp_login);
}
