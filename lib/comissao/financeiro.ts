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
  foto: string | null;
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
      "vendedor_id, snapshot, valor_total, versao, fechado_em, pago_em, pagamento_obs, reaberto_motivo, vendedores(nome, foto_url), usuarios!comissoes_fechadas_fechado_por_fkey(nome), pagador:usuarios!comissoes_fechadas_pago_por_fkey(nome)"
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
      foto: (d.vendedores as unknown as { foto_url: string | null } | null)?.foto_url ?? null,
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

// ---------------------------------------------------------------------------
// Apuração em andamento — o mês que ainda não fechou.
//
// O financeiro acompanha para se organizar (provisão, previsão de caixa), mas
// estes números NÃO pagam: mudam até o fechamento. Por isso a leitura é feita
// por um caminho separado do pagamento e não expõe nenhuma ação — o financeiro
// ajuda no direcionamento, não na decisão.
// ---------------------------------------------------------------------------

export type LinhaApuracao = {
  vendedorId: string;
  vendedora: string;
  foto: string | null;
  meta: number;
  metaEfetiva: number;
  atingimentoPct: number;
  faixa: string;
  vendasLiberadas: number;
  vendasPendentes: number;
  estornos: number;
  debitoAplicado: boolean;
  debitoQuantidade: number;
  valorBase: number;
  parcial: number;
  seLiberarPendentes: number;
};

export type ApuracaoAndamento = {
  competencia: string;
  linhas: LinhaApuracao[];
  totais: { parcial: number; seLiberarPendentes: number; pendentes: number };
};

export async function apuracaoEmAndamento(mesIso: string): Promise<ApuracaoAndamento> {
  const { comissoesDoMes } = await import("@/lib/comissao/dados");
  const { debitoPorCoorte } = await import("@/lib/comissao/debito");
  const admin = criarClienteAdmin();
  const { refidelizacaoDoMes } = await import("@/lib/refidelizacao/dados");
  const { faixaDe: faixaRefid, META_REFIDELIZACAO } = await import("@/lib/refidelizacao/regras");
  const { retencaoDoMes, faixaRetencao, PISO_ELEGIVEIS } = await import("@/lib/retencao/dados");
  const [comissoes, debito, { data: vends }, refid, retencao] = await Promise.all([
    comissoesDoMes(mesIso, { ignorarRls: true }),
    debitoPorCoorte(mesIso),
    admin.from("vendedores").select("id, foto_url, sgp_login"),
    refidelizacaoDoMes(mesIso),
    retencaoDoMes(mesIso),
  ]);
  const fotoDe = new Map((vends ?? []).map((v) => [v.id as string, (v.foto_url as string | null) ?? null]));
  const idPorLogin = new Map(
    (vends ?? []).filter((v) => v.sgp_login).map((v) => [String(v.sgp_login).toLowerCase(), v.id as string])
  );

  const linhas: LinhaApuracao[] = comissoes
    .filter((c) => c.resultado !== null)
    .map((c) => {
      const r = c.resultado!;
      return {
        vendedorId: c.vendedorId,
        vendedora: c.nome,
        foto: fotoDe.get(c.vendedorId) ?? null,
        meta: c.metaMensal ?? 0,
        metaEfetiva: r.metaEfetiva,
        atingimentoPct: r.atingimentoPct,
        faixa: r.degrau
          ? `${r.degrau.valor}${r.degrau.tipo === "valor_por_venda" ? " R$/venda" : "% do VTV"}`
          : "sem faixa",
        vendasLiberadas: r.vendasComissionaveis,
        vendasPendentes: r.vendasPendentes,
        estornos: r.estornos,
        debitoAplicado: debito.aplicado,
        debitoQuantidade: debito.porVendedora.get(c.vendedorId) ?? 0,
        valorBase: r.valorBase,
        parcial: r.total,
        seLiberarPendentes: r.totalSeLiberar,
      };
    })
    .sort((a, b) => b.parcial - a.parcial);

  // Setor de Atendimento: a refidelização entra na mesma apuração, com a
  // régua própria (taxa sobre a meta de 150 planos, base = VTV mensal)
  for (const a of refid.agentes) {
    const pendentesRef = a.linhas.filter((l) => !l.conta && l.decisao !== "reprovado");
    const vtvPendente = pendentesRef.reduce((s2, l) => s2 + l.valorMensal, 0);
    const validosSe = a.validos + pendentesRef.length;
    const atingSe = (validosSe / META_REFIDELIZACAO) * 100;
    const fSe = faixaRefid(atingSe);
    linhas.push({
      vendedorId: idPorLogin.get(a.agente) ?? a.agente,
      vendedora: a.nome ?? a.agente,
      foto: a.foto,
      meta: META_REFIDELIZACAO,
      metaEfetiva: META_REFIDELIZACAO,
      atingimentoPct: a.atingimentoPct,
      faixa: a.percentual > 0 ? `${a.percentual}% do VTV (${a.faixa})` : "sem faixa",
      vendasLiberadas: a.validos,
      vendasPendentes: pendentesRef.length,
      estornos: 0,
      debitoAplicado: false,
      debitoQuantidade: 0,
      valorBase: a.vtv,
      parcial: a.comissao,
      seLiberarPendentes: ((fSe?.pct ?? 0) / 100) * (a.vtv + vtvPendente),
    });
  }

  // Setor de Retenção: régua por taxa — "pendentes" são os em risco
  // (suspensos), que viram retidos se o cliente reativar até o fechamento
  for (const m of retencao) {
    const vtvEmRisco = m.linhas
      .filter((l) => l.desfecho === "em_risco")
      .reduce((s2, l) => s2 + l.valorMensal, 0);
    const retidosSe = m.retidos + m.emRisco;
    const taxaSe = m.elegiveis > 0 ? (retidosSe / m.elegiveis) * 100 : 0;
    const faixaSe = m.elegiveis < PISO_ELEGIVEIS ? 0 : faixaRetencao(taxaSe);
    linhas.push({
      vendedorId: idPorLogin.get(m.agente) ?? m.agente,
      vendedora: m.nomeAgente ?? m.agente,
      foto: m.foto,
      meta: m.elegiveis,
      metaEfetiva: m.elegiveis,
      atingimentoPct: m.taxaPct,
      faixa: m.faixaPct > 0 ? `${m.faixaPct}% do VTV (taxa ${m.taxaPct.toFixed(0)}%)` : "sem faixa",
      vendasLiberadas: m.retidos,
      vendasPendentes: m.emRisco,
      estornos: m.clawbacks,
      debitoAplicado: false,
      debitoQuantidade: 0,
      valorBase: m.vtvRetido,
      parcial: m.comissao,
      seLiberarPendentes: (faixaSe / 100) * (m.vtvRetido + vtvEmRisco),
    });
  }

  return {
    competencia: mesIso,
    linhas,
    totais: {
      parcial: linhas.reduce((s, l) => s + l.parcial, 0),
      seLiberarPendentes: linhas.reduce((s, l) => s + l.seLiberarPendentes, 0),
      pendentes: linhas.reduce((s, l) => s + l.vendasPendentes, 0),
    },
  };
}

