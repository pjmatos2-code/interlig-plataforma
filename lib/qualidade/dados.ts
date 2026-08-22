import { criarClienteServidor } from "@/lib/supabase/server";
import {
  churnPrecoce,
  safraFechada,
  inadimplenciaPrimeiraFatura,
  vendasDoPeriodo,
  type ContratoIndicador,
  type TituloPrimeiraFatura,
} from "@/lib/indicadores/regras";
import { hojeIso, mesAtras, somarDias } from "@/lib/datas";
import type { CategoriaOrigem } from "@/lib/tipos";
import { ROTULO_ORIGEM } from "@/lib/tipos";

type ContratoQualidade = ContratoIndicador & {
  sgp_contrato_id: string | null;
  vendedor_id: string | null;
  pop_id: string | null;
  origem_cadastro: CategoriaOrigem | null;
  vendedores: { nome: string } | null;
  pops: { nome: string } | null;
  clientes: { nome: string; sgp_cliente_id: string | null; cpf: string | null } | null;
};

type TituloQualidade = TituloPrimeiraFatura & {
  valor: number | null;
  contratos: {
    sgp_contrato_id: string | null;
    status: string;
    valor_mensalidade: number;
    data_ativacao: string | null;
    origem_cadastro: CategoriaOrigem | null;
    pop_id: string | null;
    pops: { nome: string } | null;
    vendedores: { nome: string } | null;
    clientes: { nome: string; sgp_cliente_id: string | null; cpf: string | null } | null;
  } | null;
};

/** Linha nominal com link para o SGP (churn e inadimplência). */
export type ContratoLinkado = {
  cliente: string;
  sgpClienteId: string | null;
  sgpContratoId: string | null;
  cpf: string | null;
  vendedora: string;
  pop: string;
  valor: number;
};

export type LinhaTaxa = { nome: string; taxa: number | null; base: number; casos: number };

export type DadosQualidade = {
  hoje: string;
  /** cancelamentos precoces (≤90d da ativação), mais recentes primeiro */
  churnLista: (ContratoLinkado & {
    ativacao: string;
    cancelamento: string;
    motivo: string | null;
  })[];
  /** 1ª fatura vencida (carência 10d) e não paga, maior atraso primeiro */
  inadimplentes: (ContratoLinkado & {
    vencimento: string;
    diasAtraso: number;
    statusContrato: string;
  })[];
  churn: {
    geral: ReturnType<typeof churnPrecoce>;
    porSafra: { safra: string; taxa: number | null; base: number; cancelados: number }[];
    porOrigem: LinhaTaxa[];
    porPop: LinhaTaxa[];
    cruzamento: {
      vendedora: string;
      vendasJanela: number;
      churn: ReturnType<typeof churnPrecoce>;
    }[];
  };
  inadimplencia: {
    geral: ReturnType<typeof inadimplenciaPrimeiraFatura>;
    porSafra: { safra: string; taxa: number | null; base: number; inadimplentes: number }[];
    porOrigem: LinhaTaxa[];
  };
};

/**
 * Qualidade da venda (PRD 3.8): churn precoce (5.10) e inadimplência de 1ª
 * fatura (5.11), por safra (mês de ativação), origem, POP e vendedora.
 * RLS: gestor vê tudo; supervisor só a própria POP (títulos incluídos).
 */
