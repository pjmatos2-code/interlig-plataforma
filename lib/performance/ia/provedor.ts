import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { classificarErroIa, type ResultadoProvedor } from "./erros";
import { SchemaAnalise } from "./schema";

/**
 * Camada de provedor de IA (24/10/2026). O pipeline só conhece esta
 * interface — trocar de fornecedor é escrever outra implementação.
 * Hoje: Anthropic, com a chave e o modelo já configurados em Integrações
 * (nada de chave em variável de ambiente, como no resto da plataforma).
 */
export type { ResultadoProvedor } from "./erros";

export interface ProvedorIA {
  nome: string;
  modelo: string;
  analisar(p: { system: string; user: string }): Promise<ResultadoProvedor>;
}

export async function provedorConfigurado(modeloPreferido?: string | null): Promise<ProvedorIA | null> {
  const { data } = await criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "anthropic").maybeSingle();
  const cfg = (data?.config ?? {}) as { api_key?: string; modelo?: string };
  if (!cfg.api_key) return null;
  const modelo = modeloPreferido || cfg.modelo || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey: cfg.api_key, maxRetries: 2, timeout: 90_000 });
  return {
    nome: "anthropic",
    modelo,
    async analisar({ system, user }) {
      try {
        const r = await client.messages.parse({
          model: modelo,
          max_tokens: 4000,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { format: zodOutputFormat(SchemaAnalise) },
        });
        const tokensEntrada = r.usage.input_tokens;
        const tokensSaida = r.usage.output_tokens;
        if (r.stop_reason === "refusal")
          return { ok: false, motivo: "recusa", detalhe: r.stop_details?.explanation ?? "o modelo recusou a análise", tokensEntrada, tokensSaida, tentarDeNovo: false };
        if (r.stop_reason === "max_tokens") return { ok: false, motivo: "truncado", detalhe: "resposta cortada pelo limite de tokens", tokensEntrada, tokensSaida, tentarDeNovo: true };
        if (r.parsed_output === null || r.parsed_output === undefined)
          return { ok: false, motivo: "formato", detalhe: "resposta fora do formato esperado", tokensEntrada, tokensSaida, tentarDeNovo: true };
        return { ok: true, json: r.parsed_output, modelo: r.model, tokensEntrada, tokensSaida };
      } catch (e) {
        return classificarErroIa(e, modelo);
      }
    },
  };
}
