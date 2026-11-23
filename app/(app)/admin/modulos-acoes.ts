"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { MODULOS, type Modulo } from "@/lib/acessos";

/**
 * Acesso aos módulos por usuário (23/11/2026), só a administração. Valor:
 * "padrao" (volta ao do perfil), "todas" (liberado em todas as unidades),
 * "pop:<id>" (liberado só numa unidade) ou "bloqueado".
 */
export async function salvarAcessoModulo(usuarioId: string, modulo: Modulo, valor: string): Promise<{ erro?: string; ok?: string }> {
  const gestor = await exigirPerfil(["gestor"]);
  if (!/^[0-9a-f-]{36}$/.test(usuarioId) || !MODULOS.some((m) => m.chave === modulo)) return { erro: "Dados inválidos." };
  const db = criarClienteServidor();
  if (valor === "padrao") {
    const { error } = await db.from("usuario_modulos").delete().eq("usuario_id", usuarioId).eq("modulo", modulo);
    if (error) return { erro: error.message };
  } else {
    const popId = valor.startsWith("pop:") ? valor.slice(4) : null;
    if (popId && !/^[0-9a-f-]{36}$/.test(popId)) return { erro: "Unidade inválida." };
    if (!popId && valor !== "todas" && valor !== "bloqueado") return { erro: "Opção inválida." };
    const { error } = await db
      .from("usuario_modulos")
      .upsert({ usuario_id: usuarioId, modulo, permitido: valor !== "bloqueado", pop_id: popId, atualizado_em: new Date().toISOString(), atualizado_por: gestor.id }, { onConflict: "usuario_id,modulo" });
    if (error) return { erro: error.message };
  }
  revalidatePath("/admin");
  return { ok: "Salvo." };
}
