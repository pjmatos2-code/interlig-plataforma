import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Time do coordenador (23/09/2026): vendedoras ATIVAS sob coordenação do
 * usuário — vínculo direto (vendedores.coordenador_id) ∪ co-coordenação
 * (coordenadores_extras, ex.: Rayssa na venda externa).
 *
 * null = não coordena ninguém (coordenador de UNIDADE: escopo é o POP).
 */
export async function timeDoCoordenador(usuarioId: string): Promise<string[] | null> {
  const admin = criarClienteAdmin();
  const [{ data: diretas }, { data: extras }] = await Promise.all([
    admin.from("vendedores").select("id").eq("coordenador_id", usuarioId).eq("ativo", true),
    admin
      .from("coordenadores_extras")
      .select("vendedor_id, vendedores!inner(ativo)")
      .eq("usuario_id", usuarioId)
      .eq("vendedores.ativo", true),
  ]);
  const ids = new Set<string>([
    ...(diretas ?? []).map((d) => d.id as string),
    ...(extras ?? []).map((e) => e.vendedor_id as string),
  ]);
  return ids.size > 0 ? [...ids] : null;
}

/**
 * Time que vale no mês (20/10/2026): só quem tem meta de vendedora
 * cadastrada naquele mês — férias e desligamentos ficam sem meta e saem da
 * meta E do resultado do coordenador (ex.: out/2026, Marcelo = só Jessica).
 * Se ninguém do time tiver meta no mês, vale o time inteiro.
 */
export async function timeComMetaNoMes(ids: string[], mesIso: string): Promise<string[]> {
  const { data } = await criarClienteAdmin()
    .from("metas")
    .select("referencia_id")
    .eq("escopo", "vendedora")
    .eq("mes_ano", mesIso)
    .in("referencia_id", ids);
  const comMeta = new Set((data ?? []).map((m) => m.referencia_id as string));
  return comMeta.size > 0 ? ids.filter((id) => comMeta.has(id)) : ids;
}
