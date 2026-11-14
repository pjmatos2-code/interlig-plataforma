import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Configuração do envio do relatório (integracoes_config, sistema
 * 'relatorio_semanal'): para quem vai, o nome da abertura do e-mail e se o
 * envio de segunda é automático. Sem nada salvo, a abertura é "Estevam" (o
 * CEO, como no e-mail aprovado) e o automático fica desligado.
 */

export type ConfigEnvioRelatorio = { para: string[]; saudacao: string; automatico: boolean };

export const SAUDACAO_PADRAO = "Estevam";

export async function lerConfigEnvio(): Promise<ConfigEnvioRelatorio> {
  const { data } = await criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "relatorio_semanal").maybeSingle();
  const c = (data?.config ?? {}) as Record<string, unknown>;
  return {
    para: Array.isArray(c.para) ? c.para.filter((x): x is string => typeof x === "string") : [],
    saudacao: typeof c.saudacao === "string" ? c.saudacao : SAUDACAO_PADRAO,
    automatico: c.automatico === true,
  };
}

export async function salvarConfigEnvio(cfg: ConfigEnvioRelatorio, usuarioId: string): Promise<void> {
  const admin = criarClienteAdmin();
  const { error } = await admin.rpc("mesclar_config", {
    p_sistema: "relatorio_semanal",
    p_patch: { para: cfg.para, saudacao: cfg.saudacao, automatico: cfg.automatico },
  });
  if (error) throw new Error(error.message);
  await admin.from("integracoes_config").update({ atualizado_por: usuarioId }).eq("sistema", "relatorio_semanal");
}
