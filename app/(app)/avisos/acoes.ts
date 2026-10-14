"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { pessoasAtivas, resolverAlvo, type Alvo } from "@/lib/avisos/dados";

export type Resultado = { erro?: string; ok?: string };

export async function criarAviso(_e: Resultado, dados: FormData): Promise<Resultado> {
  const usuario = await exigirUsuario();
  if (usuario.perfil !== "gestor") return { erro: "Só o administrador envia avisos." };
  const titulo = String(dados.get("titulo") ?? "").trim();
  const mensagem = String(dados.get("mensagem") ?? "").trim();
  const importancia = dados.get("importancia") === "importante" ? "importante" : "normal";
  if (titulo.length < 3) return { erro: "Escreva um título (mínimo 3 caracteres)." };
  if (mensagem.length < 3) return { erro: "Escreva a mensagem do aviso." };
  if (titulo.length > 120) return { erro: "Título muito longo (máximo 120 caracteres)." };
  if (mensagem.length > 4000) return { erro: "Mensagem muito longa (máximo 4.000 caracteres)." };

  const alvo: Alvo = {
    todos: dados.get("todos") === "on",
    perfis: dados.getAll("perfis").map(String),
    pops: dados.getAll("pops").map(String),
    usuarios: dados.getAll("usuarios").map(String),
  };
  const ids = resolverAlvo(alvo, await pessoasAtivas(), usuario.id);
  if (ids.length === 0) return { erro: "Escolha para quem vai o aviso — nenhuma pessoa foi selecionada." };

  const admin = criarClienteAdmin();
  const { data: aviso, error } = await admin
    .from("avisos")
    .insert({ titulo, mensagem, importancia, alvo, criado_por: usuario.id })
    .select("id")
    .single();
  if (error || !aviso) return { erro: error?.message ?? "Não foi possível salvar o aviso." };
  const { error: e2 } = await admin
    .from("avisos_destinatarios")
    .insert(ids.map((usuario_id) => ({ aviso_id: aviso.id, usuario_id })));
  if (e2) {
    await admin.from("avisos").delete().eq("id", aviso.id);
    return { erro: e2.message };
  }
  revalidatePath("/avisos");
  return { ok: `Aviso enviado para ${ids.length} ${ids.length === 1 ? "pessoa" : "pessoas"}.` };
}

/** Tira o aviso dos popups (quem ainda não leu deixa de ver). */
export async function alternarAviso(avisoId: string, ativo: boolean): Promise<Resultado> {
  const usuario = await exigirUsuario();
  if (usuario.perfil !== "gestor") return { erro: "Sem permissão." };
  const { error } = await criarClienteAdmin().from("avisos").update({ ativo }).eq("id", avisoId);
  if (error) return { erro: error.message };
  revalidatePath("/avisos");
  return { ok: ativo ? "Aviso reativado." : "Aviso desativado." };
}

/** Quem recebeu confirma a leitura — só a própria linha. */
export async function confirmarLeitura(avisoId: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const { error } = await criarClienteAdmin()
    .from("avisos_destinatarios")
    .update({ lido_em: new Date().toISOString() })
    .eq("aviso_id", avisoId)
    .eq("usuario_id", usuario.id)
    .is("lido_em", null);
  if (error) return { erro: error.message };
  revalidatePath("/avisos");
  return { ok: "Leitura confirmada." };
}
