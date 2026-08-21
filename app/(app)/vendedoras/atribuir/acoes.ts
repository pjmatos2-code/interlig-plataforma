"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type EstadoAtribuicao = { erro?: string; ok?: boolean };

/**
 * Atribuição manual de venda → vendedora (critério D5, exceções e backlog).
 * Contratos são escritos só pela service role; aqui o gestor/supervisor
 * autenticado autoriza a operação.
 */
export async function atribuirVenda(
  contratoId: string,
  vendedorId: string | null
): Promise<EstadoAtribuicao> {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);
  const admin = criarClienteAdmin();

  if (vendedorId) {
    const { data: v } = await admin
      .from("vendedores")
      .select("id, pop_id")
      .eq("id", vendedorId)
      .maybeSingle();
    if (!v) return { erro: "Vendedora não encontrada." };
    // supervisor só atribui para vendedoras da própria POP
    if (usuario.perfil === "supervisor" && v.pop_id !== usuario.pop_id)
      return { erro: "Supervisor só atribui para vendedoras da própria equipe." };
  }

  const { error } = await admin
    .from("contratos")
    .update({ vendedor_id: vendedorId })
    .eq("id", contratoId);
  if (error) return { erro: error.message };

  revalidatePath("/vendedoras/atribuir");
  revalidatePath("/vendedoras");
  revalidatePath("/metas");
  return { ok: true };
}
