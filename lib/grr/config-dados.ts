import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";
import { SEM_CONFIG, type ConfigGrr, type MetaGrr } from "./config";

/** empresa (unidade de negócio) deste ambiente; as tabelas do GRR já carregam a chave para o módulo poder servir outras */
export const EMPRESA_GRR = "interlig";
export const SETOR_GRR = "comercial";

/**
 * Lê a configuração do GRR (indicadores e metas). Enquanto as tabelas não
 * existem no banco (migração 0134), devolve "sem configuração" e o painel
 * segue só com as regras da plataforma, como na Etapa 1.
 */
export async function lerConfigGrr(cliente: SupabaseClient = criarClienteServidor()): Promise<ConfigGrr> {
  const [indicadores, metas] = await Promise.all([
    cliente.from("grr_indicadores").select("chave, ativo, dono").eq("empresa", EMPRESA_GRR).eq("setor", SETOR_GRR),
    cliente
      .from("grr_metas")
      .select("id, indicador, escopo_tipo, escopo_ref, vigente_desde, meta, limite_atencao, observacao, criado_em, criado_por")
      .eq("empresa", EMPRESA_GRR)
      .eq("setor", SETOR_GRR)
      .order("criado_em", { ascending: false })
      .limit(1000),
  ]);
  if (indicadores.error || metas.error) return SEM_CONFIG;
  return {
    disponivel: true,
    indicadores: (indicadores.data ?? []).map((i) => ({ chave: String(i.chave), ativo: i.ativo !== false, dono: (i.dono as string | null) ?? null })),
    metas: (metas.data ?? []).map((m) => ({
      ...(m as unknown as MetaGrr),
      vigente_desde: String(m.vigente_desde).slice(0, 10),
      meta: m.meta == null ? null : Number(m.meta),
      limite_atencao: m.limite_atencao == null ? null : Number(m.limite_atencao),
    })),
  };
}
