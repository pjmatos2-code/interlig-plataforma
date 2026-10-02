"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { atualizarResumoFidelidade } from "@/lib/sgp/fidelidade";

export async function atualizarFidelidadeAgora(): Promise<{ erro?: string; ok?: string }> {
  await exigirPerfil(["gestor", "direcao", "agente_atendimento"]);
  const r = await atualizarResumoFidelidade(110_000);
  revalidatePath("/fidelidade");
  revalidatePath("/meu-painel");
  if (!r.ok) return { erro: `Atualizou ${r.lidas} de 12 consultas: ${r.erro}. Clique de novo para continuar.` };
  return { ok: "Atualizado com o SGP." };
}
