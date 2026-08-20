/**
 * Regras de cálculo do CRM — seção 5 do PRD (5.14 a 5.17) e regras de ciclo
 * de vida do ticket (fechamento automático e reabertura, PRD 3.9).
 * Funções puras, testadas em crm.test.ts.
 */

export type TicketIndicador = {
  criado_em: string; // timestamptz ISO
  primeira_tratativa_em: string | null;
  fechado_em: string | null;
  etapa: string;
  desfecho: "convertido" | "nao_convertido" | null;
  contrato_id: string | null;
  reconciliado_em: string | null;
  atualizado_em: string;
};

/** Parâmetros do CRM (PRD 3.10) — padrões; sobrescritos por env no runtime. */
export const CRM_PADROES = {
  diasInatividade: 15,
  diasAvisoAntes: 3, // aviso no dia N−3
  diasReabertura: 30,
  diasReconciliacao: 7,
};

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

const horas = (deIso: string, ateIso: string) =>
  (Date.parse(ateIso) - Date.parse(deIso)) / 3_600_000;

/**
 * 5.14 — taxa de conversão real: fechados como convertidos ÷ fechados no
 * conjunto. Fechados por inatividade já vêm como não convertidos e contam no
 * denominador — é isso que torna o número auditável.
 */
export function conversaoReal(tickets: TicketIndicador[]): {
  taxa: number | null;
  fechados: number;
  convertidos: number;
} {
  const fechados = tickets.filter((t) => t.etapa === "fechado");
  const convertidos = fechados.filter((t) => t.desfecho === "convertido").length;
  return {
    taxa: fechados.length === 0 ? null : convertidos / fechados.length,
    fechados: fechados.length,
    convertidos,
  };
}

/** 5.15 — mediana de (primeira tratativa − criação), em minutos. */
export function tempoPrimeiraTratativa(tickets: TicketIndicador[]): number | null {
  const minutos = tickets
    .filter((t) => t.primeira_tratativa_em !== null)
    .map((t) => horas(t.criado_em, t.primeira_tratativa_em!) * 60)
    .filter((m) => m >= 0);
  return mediana(minutos);
}

/** 5.16 — mediana de (fechamento − criação), em dias, por desfecho. */
export function cicloNegociacao(
  tickets: TicketIndicador[],
  desfecho: "convertido" | "nao_convertido"
): number | null {
  const diasLista = tickets
    .filter((t) => t.etapa === "fechado" && t.desfecho === desfecho && t.fechado_em)
    .map((t) => horas(t.criado_em, t.fechado_em!) / 24);
  return mediana(diasLista);
}

/**
 * 5.17 — taxa de reconciliação: convertidos com contrato do SGP vinculado em
 * ≤ 7 dias do fechamento ÷ convertidos. Meta ≥ 95%.
 */
export function taxaReconciliacao(
  tickets: TicketIndicador[],
  janelaDias = CRM_PADROES.diasReconciliacao
): { taxa: number | null; convertidos: number; reconciliados: number } {
  const convertidos = tickets.filter(
    (t) => t.etapa === "fechado" && t.desfecho === "convertido"
  );
  const reconciliados = convertidos.filter(
    (t) =>
      t.contrato_id !== null &&
      t.reconciliado_em !== null &&
      horas(t.fechado_em!, t.reconciliado_em) / 24 <= janelaDias
  ).length;
  return {
    taxa: convertidos.length === 0 ? null : reconciliados / convertidos.length,
    convertidos: convertidos.length,
    reconciliados,
  };
}

/**
 * Fechamento automático por inatividade (PRD 3.9): ticket aberto sem interação
 * há N dias fecha como "não convertido — sem resposta". Devolve o estado:
 * fechar | avisar (faltando ≤ 3 dias) | ok.
 */
export function estadoInatividade(
  ticket: Pick<TicketIndicador, "etapa" | "atualizado_em">,
  agoraIso: string,
  diasInatividade = CRM_PADROES.diasInatividade,
  diasAviso = CRM_PADROES.diasAvisoAntes
): { situacao: "fechar" | "avisar" | "ok"; diasParado: number; fechaEmDias: number } {
  const diasParado = horas(ticket.atualizado_em, agoraIso) / 24;
  const fechaEmDias = diasInatividade - diasParado;
  if (ticket.etapa === "fechado")
    return { situacao: "ok", diasParado, fechaEmDias: Infinity };
  if (fechaEmDias <= 0) return { situacao: "fechar", diasParado, fechaEmDias: 0 };
  if (fechaEmDias <= diasAviso) return { situacao: "avisar", diasParado, fechaEmDias };
  return { situacao: "ok", diasParado, fechaEmDias };
}

/**
 * Reabertura (PRD 3.9): cliente que volta em até 30 dias após fechamento
 * "não convertido" reabre o ticket (preserva histórico). Convertido não reabre.
 */
export function podeReabrir(
  ticket: Pick<TicketIndicador, "etapa" | "desfecho" | "fechado_em">,
  agoraIso: string,
  diasReabertura = CRM_PADROES.diasReabertura
): boolean {
  if (ticket.etapa !== "fechado" || ticket.desfecho !== "nao_convertido" || !ticket.fechado_em)
    return false;
  return horas(ticket.fechado_em, agoraIso) / 24 <= diasReabertura;
}

/** Normaliza telefone para comparação (anti-duplicidade e reconciliação). */
export function normalizarTelefone(telefone: string | null | undefined): string {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  // descarta DDI 55 e zeros à esquerda; compara pelos últimos 10–11 dígitos
  return digitos.replace(/^0+/, "").replace(/^55(?=\d{10,11}$)/, "");
}

/** Normaliza CPF para comparação. */
export function normalizarCpf(cpf: string | null | undefined): string {
  return (cpf ?? "").replace(/\D/g, "");
}
