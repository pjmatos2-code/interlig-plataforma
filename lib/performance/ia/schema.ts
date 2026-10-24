/**
 * Saída estruturada da análise de conversa (24/10/2026). O provedor recebe
 * só TIPOS e ENUMS (o recurso de saída estruturada garante o formato); os
 * limites de tamanho/faixa são aplicados aqui em sanearAnalise, que roda
 * SEMPRE antes de gravar — o que vier do modelo é dado não confiável.
 * Puro: testado em schema.test.ts.
 */
import { z } from "zod";

export const VERSAO_ANALISE = "ia-1.1";

export const OBJECOES = [
  "preco",
  "fidelidade",
  "taxa_instalacao",
  "prazo_instalacao",
  "cobertura",
  "concorrencia",
  "qualidade_conexao",
  "atendimento",
  "consultar_terceiro",
  "falta_interesse",
  "outra",
] as const;
export const ROTULO_OBJECAO: Record<(typeof OBJECOES)[number], string> = {
  preco: "Preço",
  fidelidade: "Fidelidade",
  taxa_instalacao: "Taxa de instalação",
  prazo_instalacao: "Prazo de instalação",
  cobertura: "Cobertura",
  concorrencia: "Concorrência",
  qualidade_conexao: "Qualidade da conexão",
  atendimento: "Atendimento",
  consultar_terceiro: "Precisa consultar alguém",
  falta_interesse: "Falta de interesse",
  outra: "Outra",
};

export const CRITERIOS = [
  "clareza",
  "cordialidade",
  "identificacao_necessidade",
  "explicacao_planos",
  "conducao_negociacao",
  "tratamento_objecoes",
  "proatividade",
  "proximos_passos",
  "tentativa_fechamento",
  "conformidade_comercial",
] as const;
export type Criterio = (typeof CRITERIOS)[number];
export const ROTULO_CRITERIO: Record<Criterio, string> = {
  clareza: "Clareza da comunicação",
  cordialidade: "Cordialidade",
  identificacao_necessidade: "Identificação da necessidade",
  explicacao_planos: "Explicação correta dos planos",
  conducao_negociacao: "Condução da negociação",
  tratamento_objecoes: "Tratamento de objeções",
  proatividade: "Proatividade",
  proximos_passos: "Orientação sobre próximos passos",
  tentativa_fechamento: "Tentativa adequada de fechamento",
  conformidade_comercial: "Conformidade com as condições vigentes",
};

export const OPORTUNIDADES = [
  "instalacao_sem_retorno",
  "contrato_solicitado_sem_avanco",
  "valor_solicitado_sem_resposta",
  "cobertura_confirmada_sem_continuidade",
  "intencao_sem_atendimento",
  "proposta_sem_acompanhamento",
  "horario_pedido_nao_atendido",
  "outra",
] as const;
export const ROTULO_OPORTUNIDADE: Record<(typeof OPORTUNIDADES)[number], string> = {
  instalacao_sem_retorno: "Pediu instalação e não teve retorno",
  contrato_solicitado_sem_avanco: "Pediu o contrato e a venda não avançou",
  valor_solicitado_sem_resposta: "Pediu o valor e ficou esperando",
  cobertura_confirmada_sem_continuidade: "Cobertura confirmada sem continuidade",
  intencao_sem_atendimento: "Intenção de compra sem atendimento",
  proposta_sem_acompanhamento: "Proposta enviada sem acompanhamento",
  horario_pedido_nao_atendido: "Pediu contato num horário e não foi atendido",
  outra: "Outra oportunidade",
};

/** schema enviado ao provedor: só tipos e enums (sem limites de tamanho) */
export const SchemaAnalise = z.object({
  temperatura: z.enum(["quente", "morno", "frio", "indeterminado"]),
  intencao_compra: z.boolean(),
  sinais_intencao: z.array(z.string()),
  objecoes: z.array(z.enum(OBJECOES)),
  status_lead: z.enum(["a_fazer", "assinou", "perdido", "sem_cobertura", "em_espera", "atencao", "encerrado"]),
  onde_parou: z.enum(["cliente_aguardando_resposta", "vendedor_aguardando_cliente", "conversa_encerrada"]),
  resumo: z.string(),
  interesse_principal: z.string().nullable(),
  plano_interesse: z.string().nullable(),
  necessidade: z.string().nullable(),
  estagio_estimado: z.enum(["descoberta", "qualificacao", "proposta", "negociacao", "fechamento", "pos_venda", "perdido"]),
  proximo_passo: z.string(),
  prioridade: z.enum(["alta", "media", "baixa"]),
  probabilidade_fechamento: z.enum(["alta", "media", "baixa", "indeterminada"]),
  confianca: z.number(),
  evidencias: z.array(z.object({ mensagem: z.number(), motivo: z.string() })),
  qualidade_atendimento: z.array(z.object({ criterio: z.enum(CRITERIOS), nota: z.number().nullable(), justificativa: z.string() })),
  oportunidade_esquecida: z.object({ tipo: z.enum(OPORTUNIDADES), descricao: z.string() }).nullable(),
  followup_sugerido: z.object({ em_dias_uteis: z.number(), acao: z.string(), motivo: z.string() }).nullable(),
});
export type AnaliseBruta = z.infer<typeof SchemaAnalise>;

export type AnaliseSaneada = AnaliseBruta & {
  /** nota 0–100 pela rubrica configurada; null quando não houve atendimento humano */
  score_atendimento: number | null;
};

