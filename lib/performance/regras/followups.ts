/**
 * Avaliação de follow-up (24/10/2026) — puro, testado em followups.test.ts.
 *
 * Um retorno agendado é dado como FEITO pela 1ª ação humana no lead depois
 * do agendamento (passada a carência, para a própria conversa em que foi
 * agendado não contar): mensagem do vendedor no chat, tratativa, proposta,
 * visita, mudança de etapa ou fechamento — ou quando alguém marca como feito.
 *  - feito até o limite → concluido_prazo; depois → concluido_atraso
 *  - limite = fim do dia do prazo (tolerância padrão) ou o horário exato
 *  - lead fechado antes do limite sem ação → cancelado (sai do denominador)
 *  - passou do limite sem ação → vencido (conta contra)
 *  - vence hoje → pendente; depois de hoje → programado
 * Sugestão da IA (sugerido) e rejeitada não mudam sozinhas.
 */

export type StatusFollowup =
  | "sugerido"
  | "programado"
  | "pendente"
  | "concluido_prazo"
  | "concluido_atraso"
  | "vencido"
  | "cancelado"
  | "rejeitado";

export type FollowupAvaliavel = {
  status: StatusFollowup;
  prazo: string;
  criadoEm: string;
  /** conclusão marcada à mão (tem precedência sobre a detecção) */
  concluidoManualEm?: string | null;
  canceladoEm?: string | null;
};

export type AvaliacaoFollowup = {
  status: StatusFollowup;
  concluidoEm: string | null;
  evidencia: string | null;
};

export type AtividadeHumana = { em: string; fonte: string };

const DIA = 86_400_000;

/** fim do dia (23:59:59.999) do prazo, no fuso de Santarém */
export function fimDoDiaSantarem(iso: string): number {
  const ms = Date.parse(iso);
  const dia = new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
  return Date.parse(`${dia}T00:00:00-03:00`) + DIA - 1;
}

export function avaliarFollowup(
  f: FollowupAvaliavel,
  atividades: AtividadeHumana[],
  ticketFechadoEm: string | null,
  agoraIso: string,
  opts: { tolerancia: "fim_do_dia" | "horario_exato"; carenciaMin: number }
): AvaliacaoFollowup {
  if (f.status === "sugerido" || f.status === "rejeitado") return { status: f.status, concluidoEm: null, evidencia: null };
  if (f.status === "cancelado" && f.canceladoEm) return { status: "cancelado", concluidoEm: null, evidencia: null };

  const limite = opts.tolerancia === "fim_do_dia" ? fimDoDiaSantarem(f.prazo) : Date.parse(f.prazo);
  const desde = Date.parse(f.criadoEm) + opts.carenciaMin * 60_000;

  if (f.concluidoManualEm) {
    const em = Date.parse(f.concluidoManualEm);
    return { status: em <= limite ? "concluido_prazo" : "concluido_atraso", concluidoEm: f.concluidoManualEm, evidencia: "marcado como feito" };
  }
  const primeira = atividades
    .filter((a) => Number.isFinite(Date.parse(a.em)) && Date.parse(a.em) >= desde)
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em))[0];
  if (primeira) {
    const em = Date.parse(primeira.em);
    return { status: em <= limite ? "concluido_prazo" : "concluido_atraso", concluidoEm: new Date(em).toISOString(), evidencia: primeira.fonte };
  }
  if (ticketFechadoEm && Date.parse(ticketFechadoEm) <= limite) return { status: "cancelado", concluidoEm: null, evidencia: "lead fechado antes do prazo" };
  const agora = Date.parse(agoraIso);
  if (agora > limite) return { status: "vencido", concluidoEm: null, evidencia: null };
  const hoje = new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);
  const diaPrazo = new Date(Date.parse(f.prazo) - 3 * 3_600_000).toISOString().slice(0, 10);
  return { status: diaPrazo <= hoje ? "pendente" : "programado", concluidoEm: null, evidencia: null };
}

/** status que contam como "devidos" na taxa de execução (vencimento no período) */
export const STATUS_DEVIDOS: StatusFollowup[] = ["concluido_prazo", "concluido_atraso", "vencido"];
export const STATUS_ABERTOS: StatusFollowup[] = ["programado", "pendente", "vencido"];

/**
 * Prioridade da fila inteligente (maior = mais urgente). Critérios na ordem
 * da spec: intenção comercial, urgência, tempo sem interação, vencimento,
 * etapa e valor. A probabilidade estimada nunca é tratada como certeza —
 * entra só como desempate leve.
 */
export function pontuarPrioridade(x: {
  intencaoCompra: boolean | null;
  temperatura: "quente" | "morno" | "frio" | "indeterminado" | null;
  urgenciaAlta: boolean;
  horasSemInteracao: number | null;
  vencidoHoras: number; // > 0 = atrasado
  etapa: string | null;
  valorEstimado: number | null;
  prioridadeDeclarada: "alta" | "media" | "baixa";
}): number {
  let p = 0;
  if (x.intencaoCompra) p += 30;
  if (x.temperatura === "quente") p += 20;
  else if (x.temperatura === "morno") p += 8;
  if (x.urgenciaAlta) p += 15;
  if (x.horasSemInteracao !== null) p += Math.min(15, x.horasSemInteracao / 4);
  if (x.vencidoHoras > 0) p += Math.min(20, 8 + x.vencidoHoras / 6);
  if (x.etapa === "aguardando") p += 10;
  else if (x.etapa === "em_atendimento") p += 4;
  if (x.valorEstimado) p += Math.min(5, x.valorEstimado / 40);
  p += x.prioridadeDeclarada === "alta" ? 10 : x.prioridadeDeclarada === "media" ? 4 : 0;
  return Math.round(p * 10) / 10;
}
