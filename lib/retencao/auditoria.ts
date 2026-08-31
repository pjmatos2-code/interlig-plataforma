import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Auditoria da Retenção — o carimbo que a agente não controla.
 *
 * Para cada caso aberto ou retido, confere o SGP (via nossa base sincronizada):
 *  · contrato ATIVO           → retido (carimbo automático)
 *  · contrato CANCELADO       → perdido — e se cancelou até 30 dias depois de
 *    um caso já retido, marca CLAWBACK (estorna na competência seguinte)
 *  · contrato SUSPENSO        → em risco (não paga; reativou paga retroativo)
 *
 * Casos fechados manualmente como irreversível/transferido não são tocados —
 * mas um irreversível cujo contrato continua ativo aparece no painel do
 * gestor como divergência (a trava anti-lixeira).
 */

export type ResultadoAuditoria = {
  ok: boolean;
  verificados: number;
  retidos: number;
  perdidos: number;
  emRisco: number;
  clawbacks: number;
  erro?: string;
};

export async function auditarRetencao(): Promise<ResultadoAuditoria> {
  const admin = criarClienteAdmin();

  const { data: casos, error } = await admin
    .from("casos_retencao")
    .select("id, sgp_contrato_id, desfecho, desfecho_em, criado_em, clawback_em")
    .not("sgp_contrato_id", "is", null)
    .in("etapa", ["novo", "negociacao", "validacao", "fechado"])
    .limit(5000);
  if (error) return { ok: false, verificados: 0, retidos: 0, perdidos: 0, emRisco: 0, clawbacks: 0, erro: error.message };

  const cts = [...new Set((casos ?? []).map((c) => c.sgp_contrato_id as string))];
  const { data: contratos } = await admin
    .from("contratos")
    .select("sgp_contrato_id, status, data_cancelamento")
    .in("sgp_contrato_id", cts.length ? cts : ["-"]);
  const st = new Map(
    (contratos ?? []).map((c) => [
      c.sgp_contrato_id as string,
      { s: c.status as string, dc: c.data_cancelamento as string | null },
    ])
  );

  let verificados = 0, retidos = 0, perdidos = 0, emRisco = 0, clawbacks = 0;
  const agora = new Date().toISOString();

  for (const caso of casos ?? []) {
    const x = st.get(caso.sgp_contrato_id as string);
    if (!x) continue;
    verificados++;
    const atual = caso.desfecho as string | null;

    // irreversível e transferido são decisões humanas: a auditoria não mexe
    if (atual === "irreversivel" || atual === "transferido") continue;

    if (x.s === "cancelado") {
      // clawback: era retido e o cancelamento veio em até 30 dias do carimbo
      const base = (caso.desfecho_em as string) ?? (caso.criado_em as string);
      const dias = x.dc
        ? Math.round((Date.parse(x.dc) - Date.parse(base)) / 86_400_000)
        : 999;
      const ehClawback = atual === "retido" && dias >= 0 && dias <= 30 && !caso.clawback_em;
      await admin
        .from("casos_retencao")
        .update({
          etapa: "fechado",
          desfecho: "perdido",
          desfecho_em: atual === "perdido" ? caso.desfecho_em : agora,
          desfecho_auto: true,
          ...(ehClawback
            ? { clawback_em: agora, clawback_motivo: `cancelou ${dias} dia(s) após a retenção` }
            : {}),
        })
        .eq("id", caso.id);
      perdidos++;
      if (ehClawback) clawbacks++;
    } else if (x.s === "suspenso") {
      if (atual !== "em_risco") {
        await admin
          .from("casos_retencao")
          .update({ desfecho: "em_risco", desfecho_em: agora, desfecho_auto: true })
          .eq("id", caso.id);
      }
      emRisco++;
    } else if (x.s === "ativo") {
      if (atual !== "retido") {
        await admin
          .from("casos_retencao")
          .update({ etapa: "fechado", desfecho: "retido", desfecho_em: agora, desfecho_auto: true })
          .eq("id", caso.id);
      }
      retidos++;
    }
  }

  return { ok: true, verificados, retidos, perdidos, emRisco, clawbacks };
}