const corta = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Validação de negócio antes de gravar: faixas, tamanhos, índices de
 * evidência existentes, plano só se for um plano real do cadastro, nota de
 * atendimento só se houve atendimento humano.
 */
/**
 * Rede de segurança de privacidade: troca nomes de bairro conhecidos e
 * tokens do nome do contato que o modelo tenha deixado escapar no texto.
 */
export function apagarTermos(texto: string, termos: string[]): string {
  if (!termos.length || !texto) return texto;
  let saida = texto;
  for (const t of termos) {
    if (t.length < 4) continue;
    const padrao = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // compara sem acento: monta uma versão sem acento e localiza as posições
    const base = Array.from(saida).map((ch) => { const b = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return b.length === ch.length ? b : "#".repeat(ch.length); }).join("");
    const re = new RegExp(`\\b${padrao}\\b`, "gi");
    const trechos: [number, number][] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(base))) trechos.push([m.index, m.index + m[0].length]);
    for (const [a, b] of trechos.reverse()) saida = saida.slice(0, a) + "[omitido]" + saida.slice(b);
  }
  return saida;
}

export function sanearAnalise(
  bruto: unknown,
  ctx: { totalMensagens: number; planos: string[]; houveAtendimentoHumano: boolean; pesos: Record<string, number>; termosProibidos?: string[] }
): AnaliseSaneada | null {
  const r = SchemaAnalise.safeParse(bruto);
  if (!r.success) return null;
  const termos = ctx.termosProibidos ?? [];
  const limpa = (s: string) => apagarTermos(s, termos);
  const a = {
    ...r.data,
    resumo: limpa(r.data.resumo),
    proximo_passo: limpa(r.data.proximo_passo),
    interesse_principal: r.data.interesse_principal ? limpa(r.data.interesse_principal) : null,
    necessidade: r.data.necessidade ? limpa(r.data.necessidade) : null,
    sinais_intencao: r.data.sinais_intencao.map(limpa),
    evidencias: r.data.evidencias.map((e) => ({ ...e, motivo: limpa(e.motivo) })),
    qualidade_atendimento: r.data.qualidade_atendimento.map((q) => ({ ...q, justificativa: limpa(q.justificativa) })),
    oportunidade_esquecida: r.data.oportunidade_esquecida ? { ...r.data.oportunidade_esquecida, descricao: limpa(r.data.oportunidade_esquecida.descricao) } : null,
    followup_sugerido: r.data.followup_sugerido ? { ...r.data.followup_sugerido, acao: limpa(r.data.followup_sugerido.acao), motivo: limpa(r.data.followup_sugerido.motivo) } : null,
  };
  const planoReal = a.plano_interesse ? ctx.planos.find((p) => semAcento(p) === semAcento(a.plano_interesse!)) ?? null : null;
  const criterios = new Map<string, { criterio: Criterio; nota: number | null; justificativa: string }>();
  for (const q of a.qualidade_atendimento) {
    if (criterios.has(q.criterio)) continue;
    const nota = q.nota === null || !Number.isFinite(q.nota) ? null : Math.max(0, Math.min(10, Math.round(q.nota)));
    criterios.set(q.criterio, { criterio: q.criterio, nota, justificativa: corta(q.justificativa, 200) });
  }
  const aplicaveis = [...criterios.values()].filter((c) => c.nota !== null && (ctx.pesos[c.criterio] ?? 0) > 0);
  const pesoTotal = aplicaveis.reduce((s, c) => s + (ctx.pesos[c.criterio] ?? 0), 0);
  const score =
    ctx.houveAtendimentoHumano && pesoTotal > 0
      ? Math.round((aplicaveis.reduce((s, c) => s + (c.nota as number) * 10 * (ctx.pesos[c.criterio] ?? 0), 0) / pesoTotal) * 10) / 10
      : null;
  return {
    ...a,
    sinais_intencao: a.sinais_intencao.map((s) => corta(s, 120)).filter(Boolean).slice(0, 5),
    objecoes: [...new Set(a.objecoes)].slice(0, 6),
    resumo: corta(a.resumo, 500),
    interesse_principal: a.interesse_principal ? corta(a.interesse_principal, 200) : null,
    plano_interesse: planoReal,
    necessidade: a.necessidade ? corta(a.necessidade, 200) : null,
    proximo_passo: corta(a.proximo_passo, 240),
    confianca: Number.isFinite(a.confianca) ? Math.max(0, Math.min(1, Math.round(a.confianca * 1000) / 1000)) : 0,
    evidencias: a.evidencias
      .filter((e) => Number.isInteger(e.mensagem) && e.mensagem >= 1 && e.mensagem <= ctx.totalMensagens)
      .map((e) => ({ mensagem: e.mensagem, motivo: corta(e.motivo, 160) }))
      .slice(0, 8),
    qualidade_atendimento: ctx.houveAtendimentoHumano ? [...criterios.values()] : [],
    oportunidade_esquecida: a.oportunidade_esquecida ? { tipo: a.oportunidade_esquecida.tipo, descricao: corta(a.oportunidade_esquecida.descricao, 240) } : null,
    followup_sugerido: a.followup_sugerido
      ? {
          em_dias_uteis: Math.max(0, Math.min(10, Math.round(a.followup_sugerido.em_dias_uteis))),
          acao: corta(a.followup_sugerido.acao, 200),
          motivo: corta(a.followup_sugerido.motivo, 200),
        }
      : null,
    score_atendimento: score,
  };
}
