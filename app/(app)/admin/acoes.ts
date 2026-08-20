"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { executarSync, type ResultadoSync } from "@/lib/sync/worker";

export type EstadoAdmin = { erro?: string; ok?: boolean };

export async function salvarMotivo(_e: EstadoAdmin, dados: FormData): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const nome = String(dados.get("nome") ?? "").trim();
  if (!nome) return { erro: "Informe o nome do motivo." };

  const supabase = criarClienteServidor();
  const { count } = await supabase
    .from("motivos_nao_conversao")
    .select("*", { count: "exact", head: true });
  const { error } = await supabase
    .from("motivos_nao_conversao")
    .insert({ nome, ativo: true, ordem: (count ?? 0) + 1 });
  if (error)
    return {
      erro: error.code === "23505" ? "Já existe um motivo com esse nome." : error.message,
    };
  revalidatePath("/admin");
  return { ok: true };
}

/** Ativa/desativa (nunca exclui: tickets antigos referenciam o motivo). */
export async function alternarMotivo(id: string, ativo: boolean): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("motivos_nao_conversao")
    .update({ ativo })
    .eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export type EstadoSync = { erro?: string; resultado?: ResultadoSync };

/** Dispara o worker de sync manualmente (gestor). O cron faz o mesmo a cada 10 min. */
export async function sincronizarAgora(): Promise<EstadoSync> {
  await exigirPerfil(["gestor"]);
  try {
    const resultado = await executarSync();
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { resultado };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
