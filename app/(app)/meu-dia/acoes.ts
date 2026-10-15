"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { normalizarTelefone } from "@/lib/indicadores/crm";
import { registrarLogMeuDia } from "@/lib/meu-dia/log";

export type Resultado = { erro?: string; ok?: string; ticketId?: string };

/** a vendedora só mexe no pós-venda dela; o gestor pode agir por qualquer uma */
async function itemDoUsuario(contratoId: string) {
  const usuario = await exigirUsuario();
  const admin = criarClienteAdmin();
  const { data: item } = await admin
    .from("meu_dia_posvenda")
    .select("contrato_id, vendedor_id, boas_vindas_em, resultado, contratos(cliente_id)")
    .eq("contrato_id", contratoId)
    .maybeSingle();
  if (!item) return { erro: "Item de pós-venda não encontrado." } as const;
  if (usuario.perfil !== "gestor" && usuario.vendedor_id !== item.vendedor_id) return { erro: "Sem permissão." } as const;
  return { usuario, admin, item } as const;
}

export async function marcarBoasVindas(contratoId: string): Promise<Resultado> {
  const r = await itemDoUsuario(contratoId);
  if ("erro" in r) return { erro: r.erro };
  const { usuario, admin, item } = r;
  if (item.boas_vindas_em) return { ok: "Boas-vindas já registrada." };
  const { error } = await admin.from("meu_dia_posvenda").update({ boas_vindas_em: new Date().toISOString() }).eq("contrato_id", contratoId);
  if (error) return { erro: error.message };
  await registrarLogMeuDia({ usuarioId: usuario.id, contratoId, vendedorId: item.vendedor_id as string, acao: "posvenda_boas_vindas", resultado: "enviada" });
  revalidatePath("/meu-dia");
  return { ok: "Boas-vindas registrada." };
}

export async function registrarSemIndicacao(contratoId: string): Promise<Resultado> {
  const r = await itemDoUsuario(contratoId);
  if ("erro" in r) return { erro: r.erro };
  const { usuario, admin, item } = r;
  if (!item.boas_vindas_em) return { erro: "Registre primeiro a mensagem de boas-vindas." };
  const { error } = await admin
    .from("meu_dia_posvenda")
    .update({ resultado: "sem_indicacao", resultado_em: new Date().toISOString() })
    .eq("contrato_id", contratoId);
  if (error) return { erro: error.message };
  await registrarLogMeuDia({ usuarioId: usuario.id, contratoId, vendedorId: item.vendedor_id as string, acao: "posvenda_indicacao", resultado: "sem_indicacao" });
  revalidatePath("/meu-dia");
  return { ok: "Pós-venda concluído." };
}

/** Indicação simples (sem auditoria): vira ticket novo, da mesma vendedora, ligado ao contrato de quem indicou */
export async function registrarIndicacao(contratoId: string, nome: string, telefone: string): Promise<Resultado> {
  const r = await itemDoUsuario(contratoId);
  if ("erro" in r) return { erro: r.erro };
  const { usuario, admin, item } = r;
  if (!item.boas_vindas_em) return { erro: "Registre primeiro a mensagem de boas-vindas." };
  const nomeLimpo = nome.trim().replace(/\s+/g, " ");
  const tel = normalizarTelefone(telefone);
  if (nomeLimpo.length < 2) return { erro: "Informe o nome de quem foi indicado." };
  if (!tel || tel.length < 10) return { erro: "Informe o telefone com DDD." };

  // já existe negociação aberta para esse telefone? não duplica
  const { data: abertos } = await admin.from("tickets").select("id, telefone").neq("etapa", "fechado").not("telefone", "is", null).limit(3000);
  const existente = (abertos ?? []).find((t) => normalizarTelefone(t.telefone as string) === tel);
  let ticketId = existente?.id as string | undefined;
  if (!ticketId) {
    const { data: v } = await admin.from("vendedores").select("pop_id").eq("id", item.vendedor_id as string).maybeSingle();
    const { data: novo, error } = await admin
      .from("tickets")
      .insert({
        origem_criacao: "indicacao",
        cliente_nome: nomeLimpo,
        telefone: telefone.trim(),
        vendedor_id: item.vendedor_id,
        pop_id: v?.pop_id ?? null,
        etapa: "novo",
        indicado_por_contrato_id: contratoId,
      })
      .select("id")
      .single();
    if (error || !novo) return { erro: `Não foi possível criar o ticket: ${error?.message ?? "erro"}` };
    ticketId = novo.id as string;
    await admin.from("ticket_eventos").insert({
      ticket_id: ticketId,
      tipo: "nota",
      dados: { texto: "🤝 Indicação registrada no pós-venda (Meu Dia)." },
      usuario_id: usuario.id,
    });
  }
  const { error: e2 } = await admin
    .from("meu_dia_posvenda")
    .update({ resultado: "indicou", resultado_em: new Date().toISOString(), ticket_indicado_id: ticketId })
    .eq("contrato_id", contratoId);
  if (e2) return { erro: e2.message };
  await registrarLogMeuDia({
    usuarioId: usuario.id,
    contratoId,
    ticketId,
    vendedorId: item.vendedor_id as string,
    acao: "posvenda_indicacao",
    resultado: "indicou",
    dados: { nome: nomeLimpo, ticket_existente: Boolean(existente) },
  });
  revalidatePath("/meu-dia");
  revalidatePath("/crm");
  return { ok: existente ? "Esse telefone já tinha uma negociação aberta — ligada à indicação." : "Indicação registrada: ticket criado no CRM.", ticketId };
}
