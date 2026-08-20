"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoMeta = { erro?: string; ok?: boolean };

/**
 * Cadastro de metas (PRD 3.7) — só gestor. A RLS também bloqueia no banco;
 * a checagem aqui devolve mensagem amigável em vez de erro de política.
 */
export async function salvarMeta(_estado: EstadoMeta, dados: FormData): Promise<EstadoMeta> {
  const usuario = await exigirPerfil(["gestor"]);

  const escopo = String(dados.get("escopo") ?? "");
  const referencia = String(dados.get("referencia_id") ?? "");
  const mesAno = String(dados.get("mes_ano") ?? ""); // aaaa-mm
  const quantidade = Number(dados.get("quantidade_vendas"));

  if (!["global", "pop", "vendedora"].includes(escopo)) return { erro: "Escopo inválido." };
  if (escopo !== "global" && !referencia) return { erro: "Selecione a POP ou a vendedora." };
  if (!/^\d{4}-\d{2}$/.test(mesAno)) return { erro: "Informe o mês de referência." };
  if (!Number.isInteger(quantidade) || quantidade <= 0)
    return { erro: "Quantidade de vendas deve ser um inteiro positivo." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("metas").upsert(
    {
      escopo,
      referencia_id: escopo === "global" ? null : referencia,
      mes_ano: `${mesAno}-01`,
      quantidade_vendas: quantidade,
      criado_por: usuario.id,
    },
    { onConflict: "escopo,referencia_id,mes_ano" }
  );

  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/metas");
  revalidatePath("/dashboard");
  revalidatePath("/vendedoras");
  return { ok: true };
}

export async function excluirMeta(id: string): Promise<EstadoMeta> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("metas").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/metas");
  return { ok: true };
}
