"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type Resultado = { erro?: string; ok?: string };

/**
 * Registra o pagamento. O financeiro não altera apuração — só marca que pagou,
 * com data e observação. A trava de verdade está no trigger do banco
 * (app.financeiro_so_marca_pagamento).
 */
export async function marcarPago(
  vendedorId: string,
  mes: string,
  observacao: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor", "financeiro"]);
  if (!vendedorId || !mes) return { erro: "Parâmetros ausentes." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("comissoes_fechadas")
    .update({
      pago_em: new Date().toISOString(),
      pago_por: usuario.id,
      pagamento_obs: observacao.trim() || null,
    })
    .eq("vendedor_id", vendedorId)
    .eq("mes_ano", mes);
  if (error) return { erro: error.message };

  revalidatePath("/financeiro");
  return { ok: "Pagamento registrado." };
}

/** Desfaz o registro de pagamento (lançamento errado). */
export async function desmarcarPago(vendedorId: string, mes: string): Promise<Resultado> {
  await exigirPerfil(["gestor", "financeiro"]);
  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("comissoes_fechadas")
    .update({ pago_em: null, pago_por: null, pagamento_obs: null })
    .eq("vendedor_id", vendedorId)
    .eq("mes_ano", mes);
  if (error) return { erro: error.message };
  revalidatePath("/financeiro");
  return { ok: "Registro de pagamento desfeito." };
}
