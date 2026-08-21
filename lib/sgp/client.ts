import "server-only";
import { SgpApiClient } from "./api";
import { SgpMockClient } from "./mock";
import { lerConfigSgp } from "@/lib/integracoes/config";
import type { SgpClient } from "./tipos";

/**
 * Seleção do cliente SGP. O modo e as credenciais vêm do módulo de
 * Integrações (banco), com fallback nas variáveis de ambiente (CLAUDE.md).
 */
export async function criarClienteSgp(): Promise<SgpClient> {
  const config = await lerConfigSgp();
  if (config.modo === "real") return new SgpApiClient(config);
  return new SgpMockClient();
}

export type { SgpClient } from "./tipos";
