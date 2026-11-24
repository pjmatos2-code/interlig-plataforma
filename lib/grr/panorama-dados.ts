import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";
import { todas } from "@/lib/supabase/paginar";
import { foraDasVendas } from "@/lib/relatorio-semanal/dados";
import { carregarDiasUteis } from "@/lib/relatorio-semanal/dias-uteis";
import { fimDoMes, hojeSantarem } from "@/lib/relatorio-semanal/periodo";
import type { CadastroGrr } from "./escopo";
import { MESES_HISTORICO, mesesAnteriores, montarPanorama, type ContratoPanorama, type Panorama } from "./panorama";
import type { MetaLinha } from "./regras";

type Bruto = Omit<ContratoPanorama, "fora" | "valor_mensalidade"> & { valor_mensalidade: number | string | null; clientes: { nome: string | null } | null; planos: { nome: string | null } | null };

/** lê sete meses de vendas com a sessão de quem abriu e monta o panorama do mês (aaaa-mm) */
export async function carregarPanorama(mes: string, popId: string | null, cadastro: CadastroGrr, supabase: SupabaseClient = criarClienteServidor()): Promise<Panorama> {
  const desde = `${mesesAnteriores(mes, MESES_HISTORICO)[0]}-01`;
  const ate = fimDoMes(`${mes}-01`);
  const [brutos, metas, ehUtil] = await Promise.all([
    todas<Bruto>((a, b) =>
      supabase
        .from("contratos")
        .select("id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id, pop_id, clientes(nome), planos(nome)")
        .gte("data_venda", desde)
        .lte("data_venda", ate)
        .order("id")
        .range(a, b)
    ),
    supabase
      .from("metas")
      .select("escopo, referencia_id, quantidade_vendas")
      .eq("mes_ano", `${mes}-01`)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as MetaLinha[];
      }),
    carregarDiasUteis(desde, ate),
  ]);
  const contratos = brutos.map(({ clientes, planos, ...c }) => ({ ...c, valor_mensalidade: Number(c.valor_mensalidade ?? 0) || 0, fora: foraDasVendas(clientes?.nome, planos?.nome) }));
  return montarPanorama({ mes, hoje: hojeSantarem(), contratos, metas, vendedores: cadastro.vendedores, pops: cadastro.pops, ehUtil, popId });
}
