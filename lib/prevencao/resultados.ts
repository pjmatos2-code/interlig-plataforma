/** Resultados de contato das filas de prevenção (compartilhado com o formulário). */

/** quem trabalha as filas (direção só acompanha) */
export const PERFIS_OPERAM = ["gestor", "agente_retencao", "agente_atendimento", "supervisor"];

export type ResultadoContato =
  | "acordo" | "prometeu_pagar" | "ja_pagou" | "recusou"
  | "resolvido" | "encaminhado_tecnica" | "quer_cancelar"
  | "nao_atendeu";

export const RESULTADOS: Record<"debito" | "insatisfacao", { valor: ResultadoContato; rotulo: string }[]> = {
  debito: [
    { valor: "acordo", rotulo: "Acordo fechado" },
    { valor: "prometeu_pagar", rotulo: "Prometeu pagar" },
    { valor: "ja_pagou", rotulo: "Já pagou" },
    { valor: "recusou", rotulo: "Recusou / quer cancelar" },
    { valor: "nao_atendeu", rotulo: "Não atendeu" },
  ],
  insatisfacao: [
    { valor: "resolvido", rotulo: "Problema resolvido" },
    { valor: "encaminhado_tecnica", rotulo: "Encaminhado à técnica" },
    { valor: "quer_cancelar", rotulo: "Quer cancelar" },
    { valor: "nao_atendeu", rotulo: "Não atendeu" },
  ],
};

export const ROTULO_RESULTADO: Record<ResultadoContato, string> = Object.fromEntries(
  [...RESULTADOS.debito, ...RESULTADOS.insatisfacao].map((r) => [r.valor, r.rotulo])
) as Record<ResultadoContato, string>;

