import { SgpApiClient } from "./api";
import { SgpMockClient } from "./mock";
import type { SgpClient } from "./tipos";

/**
 * Seleção do cliente SGP via SGP_MODE=mock|real (CLAUDE.md).
 * Quando as credenciais chegarem: preencher o .env e trocar o modo —
 * nenhuma tela muda.
 */
export function criarClienteSgp(): SgpClient {
  const modo = (process.env.SGP_MODE ?? "mock").toLowerCase();
  if (modo === "real") return new SgpApiClient();
  return new SgpMockClient();
}

export type { SgpClient } from "./tipos";
