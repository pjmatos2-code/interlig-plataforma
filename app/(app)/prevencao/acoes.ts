"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PERFIS_OPERAM, RESULTADOS } from "@/lib/prevencao/resultados";

export type Resultado = { erro?: string; ok?: string };

export async function registrarContato(_e: Resultado, dados: FormData): Promise<Resultado> {
  const usuario = await exigirUsuario();
  if (!PERFIS_OPERAM.includes(usuario.perfil)) return { erro: "Sem permissão." };
  const contrato = String(dados.get("sgp_contrato_id") ?? "").trim();
  const fila = String(dados.get("fila") ?? "") as "debito" | "insatisfacao";
  const resultado = String(dados.get("resultado") ?? "");
  const observacao = String(dados.get("observacao") ?? "").trim().slice(0, 500);
  if (!/^\d+$/.test(contrato)) return { erro: "Contrato inválido." };
  if (!(fila in RESULTADOS)) return { erro: "Fila inválida." };
  if (!RESULTADOS[fila].some((r) => r.valor === resultado)) return { erro: "Escolha o resultado do contato." };
  const { error } = await criarClienteAdmin().from("prevencao_contatos").insert({
    sgp_contrato_id: contrato,
    fila,
    resultado,
    observacao: observacao || null,
    criado_por: usuario.id,
  });
  if (error) return { erro: error.message };
  revalidatePath("/prevencao");
  return { ok: "Contato registrado." };
}
