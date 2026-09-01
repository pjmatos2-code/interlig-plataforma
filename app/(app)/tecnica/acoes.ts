"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";

export type Resultado = { erro?: string; ok?: string };

/** Busca as OS do mês no relatório do painel do SGP e atualiza a base. */
export async function sincronizarOsDoMes(mes: string): Promise<Resultado> {
  await exigirPerfil(["gestor"]);
  const { sincronizarOs } = await import("@/lib/sgp/os");
  const r = await sincronizarOs(mes);
  if (!r.ok) return { erro: r.erro ?? "Falha na sincronização." };
  revalidatePath("/tecnica");
  return { ok: `${r.lidas} OS lidas · ${r.gravadas} gravadas.` };
}
