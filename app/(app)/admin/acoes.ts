"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { ehVendedora, type Perfil } from "@/lib/tipos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { executarSync, type ResultadoSync } from "@/lib/sync/worker";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type EstadoAdmin = { erro?: string; ok?: boolean };

export async function salvarMotivo(_e: EstadoAdmin, dados: FormData): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const nome = String(dados.get("nome") ?? "").trim();
  if (!nome) return { erro: "Informe o nome do motivo." };

  const supabase = criarClienteServidor();
  const { count } = await supabase
    .from("motivos_nao_conversao")
    .select("*", { count: "exact", head: true });
  const { error } = await supabase
    .from("motivos_nao_conversao")
    .insert({ nome, ativo: true, ordem: (count ?? 0) + 1 });
  if (error)
    return {
      erro: error.code === "23505" ? "Já existe um motivo com esse nome." : error.message,
    };
  revalidatePath("/admin");
  return { ok: true };
}

/** Ativa/desativa (nunca exclui: tickets antigos referenciam o motivo). */
export async function alternarMotivo(id: string, ativo: boolean): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("motivos_nao_conversao")
    .update({ ativo })
    .eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export type EstadoSync = { erro?: string; resultado?: ResultadoSync };

/** Dispara o worker de sync manualmente (gestor). O cron faz o mesmo a cada 10 min. */
export async function sincronizarAgora(): Promise<EstadoSync> {
  await exigirPerfil(["gestor"]);
  try {
    const resultado = await executarSync();
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { resultado };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Usuários (PRD 3.10) — convite pelo gestor, sem autocadastro
// ---------------------------------------------------------------------------
export async function criarUsuario(_e: EstadoAdmin, dados: FormData): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const nome = String(dados.get("nome") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const senha = String(dados.get("senha") ?? "");
  const perfil = String(dados.get("perfil") ?? "");
  const popId = String(dados.get("pop_id") ?? "") || null;
  const vendedorId = String(dados.get("vendedor_id") ?? "") || null;

  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  if (senha.length < 8) return { erro: "Senha provisória precisa de 8+ caracteres." };
  if (!["gestor", "supervisor", "vendedora", "vendedora_externa"].includes(perfil))
    return { erro: "Perfil inválido." };
  const ehVend = ehVendedora(perfil as Perfil);
  if (perfil === "supervisor" && !popId) return { erro: "Coordenador precisa de POP." };
  if (ehVend && !vendedorId)
    return { erro: "Vendedora precisa do vínculo com a vendedora do SGP." };

  const admin = criarClienteAdmin();
  const { data: novo, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (erroAuth) return { erro: `Auth: ${erroAuth.message}` };

  let popFinal = popId;
  if (vendedorId) {
    const { data: v } = await admin.from("vendedores").select("pop_id").eq("id", vendedorId).maybeSingle();
    popFinal = v?.pop_id ?? popFinal;
  }
  const { error } = await admin.from("usuarios").insert({
    id: novo.user.id,
    nome,
    email,
    perfil,
    pop_id: perfil === "gestor" ? null : popFinal,
    vendedor_id: ehVend ? vendedorId : null,
    ativo: true,
  });
  if (error) {
    await admin.auth.admin.deleteUser(novo.user.id); // rollback
    return { erro: error.message };
  }
  if (ehVend && vendedorId) {
    await admin.from("vendedores").update({ usuario_id: novo.user.id }).eq("id", vendedorId);
  }
  if (perfil === "supervisor" && popFinal) {
    await admin.from("pops").update({ supervisor_id: novo.user.id }).eq("id", popFinal);
  }
  revalidatePath("/admin");
  return { ok: true };
}

// Coordenação: define quais agentes ficam sob um coordenador (escopo por agente).
// O coordenador passa a ver só as ações dessas agentes (migração 0025).
export async function definirAgentesCoordenador(_e: EstadoAdmin, dados: FormData): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const coordenadorId = String(dados.get("coordenador_id") ?? "");
  if (!coordenadorId) return { erro: "Selecione o coordenador." };
  const vendedorIds = dados.getAll("vendedor_id").map(String).filter(Boolean);

  const admin = criarClienteAdmin();
  // zera o vínculo atual desse coordenador e aplica o novo conjunto
  const { error: e1 } = await admin
    .from("vendedores")
    .update({ coordenador_id: null })
    .eq("coordenador_id", coordenadorId);
  if (e1) return { erro: e1.message };
  if (vendedorIds.length) {
    const { error: e2 } = await admin
      .from("vendedores")
      .update({ coordenador_id: coordenadorId })
      .in("id", vendedorIds);
    if (e2) return { erro: e2.message };
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function alternarUsuario(id: string, ativo: boolean): Promise<EstadoAdmin> {
  const usuario = await exigirPerfil(["gestor"]);
  if (id === usuario.id) return { erro: "Você não pode desativar a si mesmo." };
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("usuarios").update({ ativo }).eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// De/para de origem (PRD 3.10)
// ---------------------------------------------------------------------------
export async function salvarOrigem(_e: EstadoAdmin, dados: FormData): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const valorSgp = String(dados.get("valor_sgp") ?? "").trim().toUpperCase();
  const categoria = String(dados.get("categoria") ?? "");
  if (!valorSgp) return { erro: "Informe o valor como vem do SGP." };
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("origem_map")
    .upsert({ valor_sgp: valorSgp, categoria }, { onConflict: "valor_sgp" });
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function excluirOrigem(id: string): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("origem_map").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SZ Chat: atendentes ↔ vendedoras e equipes habilitadas (D1)
// ---------------------------------------------------------------------------
export async function salvarAtendente(_e: EstadoAdmin, dados: FormData): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const szId = String(dados.get("sz_atendente_id") ?? "").trim();
  const szNome = String(dados.get("sz_atendente_nome") ?? "").trim() || null;
  const vendedorId = String(dados.get("vendedor_id") ?? "");
  if (!szId || !vendedorId) return { erro: "Informe o ID da atendente no SZ e a vendedora." };
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("sz_atendentes_map")
    .upsert(
      { sz_atendente_id: szId, sz_atendente_nome: szNome, vendedor_id: vendedorId },
      { onConflict: "sz_atendente_id" }
    );
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function excluirAtendente(id: string): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("sz_atendentes_map").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function salvarEquipe(_e: EstadoAdmin, dados: FormData): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const nome = String(dados.get("nome") ?? "").trim();
  const popId = String(dados.get("pop_id") ?? "") || null;
  if (!nome) return { erro: "Informe o nome EXATO da equipe no SZ Chat." };
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("sz_equipes_habilitadas")
    .upsert({ nome, pop_id: popId, ativo: true }, { onConflict: "nome" });
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function alternarEquipe(id: string, ativo: boolean): Promise<EstadoAdmin> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("sz_equipes_habilitadas").update({ ativo }).eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
