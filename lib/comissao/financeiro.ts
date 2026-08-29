import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { SnapshotComissao } from "@/lib/comissao/snapshot";
import { codigoVerificacao } from "@/lib/comissao/snapshot";

/**
 * Visão do Financeiro: só competência FECHADA, sempre a partir do snapshot.
 * Nada aqui recalcula comissão — se o número mudasse entre a conferência e o
 * pagamento, o documento entregue à agente deixaria de valer.
 */

export type LinhaPagamento = {
  vendedorId: string;
  vendedora: string;
  pop: string | null;
  meta: number;
  metaEfetiva: number;
  atingimentoPct: number;
  faixa: string;
  vendasLiberadas: number;
  vendasAprovadasGestao: number;
  debitoAplicado: boolean;
  debitoQuantidade: number;
  valorBase: number;
  total: number;
  versao: number;
  codigo: string;
  pagoEm: string | null;
  pagoPor: string | null;
  pagamentoObs: string | null;
  reabertoMotivo: string | null;
};

export type CompetenciaFinanceiro = {
  competencia: string;
  fechada: boolean;
  fechadoEm: string | null;
  fechadoPor: string | null;
  linhas: LinhaPagamento[];
  totais: { agentes: number; valor: number; pagos: number; valorPago: number };
};

/** Competências já fechadas, mais recente primeiro. */
export async function competenciasFechadas(): Promise<string[]> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("comissoes_fechadas")
    .select("mes_ano")
    .order("mes_ano", { ascending: false })
    .limit(500);
  return [...new Set((data ?? []).map((d) => d.mes_ano as string))];
}

export async function competenciaFinanceiro(mesIso: string): Promise<CompetenciaFinanceiro> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("comissoes_fechadas")
    .select(
      "vendedor_id, snapshot, valor_total, versao, fechado_em, pago_em, pagamento_obs, reaberto_motivo, vendedores(nome), usuarios!comissoes_fechadas_fechado_por_fkey(nome), pagador:usuarios!comissoes_fechadas_pago_por_fkey(nome)"
    )
    .eq("mes_ano", mesIso);

  const vazia: CompetenciaFinanceiro = {
    competencia: mesIso,
    fechada: false,
    fechadoEm: null,
    fechadoPor: null,
    linhas: [],
    totais: { agentes: 0, valor: 0, pagos: 0, valorPago: 0 },
  };
  if (!data || data.length === 0) return vazia;

  const linhas: LinhaPagamento[] = data.map((d) => {
    const snap = d.snapshot as unknown as SnapshotComissao;
    const versao = (d.versao as number) ?? 1;
    const total = Number(d.valor_total ?? 0);
    const r = snap?.resultado;
    const pagador = d.pagador as unknown as { nome: string } | null;
    return {
      vendedorId: d.vendedor_id as string,
      vendedora: snap?.vendedora ?? (d.vendedores as unknown as { nome: string } | null)?.nome ?? "—",
      pop: snap?.pop ?? null,
      meta: snap?.meta ?? 0,
      metaEfetiva: r?.metaEfetiva ?? snap?.meta ?? 0,
      atingimentoPct: r?.atingimentoPct ?? 0,
      faixa: r?.degrau
        ? `${r.degrau.valor}${r.degrau.tipo === "valor_por_venda" ? " R$/venda" : "% do VTV"}`
        : "sem faixa",
      vendasLiberadas: r?.vendasComissionaveis ?? 0,
      vendasAprovadasGestao: (snap?.contratos ?? []).filter((c) => c.liberadaPor === "gestao").length,
      debitoAplicado: snap?.debito?.aplicado ?? true,
      debitoQuantidade: snap?.debito?.quantidade ?? 0,
      valorBase: r?.valorBase ?? 0,
      total,
      versao,
      codigo: codigoVerificacao(d.vendedor_id as string, mesIso, versao, total),
      pagoEm: (d.pago_em as string | null) ?? null,
      pagoPor: pagador?.nome ?? null,
      pagamentoObs: (d.pagamento_obs as string | null) ?? null,
      reabertoMotivo: (d.reaberto_motivo as string | null) ?? null,
    };
  });

  linhas.sort((a, b) => b.total - a.total);
  const fechador = data[0].usuarios as unknown as { nome: string } | null;

  return {
    competencia: mesIso,
    fechada: true,
    fechadoEm: (data[0].fechado_em as string) ?? null,
    fechadoPor: fechador?.nome ?? null,
    linhas,
    totais: {
      agentes: linhas.length,
      valor: linhas.reduce((s, l) => s + l.total, 0),
      pagos: linhas.filter((l) => l.pagoEm).length,
      valorPago: linhas.filter((l) => l.pagoEm).reduce((s, l) => s + l.total, 0),
    },
  };
}
