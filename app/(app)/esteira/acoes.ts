"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth";

export type ResumoAtualizacaoEsteira = {
  erro?: string;
  statusSgp?: string;
  termoAssinado?: boolean;
  fidelidadeAssinada?: boolean;
  agendamento?: string | null;
  mudancas?: string[];
  colunaDe?: string;
  colunaPara?: string;
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
    mudancas: r.mudancas,
    colunaDe: r.colunaDe,
    colunaPara: r.colunaPara,
  };
}

/**
 * Cliente desistiu antes de ativar: o contrato sai da esteira e das pendências
 * da vendedora (não é exclusão — se o SGP ativar depois, o sync segue normal e
 * a venda volta a valer ao ser ativada). Só a gestão marca, com motivo.
 */
export async function marcarDesistencia(contratoId: string, motivo: string) {
  const { exigirPerfil } = await import("@/lib/auth");
  const usuario = await exigirPerfil(["gestor"]);
  const texto = motivo.trim();
  if (texto.length < 5) return { erro: "Descreva o motivo (mín. 5 caracteres)." };

  const { criarClienteAdmin } = await import("@/lib/supabase/admin");
  const { error } = await criarClienteAdmin()
    .from("contratos")
    .update({
      desistencia_em: new Date().toISOString(),
      desistencia_por: usuario.id,
      desistencia_motivo: texto,
    })
    .eq("id", contratoId)
    .is("data_ativacao", null);
  if (error) return { erro: error.message };
  revalidatePath("/esteira");
  revalidatePath("/dashboard");
  revalidatePath("/vendedoras");
  revalidatePath("/minha-comissao");
  return { ok: "Marcado como desistência — saiu das pendências." };
}

/** Desfaz a desistência — o contrato volta às pendências. */
export async function desfazerDesistencia(contratoId: string) {
  const { exigirPerfil } = await import("@/lib/auth");
  await exigirPerfil(["gestor"]);
  const { criarClienteAdmin } = await import("@/lib/supabase/admin");
  const { error } = await criarClienteAdmin()
    .from("contratos")
    .update({ desistencia_em: null, desistencia_por: null, desistencia_motivo: null })
    .eq("id", contratoId);
  if (error) return { erro: error.message };
  revalidatePath("/esteira");
  revalidatePath("/vendedoras");
  return { ok: "Desistência desfeita — voltou às pendências." };
}
