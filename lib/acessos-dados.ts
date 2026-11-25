import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Usuario } from "@/lib/tipos";
import { acessoDoModulo, type AjusteModulo, type Modulo } from "./acessos";

/** ajustes de módulo da pessoa (um por módulo); sem a tabela, nenhum ajuste */
export const ajustesDoUsuario = cache(async (usuarioId: string): Promise<AjusteModulo[]> => {
  const { data, error } = await criarClienteAdmin().from("usuario_modulos").select("modulo, permitido, pop_id").eq("usuario_id", usuarioId);
  if (error) return [];
  return (data ?? []).map((r) => ({ modulo: r.modulo as Modulo, permitido: Boolean(r.permitido), popId: (r.pop_id as string | null) ?? null }));
});

const nomeDoPop = cache(async (popId: string): Promise<string | null> => {
  const { data } = await criarClienteAdmin().from("pops").select("nome").eq("id", popId).maybeSingle();
  return (data?.nome as string | undefined) ?? null;
});

/**
 * Exige o módulo: sem acesso, vai para "sem acesso". Devolve a pessoa e a
 * unidade a que ela fica presa no módulo (popId e nome), quando houver.
 */
export async function exigirModulo(modulo: Modulo): Promise<{ usuario: Usuario; popId: string | null; unidade: string | null }> {
  const usuario = await exigirUsuario({ restritos: true });
  const acesso = acessoDoModulo(usuario.perfil, await ajustesDoUsuario(usuario.id), modulo);
  if (!acesso.permitido) redirect("/sem-acesso");
  return { usuario, popId: acesso.popId, unidade: acesso.popId ? await nomeDoPop(acesso.popId) : null };
}

/** o mesmo, sem redirecionar (para rotas de API): null quando não tem acesso */
export async function moduloDoUsuario(usuario: Usuario, modulo: Modulo): Promise<{ popId: string | null; unidade: string | null } | null> {
  const acesso = acessoDoModulo(usuario.perfil, await ajustesDoUsuario(usuario.id), modulo);
  if (!acesso.permitido) return null;
  return { popId: acesso.popId, unidade: acesso.popId ? await nomeDoPop(acesso.popId) : null };
}
