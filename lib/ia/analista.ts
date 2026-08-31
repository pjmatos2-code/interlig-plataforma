import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Cliente da API Anthropic — o "analista de conversas" da plataforma.
 * A chave vive em integracoes_config (sistema 'anthropic'), salva pelo gestor
 * via script; um único cadastro serve todos os usos (retenção, comercial).
 */

export async function chamarAnalista(prompt: string, maxTokens = 900): Promise<string> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "anthropic")
    .maybeSingle();
  const cfg = (data?.config ?? {}) as { api_key?: string; modelo?: string };
  if (!cfg.api_key) throw new Error("Chave da API Anthropic não configurada.");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.api_key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.modelo ?? "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const j = (await r.json()) as { content?: { text?: string }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(`Anthropic: ${j.error?.message ?? r.status}`);
  return j.content?.[0]?.text ?? "";
}

/** Extrai o primeiro objeto JSON de uma resposta (o modelo às vezes comenta). */
export function extrairJson<T>(texto: string): T | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

export type AnaliseRetencao = {
  motivo_real: string;
  trilha_sugerida: "A" | "B" | "C" | "D" | "E" | "F";
  oferta_feita: string;
  desfecho_aparente: "aceitou" | "recusou" | "sem_resposta" | "transferido" | "indefinido";
  divergencia: string | null;
  aderencia_pop: string;
  resumo: string;
};

/**
 * Analisa uma conversa de retenção (POP-RET-001): motivo real, trilha da dor,
 * oferta feita, desfecho aparente e divergência com o registro da agente.
 */
export async function analisarConversaRetencao(
  transcript: string,
  registroAgente: { motivo?: string | null; alcada?: string | null; desfecho?: string | null }
): Promise<AnaliseRetencao | null> {
  const prompt = `Você audita conversas de retenção de um provedor de internet (Interlig, Altamira-PA).
Trilhas de dor do POP: A=técnica/suporte, B=valor/concorrência, C=financeira, D=mudança/cobertura, E=atendimento, F=falta de uso.

TRANSCRIPT (CLI=cliente, AGE=agente):
${transcript.slice(0, 9000)}

REGISTRO DA AGENTE: motivo="${registroAgente.motivo ?? "-"}", alçada="${registroAgente.alcada ?? "-"}", desfecho="${registroAgente.desfecho ?? "-"}"

Responda SÓ um JSON:
{"motivo_real": "o que o cliente de fato disse, curto",
 "trilha_sugerida": "A|B|C|D|E|F",
 "oferta_feita": "o que a agente ofereceu, ou 'nenhuma'",
 "desfecho_aparente": "aceitou|recusou|sem_resposta|transferido|indefinido",
 "divergencia": "se o registro da agente contradiz a conversa, explique em 1 frase; senão null",
 "aderencia_pop": "1 frase: diagnosticou antes de ofertar? avançou alçada só após recusa?",
 "resumo": "2 frases objetivas do atendimento"}`;
  return extrairJson<AnaliseRetencao>(await chamarAnalista(prompt));
}

export type FollowupComercial = {
  interesse: "quente" | "morno" | "frio" | "perdido";
  situacao: string;
  pendencia: string;
  proxima_acao: string;
  quando: string;
};

/**
 * Follow-up comercial: lê a conversa de venda e devolve a próxima ação
 * concreta — o que o time precisa fazer amanhã de manhã, por lead.
 */
export async function analisarFollowupComercial(
  transcript: string,
  contexto: { equipe?: string | null; agente?: string | null }
): Promise<FollowupComercial | null> {
  const prompt = `Você é o analista comercial de um provedor de internet (planos residenciais fibra 400MB/800MB/1GB).
Leia a conversa de venda e diga o que o time deve fazer em seguida.

CONVERSA (CLI=cliente, AGE=agente${contexto.agente ? ` ${contexto.agente}` : ""}):
${transcript.slice(0, 9000)}

Responda SÓ um JSON:
{"interesse": "quente|morno|frio|perdido",
 "situacao": "1 frase: onde a negociação parou",
 "pendencia": "o que falta para fechar (documento, decisão, cobertura...)",
 "proxima_acao": "ação concreta e específica para o agente executar",
 "quando": "urgência sugerida: hoje|amanhã cedo|esta semana"}`;
  return extrairJson<FollowupComercial>(await chamarAnalista(prompt, 500));
}
