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
  vendedor_id: string | null;
  pop_id: string | null;
  origem_cadastro: CategoriaOrigem | null;
  vendedores: { nome: string } | null;
  pops: { nome: string } | null;
};

type TituloQualidade = TituloPrimeiraFatura & {
  contratos: {
    data_ativacao: string | null;
    origem_cadastro: CategoriaOrigem | null;
    pop_id: string | null;
    pops: { nome: string } | null;
  } | null;
};

export type LinhaTaxa = { nome: string; taxa: number | null; base: number; casos: number };

export type DadosQualidade = {
  hoje: string;
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

  let consultaContratos = supabase
    .from("contratos")
    .select(
      "data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id, pop_id, origem_cadastro, vendedores(nome), pops(nome)"
    )
    .not("data_ativacao", "is", null)
    .gte("data_ativacao", inicioHistorico)
    .limit(5000);
  if (popId) consultaContratos = consultaContratos.eq("pop_id", popId);

  let consultaTitulos = supabase
    .from("titulos")
    .select(
      "vencimento, data_pagamento, status, contratos(data_ativacao, origem_cadastro, pop_id, pops(nome))"
    )
    .eq("numero_parcela", 1)
    .gte("vencimento", inicioHistorico)
    .limit(5000);
  if (popId) consultaTitulos = consultaTitulos.eq("contratos.pop_id", popId);

  const [{ data: contratosBrutos }, { data: titulosBrutos }] = await Promise.all([
    consultaContratos,
    consultaTitulos,
  ]);

  const contratos = (contratosBrutos ?? []) as unknown as ContratoQualidade[];
  const titulos = ((titulosBrutos ?? []) as unknown as TituloQualidade[]).filter(
    (t) => t.contratos !== null
  );

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

  return {
    hoje,
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
