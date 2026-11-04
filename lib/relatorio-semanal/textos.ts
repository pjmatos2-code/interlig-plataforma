import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { DadosRelatorio, TextosRelatorio } from "./tipos";

/**
 * Textos do relatório (veredito, insights, quem cobrar, perguntas, sugestões
 * do checklist e as linhas do e-mail), escritos pelo Claude a partir dos
 * números já calculados. O Claude não calcula status nem inventa número: o
 * placar chega pronto e o prompt proíbe número que não esteja nos dados.
 *
 * Chave e modelo: integracoes_config, sistema 'anthropic' (a mesma chave dos
 * outros usos). O relatório usa `modelo_relatorio` quando existir; senão, o
 * Opus — é um texto por semana, para o CEO.
 */

const MODELO_PADRAO = "claude-opus-5-5";

const Item = z.object({
  destaque: z.string().describe("começo da frase em negrito; pode ser vazio"),
  texto: z.string(),
});
const Bloco = z.object({
  cobrarDe: z.string(),
  oQueCobrar: z.array(z.string()),
  perguntaChave: z.string(),
  cadencia: z.string(),
  sinalDeMelhora: z.string(),
});
const Esquema = z.object({
  veredito: z.string(),
  insights: z.object({ neutra: z.array(Item), advogado: z.array(Item), estrategica: z.array(Item) }),
  cobranca: z.object({ base: Bloco, esteira: Bloco, retencao: Bloco }),
  perguntasSemana: z.array(z.object({ pergunta: z.string(), contexto: z.string() })),
  sugestoesChecklist: z.array(z.string()),
  email: z.object({ melhor: z.string(), pior: z.string(), base: z.string(), criticos: z.string(), decidir: z.string() }),
});

const SISTEMA = `Você escreve o Relatório Comercial Semanal da Interlig, provedor de internet fibra no Pará (praças Altamira, Vitória do Xingu e Brasil Novo). Quem lê é o CEO, Estevam, que usa o relatório para cobrar o Paulo, diretor comercial, na reunião de segunda-feira.

Regras, sem exceção:
1. Português do Brasil, frases curtas e diretas, tom respeitoso. Escreva para quem decide, não para quem opera o sistema.
2. Use SOMENTE números que estão nos dados. Se fizer uma conta, marque com ≈ e diga que é estimativa. Nunca invente número, nome, data ou fato.
3. Não escreva nome de cliente. Contrato aparece pelo número (#22973). Nome de vendedor e de agente pode aparecer.
4. O status de cada indicador do placar já vem calculado pela plataforma. Não contradiga o status.
5. Quando um dado parecer errado ou incoerente, diga que é para conferir no sistema, sem tirar conclusão sobre ele. A lista "conferir" traz as incoerências já encontradas.
6. Seja específico: diga quem, quanto e até quando. Evite frases genéricas como "melhorar o processo".
7. Não use emoji nem markdown.`;

function instrucoes(d: DadosRelatorio, anterior: { checklist: string[]; statusAnterior: Record<string, string> } | null) {
  return `Dados da semana (JSON; valores em reais por mês; datas aaaa-mm-dd):
${JSON.stringify(d)}

${anterior ? `Relatório anterior: status do placar ${JSON.stringify(anterior.statusAnterior)}; checklist combinado na reunião: ${JSON.stringify(anterior.checklist)}.` : "Não há relatório anterior guardado."}

Escreva:
- veredito: 2 ou 3 frases (até 60 palavras) com a leitura da semana: o que foi bem, o que preocupa e o tamanho disso.
- insights.neutra: 4 itens com os fatos principais, sem opinião.
- insights.advogado: 5 a 7 itens com os riscos e o que os números escondem (dependência de poucas pessoas, qualidade da venda, fila de débito, dados que não fecham).
- insights.estrategica: 4 ou 5 itens com o que fazer para chegar à meta do ano e o que vale mais a pena.
  Em cada item, "destaque" é o começo da frase que vai em negrito (pode ficar vazio) e "texto" é o resto.
- cobranca.base, cobranca.esteira e cobranca.retencao: para cada área, de quem cobrar, 3 a 5 coisas concretas a cobrar (com números e contratos quando houver), a pergunta-chave para a reunião, a cadência de acompanhamento e o sinal de que melhorou. Na retenção, quem executa é a Sandryne Souza e quem responde pelo resultado é o Paulo.
- perguntasSemana: 5 ou 6 perguntas para a reunião, cada uma com um contexto curto (os números que justificam a pergunta).
- sugestoesChecklist: até 5 ações para o checklist do Paulo até a próxima segunda, cada uma com quem faz o quê.
- email: 5 frases curtas para o corpo do e-mail ao CEO:
  melhor = "Melhor indicador: …"; pior = "Pior indicador: …"; base = "Base de ativos: …"; criticos = quantos dos dez estão críticos e quais (ex.: "Seis dos dez indicadores estão críticos: …"); decidir = "Para decidir com o Paulo: …".`;
}

export async function escreverTextos(
  d: DadosRelatorio,
  anterior: { checklist: string[]; statusAnterior: Record<string, string> } | null
): Promise<TextosRelatorio> {
  const { data } = await criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "anthropic").maybeSingle();
  const cfg = (data?.config ?? {}) as { api_key?: string; modelo_relatorio?: string };
  if (!cfg.api_key) throw new Error("Chave da API Anthropic não configurada.");
  const cliente = new Anthropic({ apiKey: cfg.api_key, timeout: 240_000, maxRetries: 1 });
  const stream = cliente.messages.stream({
    model: cfg.modelo_relatorio || MODELO_PADRAO,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    system: SISTEMA,
    messages: [{ role: "user", content: instrucoes(d, anterior) }],
    output_config: { format: zodOutputFormat(Esquema) },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "max_tokens") throw new Error("o texto passou do limite de tamanho");
  if (msg.stop_reason === "refusal") throw new Error("o modelo recusou escrever os textos");
  const t = msg.parsed_output;
  if (!t) throw new Error("o modelo não devolveu os textos no formato esperado");
  // limites do modelo da diretoria (o formato não aceita mínimo/máximo)
  return {
    ...t,
    insights: { neutra: t.insights.neutra.slice(0, 6), advogado: t.insights.advogado.slice(0, 8), estrategica: t.insights.estrategica.slice(0, 6) },
    perguntasSemana: t.perguntasSemana.slice(0, 6),
    sugestoesChecklist: t.sugestoesChecklist.slice(0, 5),
  };
}
