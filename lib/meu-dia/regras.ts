/**
 * Meu Dia — regras puras (14/10/2026). Recebem dados, devolvem a fila/missão.
 * Cada uma tem teste em regras.test.ts. A tela e a visão do gestor só
 * consomem o que sai daqui.
 */

// ---------------------------------------------------------------------------
// Bloco 2 — Follow-up: cada ticket em UMA sub-fila, nesta precedência
// ---------------------------------------------------------------------------

export type SubFila = "atrasado" | "hoje" | "urgencia" | "parada";

export const ROTULO_SUBFILA: Record<SubFila, string> = {
  atrasado: "Retornos atrasados",
  hoje: "Retornos de hoje",
  urgencia: "Urgência alta (IA)",
  parada: "Negociação parada",
};

/** etapas de negociação (fora "Sem contato", que é o Bloco 1) */
export const ETAPAS_NEGOCIACAO = ["em_atendimento", "aguardando", "proposta"];

/** horas sem movimentação para a negociação contar como parada */
export const HORAS_PARADA = 12;

export type TicketFollowup = {
  etapa: string;
  /** retorno agendado no ticket (pendente enquanto não for null) */
  followupEm: string | null;
  urgencia: string | null;
  /** quando o ticket teve a última movimentação feita por gente */
  ultimaMovimentacao: string;
  /** lembretes ⏰ ainda não concluídos (data/hora ISO) */
  lembretesPendentes: string[];
  /** houve tratativa registrada hoje — conclui o follow-up do dia */
  tratativaHoje: boolean;
};

/** data civil (aaaa-mm-dd) de um ISO no fuso de Santarém */
export function diaLocal(iso: string): string {
  return new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);
}

export function classificarFollowup(t: TicketFollowup, agoraIso: string): SubFila | null {
  if (t.etapa === "fechado" || t.etapa === "novo" || t.etapa === "pre_cadastro") return null;
  if (t.tratativaHoje) return null;
  const hoje = diaLocal(agoraIso);
  const agendados = [...(t.followupEm ? [t.followupEm] : []), ...t.lembretesPendentes].map(diaLocal);
  if (agendados.some((d) => d < hoje)) return "atrasado";
  if (agendados.some((d) => d === hoje)) return "hoje";
  if (t.urgencia === "alta") return "urgencia";
  // com retorno futuro marcado a negociação não está parada: está agendada
  const temFuturo = agendados.some((d) => d > hoje);
  const parada = Date.parse(agoraIso) - Date.parse(t.ultimaMovimentacao) > HORAS_PARADA * 3600_000;
  if (ETAPAS_NEGOCIACAO.includes(t.etapa) && parada && !temFuturo) return "parada";
  return null;
}

// ---------------------------------------------------------------------------
// Bloco 3 — Esteira: o que falta em cada ticket/venda
// ---------------------------------------------------------------------------

export type PendenciaEsteira = "sem_proposta" | "sem_consulta" | "sem_assinatura" | "adiantamento";

export const ROTULO_PENDENCIA: Record<PendenciaEsteira, string> = {
  sem_proposta: "Cadastrar a proposta",
  sem_consulta: "Anexar a consulta de crédito (Consult Center)",
  sem_assinatura: "Cliente assinar termo/fidelidade no SGP",
  adiantamento: "Confirmar o adiantamento",
};

export type TicketEsteira = {
  etapa: string;
  desfecho: string | null;
  propostas: number;
  consultas: number;
  adiantamentoValor: number | null;
  adiantamentoRecebidoEm: string | null;
  scoreFaixa: string | null;
};

/** "Criação do contrato" é a etapa avançada do funil */
export function pendenciasTicket(t: TicketEsteira): PendenciaEsteira[] {
  const p: PendenciaEsteira[] = [];
  const aberto = t.etapa !== "fechado";
  if (aberto && t.etapa === "aguardando") {
    if (t.propostas === 0) p.push("sem_proposta");
    if (t.consultas === 0) p.push("sem_consulta");
  }
  const vale = aberto || t.desfecho === "convertido";
  if (
    vale &&
    (t.adiantamentoValor ?? 0) > 0 &&
    !t.adiantamentoRecebidoEm &&
    (t.scoreFaixa === "amarelo" || t.scoreFaixa === "vermelho")
  )
    p.push("adiantamento");
  return p;
}

export type ContratoEsteira = {
  status: string;
  termoAssinado: boolean | null;
  fidelidadeAssinada: boolean | null;
  assinaturaDispensada: boolean | null;
  desistenciaEm: string | null;
};

export function contratoSemAssinatura(c: ContratoEsteira): boolean {
  if (c.assinaturaDispensada || c.desistenciaEm) return false;
  if (!["pendente_assinatura", "aguardando_ativacao", "ativo"].includes(c.status)) return false;
  return !c.termoAssinado || !c.fidelidadeAssinada;
}

// ---------------------------------------------------------------------------
// Bloco 5 — Pendentes 90+: vendidos nos últimos 90 dias, hoje suspensos ou
// cancelados — só quem CHEGOU A SER INSTALADO (gestor, 14/10/2026)
// ---------------------------------------------------------------------------

export type ContratoPendente = {
  dataVenda: string;
  status: string;
  desistenciaEm: string | null;
  /** situação antes do cancelamento no relatório do SGP (Ativo, Suspenso, Inativo, Novo) */
  statusAnteriorCancelamento: string | null;
};

export function ehPendente90(c: ContratoPendente, hoje: string): boolean {
  const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  if (c.dataVenda < limite || c.dataVenda > hoje) return false;
  if (c.desistenciaEm) return false;
  if (c.status === "suspenso") return true; // suspensão pressupõe instalação
  if (c.status !== "cancelado") return false;
  // cancelou antes de instalar (Inativo/Novo) ou sem registro oficial: fora
  return c.statusAnteriorCancelamento === "Ativo" || c.statusAnteriorCancelamento === "Suspenso";
}

// ---------------------------------------------------------------------------
// Bloco 6 — Meta do dia
// ---------------------------------------------------------------------------

/** dias úteis de hoje (incluso) até o fim do mês */
export function diasUteisRestantes(calendario: { data: string; dia_util: boolean }[], hoje: string): number {
  const fim = `${hoje.slice(0, 7)}-31`;
  return calendario.filter((d) => d.dia_util && d.data >= hoje && d.data <= fim && d.data.slice(0, 7) === hoje.slice(0, 7)).length;
}

export function metaDoDia(
  metaMes: number,
  realizadoMes: number,
  diasRestantes: number
): { metaDia: number; batida: boolean; falta: number } {
  const falta = Math.max(0, metaMes - realizadoMes);
  if (metaMes > 0 && falta === 0) return { metaDia: 0, batida: true, falta: 0 };
  // domingo/feriado no fim do mês: ainda assim mostra o que falta num dia
  return { metaDia: Math.ceil(falta / Math.max(1, diasRestantes)), batida: false, falta };
}
