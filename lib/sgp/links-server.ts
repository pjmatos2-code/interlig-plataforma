import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Template do link do SGP (editável em Admin → Integrações). Default derivado
 * da URL base cadastrada.
 *
 * Aponta para a LISTA DE CONTRATOS do cliente, não para o formulário de edição
 * (/edit/): quem clica quer conferir o contrato — número, status, serviços,
 * tratativa — e não alterar o cadastro. Vale para todas as telas (Esteira,
 * Minhas vendas, fila de aprovação), inclusive as das vendedoras.
 */
export async function templateLinkSgp(): Promise<string> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "sgp")
    .maybeSingle();
  const cfg = (data?.config ?? {}) as Record<string, unknown>;
  if (typeof cfg.link_cliente === "string" && cfg.link_cliente.trim()) {
    return cfg.link_cliente.trim();
  }
  const base = String(
    cfg.base_url ?? process.env.SGP_BASE_URL ?? "https://atm-erp.interlig.net/admin"
  )
    .replace(/\/+$/, "")
    .replace(/\/api$/, "");
  return `${base}/cliente/{cliente_id}/contratos/`;
}
