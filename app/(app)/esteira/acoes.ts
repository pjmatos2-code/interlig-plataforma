"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth";

export type ResumoAtualizacaoEsteira = {
  erro?: string;
  statusSgp?: string;
  termoAssinado?: boolean;
  fidelidadeAssinada?: boolean;
  agendamento?: string | null;
};

/** Botão ⟳ do card da esteira: força a atualização do contrato no SGP
 *  (status ativo/inativo, assinaturas e OS/agendamento) sem esperar o sync. */
export async function atualizarContratoEsteira(
  contratoId: string
): Promise<ResumoAtualizacaoEsteira> {
  await exigirUsuario();
  const { atualizarContratoDoSgp } = await import("@/lib/sgp/atualizar");
  const r = await atualizarContratoDoSgp(contratoId);
  if (!r.ok) return { erro: r.erro ?? "Falha ao consultar o SGP." };
  revalidatePath("/esteira");
  revalidatePath("/crm");
  return {
    statusSgp: r.statusSgp,
    termoAssinado: r.termoAssinado,
    fidelidadeAssinada: r.fidelidadeAssinada,
    agendamento: r.osAbertas?.[0]?.agendamento ?? null,
  };
}
