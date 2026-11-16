import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Time do coordenador (23/09/2026): vendedoras ATIVAS que o usuário
 * acompanha — equipe (vendedores.coordenador_id) ∪ apoio
 * (coordenadores_extras, ex.: Rayssa na venda externa; Marcelo com as
 * agentes internas em nov/2026). É o recorte de ACESSO: CRM, esteira,
 * dashboard e painel por vendedora. A comissão de liderança conta só a
 * equipe (lib/comissao/base.ts); ver lib/coordenacao-vinculos.ts.
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

/**
 * O coordenador acompanha esta agente? Mesma régua da lista do Painel por
 * vendedora e da RLS (16/11/2026): equipe ou apoio, em qualquer cidade; quem
 * não coordena ninguém (unidade) acompanha as agentes do próprio POP. Antes
 * a tela de detalhe aceitava só a equipe, e quem estava em apoio via a
 * agente na lista e recebia "não encontrado" ao abrir.
 */
export async function coordenaAgente(
  usuario: { id: string; pop_id: string | null },
  vendedorId: string
): Promise<boolean> {
  const admin = criarClienteAdmin();
  const [{ data: agente }, { data: apoio }, time] = await Promise.all([
    admin.from("vendedores").select("coordenador_id, pop_id").eq("id", vendedorId).maybeSingle(),
    admin
      .from("coordenadores_extras")
      .select("vendedor_id")
      .eq("usuario_id", usuario.id)
      .eq("vendedor_id", vendedorId)
      .maybeSingle(),
    timeDoCoordenador(usuario.id),
  ]);
  if (!agente) return false;
  if (agente.coordenador_id === usuario.id || apoio) return true;
  return time === null && usuario.pop_id !== null && agente.pop_id === usuario.pop_id;
}
