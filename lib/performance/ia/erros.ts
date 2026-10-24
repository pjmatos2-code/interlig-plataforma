import Anthropic from "@anthropic-ai/sdk";

/**
 * Falhas do provedor de IA (24/10/2026) — puro, testado em ia/erros.test.ts.
 * Do mais específico para o mais geral (classes tipadas do SDK); diz se vale
 * tentar de novo. A fila nunca trava a operação: falha vira registro, não
 * resultado comercial.
 */
export type ResultadoProvedor =
  | { ok: true; json: unknown; modelo: string; tokensEntrada: number; tokensSaida: number }
  | { ok: false; motivo: "recusa" | "truncado" | "formato" | "limite" | "credencial" | "requisicao" | "indisponivel"; detalhe: string; tokensEntrada: number; tokensSaida: number; tentarDeNovo: boolean };

export function classificarErroIa(e: unknown, modelo: string): Extract<ResultadoProvedor, { ok: false }> {
  const falha = (motivo: Extract<ResultadoProvedor, { ok: false }>["motivo"], detalhe: string, tentarDeNovo: boolean) => ({ ok: false as const, motivo, detalhe, tokensEntrada: 0, tokensSaida: 0, tentarDeNovo });
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return falha("credencial", "chave da Anthropic inválida ou sem permissão", false);
  if (e instanceof Anthropic.RateLimitError) return falha("limite", "limite de uso da API atingido", true);
  if (e instanceof Anthropic.NotFoundError) return falha("requisicao", `modelo "${modelo}" não encontrado`, false);
  if (e instanceof Anthropic.BadRequestError) return falha("requisicao", e.message.slice(0, 300), false);
  if (e instanceof Anthropic.APIConnectionError) return falha("indisponivel", "sem conexão com a API", true);
  if (e instanceof Anthropic.APIError) return falha("indisponivel", `API respondeu ${e.status}`, true);
  return falha("formato", e instanceof Error ? e.message.slice(0, 300) : "falha desconhecida", true);
}