/* ------------------------------------------------------------------ histórico */

export type HistoricoAgente = {
  vendedorId: string;
  vendedora: string;
  foto: string | null;
  /** valor e pagamento por competência (chave = primeiro dia do mês) */
  valores: Record<string, { total: number; pagoEm: string | null }>;
  total: number;
};

export type HistoricoFinanceiro = {
  /** competências exibidas, da mais antiga para a mais recente */
  meses: string[];
  agentes: HistoricoAgente[];
};

/**
 * Histórico de comissão paga por agente nas últimas competências fechadas
 * (padrão: 3, contando a selecionada). Só entra o que existe em
 * comissoes_fechadas — o valor congelado no fechamento, versão mais recente.
 */
export async function historicoPorAgente(
  ateMesIso: string,
  qtd = 3
): Promise<HistoricoFinanceiro> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("comissoes_fechadas")
    .select("vendedor_id, mes_ano, valor_total, versao, pago_em, vendedores(nome, foto_url)")
    .lte("mes_ano", ateMesIso)
    .order("mes_ano", { ascending: false })
    .limit(1000);

  const meses = [...new Set((data ?? []).map((d) => d.mes_ano as string))]
    .slice(0, qtd)
    .reverse();
  const noRecorte = (data ?? []).filter((d) => meses.includes(d.mes_ano as string));

  const porAgente = new Map<string, HistoricoAgente>();
  const versaoDe = new Map<string, number>();
  for (const d of noRecorte) {
    const id = d.vendedor_id as string;
    const mes = d.mes_ano as string;
    const versao = (d.versao as number) ?? 1;
    const chave = `${id}:${mes}`;
    // reabertura gera versão nova — vale sempre a mais recente
    if ((versaoDe.get(chave) ?? 0) >= versao) continue;
    versaoDe.set(chave, versao);

    const v = d.vendedores as unknown as { nome: string; foto_url: string | null } | null;
    const ag = porAgente.get(id) ?? {
      vendedorId: id,
      vendedora: v?.nome ?? "—",
      foto: v?.foto_url ?? null,
      valores: {},
      total: 0,
    };
    ag.valores[mes] = { total: Number(d.valor_total ?? 0), pagoEm: (d.pago_em as string | null) ?? null };
    porAgente.set(id, ag);
  }
  const agentes = [...porAgente.values()]
    .map((a) => ({ ...a, total: Object.values(a.valores).reduce((s, x) => s + x.total, 0) }))
    .sort((a, b) => a.vendedora.localeCompare(b.vendedora));

  return { meses, agentes };
}
