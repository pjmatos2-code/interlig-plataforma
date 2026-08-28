import "server-only";

export type TicketRef = {
  contrato_id: string | null;
  vendedor_id: string | null;
  plano_id: string | null;
};

export type ConsistenciaCrm = {
  ok: boolean;
  /** motivo legível quando não está consistente (para a coluna "o que falta") */
  motivo: string | null;
};

/**
 * Consistência CRM x contrato (critério D5, revisado 28/08).
 *
 * Regras:
 *  - Sem ticket → consistente (venda nativa do SGP não exige CRM — decisão D8).
 *  - Ticket SEM vendedora (não atribuído) → não bloqueia: ele não afirma nada
 *    sobre quem vendeu. Antes derrubava a liberação por comparar null com a
 *    vendedora do contrato.
 *  - Vários tickets no mesmo contrato → basta UM consistente (duplicata de
 *    reabertura/robô não pode travar a comissão de uma venda legítima).
 *  - Divergência real (ticket com OUTRA vendedora, ou outro plano) → bloqueia,
 *    com o motivo nomeado para a gestão decidir.
 */
export function consistenciaCrm(
  tickets: TicketRef[],
  contrato: { vendedor_id: string | null; plano_id: string | null },
  nomeVendedor: (id: string | null) => string
): ConsistenciaCrm {
  const relevantes = tickets.filter((t) => t.vendedor_id !== null);
  if (relevantes.length === 0) return { ok: true, motivo: null };

  const divergencias: string[] = [];
  for (const t of relevantes) {
    const vendedoraOk = t.vendedor_id === contrato.vendedor_id;
    const planoOk =
      t.plano_id === null || contrato.plano_id === null || t.plano_id === contrato.plano_id;
    if (vendedoraOk && planoOk) return { ok: true, motivo: null }; // basta um bater
    if (!vendedoraOk)
      divergencias.push(
        `ticket é de ${nomeVendedor(t.vendedor_id)}, contrato é de ${nomeVendedor(contrato.vendedor_id)}`
      );
    else divergencias.push("plano do ticket difere do contrato");
  }
  return { ok: false, motivo: `CRM divergente: ${divergencias[0]}` };
}