export async function carregarQualidade(popId: string | null): Promise<DadosQualidade> {
  const supabase = criarClienteServidor();
  const hoje = hojeIso();
  const inicioHistorico = mesAtras(hoje, 13);

  // O PostgREST devolve no máximo 1000 linhas por request — paginamos por
  // .range() até esgotar (sem isso o módulo julgava só uma amostra).
  const PAGINA = 1000;
  async function tudoContratos(): Promise<ContratoQualidade[]> {
    const todos: ContratoQualidade[] = [];
    for (let de = 0; ; de += PAGINA) {
      let q = supabase
        .from("contratos")
        .select(
          "sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id, pop_id, origem_cadastro, vendedores(nome), pops(nome), clientes(nome, sgp_cliente_id, cpf)"
        )
        .not("data_ativacao", "is", null)
        .gte("data_ativacao", inicioHistorico)
        .order("id")
        .range(de, de + PAGINA - 1);
      if (popId) q = q.eq("pop_id", popId);
      const { data } = await q;
      const lote = (data ?? []) as unknown as ContratoQualidade[];
      todos.push(...lote);
      if (lote.length < PAGINA) return todos;
    }
  }
  async function tudoTitulos(): Promise<TituloQualidade[]> {
    const todos: TituloQualidade[] = [];
    for (let de = 0; ; de += PAGINA) {
      let q = supabase
        .from("titulos")
        .select(
          "vencimento, data_pagamento, status, valor, contratos(sgp_contrato_id, status, valor_mensalidade, data_ativacao, origem_cadastro, pop_id, pops(nome), vendedores(nome), clientes(nome, sgp_cliente_id, cpf))"
        )
        .eq("numero_parcela", 1)
        .gte("vencimento", inicioHistorico)
        .order("id")
        .range(de, de + PAGINA - 1);
      if (popId) q = q.eq("contratos.pop_id", popId);
      const { data } = await q;
      const lote = (data ?? []) as unknown as TituloQualidade[];
      todos.push(...lote);
      if (lote.length < PAGINA) return todos;
    }
  }

  const [contratos, titulosTodos] = await Promise.all([tudoContratos(), tudoTitulos()]);
  const titulos = titulosTodos.filter((t) => t.contratos !== null);

  // ---------- churn por safra (só safras fechadas, PRD 5.10) ----------
  const churnPorSafra: DadosQualidade["churn"]["porSafra"] = [];
  for (let i = 12; i >= 3; i--) {
    const safra = mesAtras(hoje, i);
    if (!safraFechada(safra, hoje)) continue;
    const daSafra = contratos.filter((c) => c.data_ativacao!.slice(0, 7) === safra.slice(0, 7));
    const r = churnPrecoce(daSafra, hoje);
    if (r.base > 0) churnPorSafra.push({ safra, ...r });
  }

  // ---------- churn por dimensão ----------
  const agrupar = (chave: (c: ContratoQualidade) => string): LinhaTaxa[] => {
    const grupos = new Map<string, ContratoQualidade[]>();
    for (const c of contratos) {
      const k = chave(c);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(c);
    }
    return [...grupos.entries()]
      .map(([nome, lista]) => {
        const r = churnPrecoce(lista, hoje);
        return { nome, taxa: r.taxa, base: r.base, casos: r.cancelados };
      })
      .filter((l) => l.base > 0)
      .sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0));
  };

  // ---------- cruzamento vendas × churn por vendedora ----------
  const corte90 = somarDias(hoje, -90);
  const porVendedora = new Map<string, ContratoQualidade[]>();
  for (const c of contratos) {
    const nome = c.vendedores?.nome ?? "Não atribuída";
    if (!porVendedora.has(nome)) porVendedora.set(nome, []);
    porVendedora.get(nome)!.push(c);
  }
  const cruzamento = [...porVendedora.entries()]
    .map(([vendedora, lista]) => ({
      vendedora,
      // volume na mesma janela julgada pelo churn (ativados até hoje−90)
      vendasJanela: vendasDoPeriodo(lista, inicioHistorico, corte90).length,
      churn: churnPrecoce(lista, hoje),
    }))
    .filter((l) => l.churn.base > 0)
    .sort((a, b) => (b.churn.taxa ?? 0) - (a.churn.taxa ?? 0));

  // ---------- inadimplência ----------
  const inadGeral = inadimplenciaPrimeiraFatura(titulos, hoje);

  const inadPorSafra: DadosQualidade["inadimplencia"]["porSafra"] = [];
  for (let i = 12; i >= 1; i--) {
    const safra = mesAtras(hoje, i);
    const daSafra = titulos.filter(
      (t) => (t.contratos!.data_ativacao ?? "").slice(0, 7) === safra.slice(0, 7)
    );
    const r = inadimplenciaPrimeiraFatura(daSafra, hoje);
    if (r.base > 0) inadPorSafra.push({ safra, ...r });
  }

  const inadPorOrigem: LinhaTaxa[] = [];
  {
    const grupos = new Map<string, TituloQualidade[]>();
    for (const t of titulos) {
      const origem = t.contratos!.origem_cadastro;
      const nome = origem ? ROTULO_ORIGEM[origem] : "Sem origem";
      if (!grupos.has(nome)) grupos.set(nome, []);
      grupos.get(nome)!.push(t);
    }
    for (const [nome, lista] of grupos) {
      const r = inadimplenciaPrimeiraFatura(lista, hoje);
      if (r.base > 0)
        inadPorOrigem.push({ nome, taxa: r.taxa, base: r.base, casos: r.inadimplentes });
    }
    inadPorOrigem.sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0));
  }

  // ---------- listas nominais com link para o SGP ----------
  const dias2 = (de: string, ate: string) =>
    Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

  const churnLista: DadosQualidade["churnLista"] = contratos
    .filter(
      (c) =>
        c.data_ativacao !== null &&
        c.data_cancelamento !== null &&
        dias2(c.data_ativacao, c.data_cancelamento) <= 90
    )
    .map((c) => ({
      cliente: c.clientes?.nome ?? "—",
      sgpClienteId: c.clientes?.sgp_cliente_id ?? null,
      sgpContratoId: c.sgp_contrato_id,
      cpf: c.clientes?.cpf ?? null,
      vendedora: c.vendedores?.nome ?? "Não atribuída",
      pop: c.pops?.nome ?? "—",
      valor: c.valor_mensalidade,
      ativacao: c.data_ativacao!,
      cancelamento: c.data_cancelamento!,
      motivo: c.motivo_cancelamento ?? null,
    }))
    .sort((a, b) => (a.cancelamento < b.cancelamento ? 1 : -1))
    .slice(0, 200);

  const inadimplentes: DadosQualidade["inadimplentes"] = titulos
    .filter((t) => {
      if (t.status === "cancelado" || t.status === "liquidado") return false;
      return dias2(t.vencimento, hoje) > 10; // mesma carência do indicador 5.11
    })
    .map((t) => ({
      cliente: t.contratos!.clientes?.nome ?? "—",
      sgpClienteId: t.contratos!.clientes?.sgp_cliente_id ?? null,
      sgpContratoId: t.contratos!.sgp_contrato_id,
      cpf: t.contratos!.clientes?.cpf ?? null,
      vendedora: t.contratos!.vendedores?.nome ?? "Não atribuída",
      pop: t.contratos!.pops?.nome ?? "—",
      valor: Number(t.valor ?? t.contratos!.valor_mensalidade ?? 0),
      vencimento: t.vencimento,
      diasAtraso: dias2(t.vencimento, hoje),
      statusContrato: t.contratos!.status,
    }))
    .filter((t) => t.statusContrato !== "cancelado")
    .sort((a, b) => b.diasAtraso - a.diasAtraso)
    .slice(0, 200);

  return {
    hoje,
    churnLista,
    inadimplentes,
    churn: {
      geral: churnPrecoce(contratos, hoje),
      porSafra: churnPorSafra,
      porOrigem: agrupar((c) =>
        c.origem_cadastro ? ROTULO_ORIGEM[c.origem_cadastro] : "Sem origem"
      ),
      porPop: agrupar((c) => c.pops?.nome ?? "Sem POP"),
      cruzamento,
    },
    inadimplencia: {
      geral: inadGeral,
      porSafra: inadPorSafra,
      porOrigem: inadPorOrigem,
    },
  };
}
