import "server-only";
import type { Conversa } from "@/lib/sz/conversas";

export type ResumoIa = {
  resumo: string;
  proxima: string;
  urgencia: "alta" | "media" | "baixa";
};

const SISTEMA = `Você é analista comercial de um provedor de internet (Interlig, região de Altamira/PA).
Recebe a transcrição de UMA conversa de WhatsApp entre um lead e a equipe comercial.
Responda SOMENTE um JSON: {"resumo": "...", "proxima": "...", "urgencia": "alta|media|baixa"}.
- resumo: 1-3 frases objetivas do que o cliente quer e onde a conversa parou (cidade, PF/PJ, plano de interesse, etapa).
- proxima: a ação de continuidade que a vendedora deve fazer no dia seguinte.
- urgencia: "alta" se há negociação avançada parada (escolheu plano, pediu viabilidade, é PJ/licitação, cliente aguardando resposta); "media" em atendimento normal em andamento; "baixa" se lead frio, sem resposta ou abandonado.
Escreva em português do Brasil, tom direto de operação de vendas.`;

function transcricao(c: Conversa): string {
  return c.dialogo
    .filter((m) => m.quem !== "SISTEMA")
    .map((m) => `${m.quem}: ${m.texto}`)
    .join("\n")
    .slice(0, 6000);
}

/** Fallback sem IA: heurística simples, marcada como automática. */
function heuristico(c: Conversa): ResumoIa {
  const cliente = c.dialogo.filter((m) => m.quem === "CLIENTE").map((m) => m.texto);
  const mostrouPlano = c.dialogo.some((m) => m.quem === "AGENTE" && /plano|recomendo|R\$|mensalidade/i.test(m.texto));
  const ultima = c.dialogo[c.dialogo.length - 1];
  const clienteEsperando = ultima?.quem === "CLIENTE";
  const semResposta = cliente.length <= 1;
  const urgencia: ResumoIa["urgencia"] =
    mostrouPlano && (clienteEsperando || true) ? "alta" : semResposta ? "baixa" : "media";
  const resumo =
    `Lead de ${c.equipe.replace("Comercial ", "")} atendido por ${c.agente ?? "—"}. ` +
    (cliente[0] ? `Pediu: "${cliente[0].slice(0, 90)}". ` : "") +
    (mostrouPlano ? "Plano já apresentado. " : "") +
    `(resumo automático — sem IA)`;
  const proxima = mostrouPlano
    ? "Retomar de onde parou e conduzir para assinatura do contrato."
    : semResposta
      ? "Reabordar com mensagem curta oferecendo os planos mais vendidos."
      : "Dar sequência à qualificação e enviar a recomendação de plano.";
  return { resumo, proxima, urgencia };
}

/** Gera o resumo com a API Anthropic quando houver chave; senão, heurística. */
export async function gerarResumo(c: Conversa): Promise<ResumoIa> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return heuristico(c);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 400,
        system: SISTEMA,
        messages: [{ role: "user", content: `Equipe: ${c.equipe}\nCliente: ${c.nome}\n\nTranscrição:\n${transcricao(c)}` }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return heuristico(c);
    const j = (await r.json()) as { content?: { text?: string }[] };
    const txt = j.content?.[0]?.text ?? "";
    const obj = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) as ResumoIa;
    const urg = ["alta", "media", "baixa"].includes(obj.urgencia) ? obj.urgencia : "media";
    return { resumo: String(obj.resumo).slice(0, 800), proxima: String(obj.proxima).slice(0, 400), urgencia: urg };
  } catch {
    return heuristico(c);
  }
}
