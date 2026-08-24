"use server";

import { exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  lida: boolean;
  criado_em: string;
};

/** Últimas notificações do usuário logado + contador de não lidas (RLS escopa). */
export async function listarNotificacoes(): Promise<{ itens: Notificacao[]; naoLidas: number }> {
  await exigirUsuario();
  const supabase = criarClienteServidor();
  const [{ data: itens }, { count }] = await Promise.all([
    supabase
      .from("notificacoes")
      .select("id, tipo, titulo, descricao, link, lida, criado_em")
      .order("criado_em", { ascending: false })
      .limit(20),
    supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("lida", false),
  ]);
  return { itens: (itens ?? []) as Notificacao[], naoLidas: count ?? 0 };
}

/** Marca as notificações como lidas (todas as não lidas do usuário). */
export async function marcarLidas(): Promise<{ ok: boolean }> {
  await exigirUsuario();
  const supabase = criarClienteServidor();
  await supabase.from("notificacoes").update({ lida: true }).eq("lida", false);
  return { ok: true };
}
