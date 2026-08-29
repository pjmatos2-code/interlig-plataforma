"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type Resultado = { erro?: string; ok?: string };

function revalidar() {
  revalidatePath("/metas/aprovacoes");
  revalidatePath("/metas");
  revalidatePath("/minhas-vendas");
  revalidatePath("/vendedoras");
}

/**
 * Libera à mão uma venda que a regra automática segurou (ex.: vendida no
 * último dia do mês, instalação agendada para o mês seguinte). O motivo fica
 * registrado com o nome de quem aprovou — é o que sustenta a decisão depois.
 */
export async function aprovarVenda(
  contratoId: string,
  competencia: string,
  motivo: string,
  pendencias: string[]
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  const texto = motivo.trim();
  if (!contratoId || !competencia) return { erro: "Contrato ou competência ausente." };
  if (texto.length < 5) return { erro: "Descreva o motivo (mín. 5 caracteres)." };

  const admin = criarClienteAdmin();
  const { error } = await admin.from("comissao_liberacoes").upsert(
    {
      contrato_id: contratoId,
      competencia,
      motivo: texto,
      pendencias_dispensadas: pendencias,
      aprovado_por: usuario.id,
      criado_em: new Date().toISOString(),
      revogado_em: null,
      revogado_por: null,
      revogado_motivo: null,
    },
    { onConflict: "contrato_id,competencia" }
  );
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Venda liberada para a comissão." };
}

/** Desfaz a liberação — o histórico fica (revogado_em), nada é apagado. */
export async function revogarAprovacao(
  contratoId: string,
  competencia: string,
  motivo?: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  if (!contratoId || !competencia) return { erro: "Contrato ou competência ausente." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("comissao_liberacoes")
    .update({
      revogado_em: new Date().toISOString(),
      revogado_por: usuario.id,
      revogado_motivo: motivo?.trim() || "revogada pela gestão",
    })
    .eq("contrato_id", contratoId)
    .eq("competencia", competencia)
    .is("revogado_em", null);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Liberação revogada." };
}

/**
 * Corrige a vendedora do contrato direto na fila — conserta a divergência
 * "ticket é de X, contrato é de Y" sem sair da tela de fechamento.
 */
export async function atribuirVendedoraContrato(
  contratoId: string,
  vendedorId: string
): Promise<Resultado> {
  await exigirPerfil(["gestor"]);
  if (!contratoId || !vendedorId) return { erro: "Escolha a vendedora." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("contratos")
    .update({ vendedor_id: vendedorId })
    .eq("id", contratoId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Vendedora atribuída." };
}
