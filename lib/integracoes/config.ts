import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Configuração das integrações (módulo de autosserviço do admin).
 * Ordem de precedência: banco (cadastrado pela tela) → variável de ambiente.
 * Tokens nunca chegam ao navegador — as actions devolvem versões mascaradas.
 */

export type ConfigSgp = {
  base_url: string | null;
  token: string | null;
  app: string | null;
  modo: "mock" | "real";
};

export type ConfigSzchat = {
  base_url: string | null;
  api_token: string | null;
  webhook_secret: string | null;
};

async function lerBruto(sistema: "sgp" | "szchat"): Promise<Record<string, unknown>> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", sistema)
    .maybeSingle();
  return (data?.config as Record<string, unknown>) ?? {};
}

export async function lerConfigSgp(): Promise<ConfigSgp> {
  const banco = await lerBruto("sgp");
  return {
    base_url: (banco.base_url as string) || process.env.SGP_BASE_URL || null,
    token: (banco.token as string) || process.env.SGP_TOKEN || null,
    app: (banco.app as string) || process.env.SGP_APP || null,
    modo:
      ((banco.modo as string) || process.env.SGP_MODE || "mock") === "real" ? "real" : "mock",
  };
}

export async function lerConfigSzchat(): Promise<ConfigSzchat> {
  const banco = await lerBruto("szchat");
  return {
    base_url: (banco.base_url as string) || process.env.SZCHAT_BASE_URL || null,
    api_token: (banco.api_token as string) || process.env.SZCHAT_TOKEN || null,
    webhook_secret:
      (banco.webhook_secret as string) || process.env.SZCHAT_WEBHOOK_SECRET || null,
  };
}

export async function salvarConfig(
  sistema: "sgp" | "szchat",
  parcial: Record<string, unknown>,
  usuarioId: string
) {
  const admin = criarClienteAdmin();
  const atual = await lerBruto(sistema);
  // campo enviado vazio = manter o valor atual (permite salvar sem redigitar token)
  const limpo = Object.fromEntries(
    Object.entries(parcial).filter(([, v]) => v !== "" && v !== undefined && v !== null)
  );
  const { error } = await admin.from("integracoes_config").upsert({
    sistema,
    config: { ...atual, ...limpo },
    atualizado_em: new Date().toISOString(),
    atualizado_por: usuarioId,
  });
  if (error) throw new Error(error.message);
}

export function mascarar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (valor.length <= 6) return "••••";
  return `••••••••${valor.slice(-4)}`;
}

/** Mascara dados pessoais em amostras coletadas (cpf, telefone, e-mail…). */
export function mascararAmostra(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return "…";
  if (Array.isArray(valor)) return valor.slice(0, 5).map((v) => mascararAmostra(v, profundidade + 1));
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      const k = chave.toLowerCase();
      if (/(cpf|cnpj|rg\b|senha|password)/.test(k)) saida[chave] = "***";
      else if (/(telefone|celular|fone|whats)/.test(k))
        saida[chave] = typeof v === "string" ? v.replace(/\d(?=\d{2})/g, "*") : "***";
      else if (k.includes("email")) saida[chave] = "mascarado@exemplo.com";
      else saida[chave] = mascararAmostra(v, profundidade + 1);
    }
    return saida;
  }
  if (typeof valor === "string" && valor.length > 400) return valor.slice(0, 400) + "…";
  return valor;
}

/** Rotas candidatas da API URA do SGP (confirmadas contra a instância). */
export const ROTAS_SGP = [
  "/api/ura/clientes/",
  "/api/ura/consultacliente/",
  "/api/ura/contratos/",
  "/api/ura/planos/",
  "/api/ura/titulos/",
  "/ura/consultacliente/",
  "/ura/contratos/",
  "/ura/planos/",
];
