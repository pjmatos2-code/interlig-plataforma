"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  lerConfigSgp,
  lerConfigSzchat,
  salvarConfig,
  mascararAmostra,
  ROTAS_SGP,
} from "@/lib/integracoes/config";
import { randomBytes } from "node:crypto";

export type EstadoIntegracao = { erro?: string; ok?: boolean; mensagem?: string };

function revalidar() {
  revalidatePath("/admin/integracoes");
}

// ---------------------------------------------------------------------------
// SGP
// ---------------------------------------------------------------------------
export async function salvarSgp(_e: EstadoIntegracao, dados: FormData): Promise<EstadoIntegracao> {
  const usuario = await exigirPerfil(["gestor"]);
  let baseUrl = String(dados.get("base_url") ?? "").trim();
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  try {
    await salvarConfig(
      "sgp",
      {
        base_url: baseUrl,
        token: String(dados.get("token") ?? "").trim(),
        app: String(dados.get("app") ?? "").trim(),
        modo: String(dados.get("modo") ?? "mock") === "real" ? "real" : "mock",
        link_cliente: String(dados.get("link_cliente") ?? "").trim(),
      },
      usuario.id
    );
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  revalidar();
  return { ok: true, mensagem: "Configuração do SGP salva." };
}

export type ResultadoRota = { rota: string; status: number | string; resumo: string };

/** Testa a conexão chamando as rotas candidatas com token+app no corpo. */
export async function testarSgp(): Promise<{ erro?: string; resultados?: ResultadoRota[] }> {
  await exigirPerfil(["gestor"]);
  const cfg = await lerConfigSgp();
  if (!cfg.base_url || !cfg.token || !cfg.app)
    return { erro: "Preencha e salve URL, token e app antes de testar." };

  const base = cfg.base_url.replace(/\/$/, "");
  const resultados: ResultadoRota[] = [];
  for (const rota of ROTAS_SGP) {
    try {
      const controlador = new AbortController();
      const timer = setTimeout(() => controlador.abort(), 12_000);
      const resposta = await fetch(`${base}${rota}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cfg.token, app: cfg.app }),
        signal: controlador.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      const texto = await resposta.text();
      resultados.push({
        rota,
        status: resposta.status,
        resumo:
          resposta.status === 200
            ? `OK · ${texto.length} bytes`
            : texto.slice(0, 90).replace(/\s+/g, " "),
      });
    } catch (e) {
      resultados.push({
        rota,
        status: "falha",
        resumo: e instanceof Error ? e.message.slice(0, 90) : "erro de rede",
      });
    }
  }
  return { resultados };
}

/** Descoberta (Fase 0): coleta amostras reais mascaradas e guarda no banco. */
export async function executarDescobertaSgp(): Promise<EstadoIntegracao> {
  await exigirPerfil(["gestor"]);
  const cfg = await lerConfigSgp();
  if (!cfg.base_url || !cfg.token || !cfg.app)
    return { erro: "Preencha e salve URL, token e app antes da descoberta." };

  const admin = criarClienteAdmin();
  const base = cfg.base_url.replace(/\/$/, "");
  let coletadas = 0;

  for (const rota of ROTAS_SGP) {
    try {
      const controlador = new AbortController();
      const timer = setTimeout(() => controlador.abort(), 15_000);
      const resposta = await fetch(`${base}${rota}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cfg.token, app: cfg.app }),
        signal: controlador.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      const texto = await resposta.text();
      let corpo: unknown;
      try {
        corpo = JSON.parse(texto);
      } catch {
        corpo = { _texto: texto.slice(0, 1500) };
      }
      await admin.from("integracoes_amostras").insert({
        sistema: "sgp",
        rota,
        http_status: resposta.status,
        corpo: mascararAmostra(corpo),
      });
      coletadas += 1;
    } catch {
      // rota inacessível: segue para a próxima
    }
  }
  revalidar();
  return coletadas > 0
    ? { ok: true, mensagem: `${coletadas} amostra(s) coletada(s) — role até "Amostras".` }
    : { erro: "Nenhuma rota respondeu. Confira URL e credenciais." };
}

export async function limparAmostras(sistema: "sgp" | "szchat"): Promise<EstadoIntegracao> {
  await exigirPerfil(["gestor"]);
  const admin = criarClienteAdmin();
  await admin.from("integracoes_amostras").delete().eq("sistema", sistema);
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SZ Chat
// ---------------------------------------------------------------------------
export async function salvarSzchat(_e: EstadoIntegracao, dados: FormData): Promise<EstadoIntegracao> {
  const usuario = await exigirPerfil(["gestor"]);
  let baseUrl = String(dados.get("base_url") ?? "").trim();
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  try {
    await salvarConfig(
      "szchat",
      {
        base_url: baseUrl,
        api_token: String(dados.get("api_token") ?? "").trim(),
      },
      usuario.id
    );
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  revalidar();
  return { ok: true, mensagem: "Configuração do SZ Chat salva." };
}

/** Gera (ou troca) o segredo do webhook — exibido uma única vez por completo. */
export async function gerarSegredoWebhook(): Promise<EstadoIntegracao & { segredo?: string }> {
  const usuario = await exigirPerfil(["gestor"]);
  const segredo = randomBytes(24).toString("hex");
  try {
    await salvarConfig("szchat", { webhook_secret: segredo }, usuario.id);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  revalidar();
  return { ok: true, segredo };
}

/** Dispara um evento de teste contra o próprio webhook (fim a fim). */
export async function dispararEventoTeste(): Promise<EstadoIntegracao> {
  await exigirPerfil(["gestor"]);
  const cfg = await lerConfigSzchat();
  if (!cfg.webhook_secret) return { erro: "Gere o segredo do webhook primeiro." };

  const admin = criarClienteAdmin();
  const { data: equipe } = await admin
    .from("sz_equipes_habilitadas")
    .select("nome")
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  if (!equipe) return { erro: "Habilite ao menos uma equipe (Admin → SZ Chat)." };

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const payload = {
    evento_id: `teste-${Date.now()}`,
    tipo: "transferencia_equipe",
    equipe: equipe.nome,
    conversa_id: `TESTE-${Date.now()}`,
    contato: { nome: "Cliente Teste do Módulo de Integrações", telefone: "(93) 90000-0000" },
    timestamp: new Date().toISOString(),
  };
  try {
    const resposta = await fetch(`${base}/api/webhooks/szchat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-szchat-secret": cfg.webhook_secret },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const corpo = await resposta.json();
    revalidatePath("/crm");
    return resposta.ok || resposta.status === 201
      ? {
          ok: true,
          mensagem: `Webhook respondeu "${corpo.resultado}" — confira o ticket no CRM.`,
        }
      : { erro: `Webhook respondeu ${resposta.status}: ${JSON.stringify(corpo).slice(0, 120)}` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Testa a API do SZ Chat (token válido?). */
export async function testarApiSzchat(): Promise<EstadoIntegracao> {
  await exigirPerfil(["gestor"]);
  const cfg = await lerConfigSzchat();
  if (!cfg.base_url || !cfg.api_token)
    return { erro: "Preencha e salve a URL e o token da API do SZ antes de testar." };
  try {
    const resposta = await fetch(cfg.base_url.replace(/\/$/, ""), {
      headers: { Authorization: `Bearer ${cfg.api_token}` },
      cache: "no-store",
    });
    return {
      ok: true,
      mensagem: `Servidor respondeu HTTP ${resposta.status}. (O endpoint exato de conversas é confirmado na ativação do agente.)`,
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
