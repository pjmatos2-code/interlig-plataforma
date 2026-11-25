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

/** lembrete que espera a pessoa confirmar a leitura (aviso fixo na tela) */
export type AvisoConfirmar = Pick<Notificacao, "id" | "titulo" | "descricao" | "link" | "criado_em">;

const ADIAR_MIN = 10;

/** Últimas notificações do usuário logado + contador de não lidas (RLS escopa). */
export async function listarNotificacoes(): Promise<{ itens: Notificacao[]; naoLidas: number; aConfirmar: AvisoConfirmar[] }> {
  await exigirUsuario({ restritos: true });
  // lembretes de ações agendadas: dispara os vencidos (barato: índice parcial)
  const { despacharLembretes } = await import("@/lib/notificacoes/lembretes");
  await despacharLembretes().catch(() => 0);
  // prazos dos planos de ação do GRR (vence amanhã ou atrasado), uma vez por dia
  const { despacharPrazosGrr } = await import("@/lib/grr/planos-dados");
  await despacharPrazosGrr().catch(() => 0);
  const supabase = criarClienteServidor();
  const agora = new Date().toISOString();
  const [{ data: itens }, { count }, { data: aConfirmar }] = await Promise.all([
    supabase
      .from("notificacoes")
      .select("id, tipo, titulo, descricao, link, lida, criado_em")
      .order("criado_em", { ascending: false })
      .limit(20),
    supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("lida", false),
    supabase
      .from("notificacoes")
      .select("id, titulo, descricao, link, criado_em")
      .eq("confirmar", true)
      .is("confirmada_em", null)
      .or(`adiada_ate.is.null,adiada_ate.lte.${agora}`)
      .order("criado_em", { ascending: true })
      .limit(10),
  ]);
  return { itens: (itens ?? []) as Notificacao[], naoLidas: count ?? 0, aConfirmar: (aConfirmar ?? []) as AvisoConfirmar[] };
}

/** Marca as notificações como lidas (todas as não lidas do usuário). */
export async function marcarLidas(): Promise<{ ok: boolean }> {
  await exigirUsuario({ restritos: true });
  const supabase = criarClienteServidor();
  await supabase.from("notificacoes").update({ lida: true }).eq("lida", false);
  return { ok: true };
}

/**
 * "Ciente" no aviso fixo (23/11/2026): confirma a leitura e deixa o recibo no
 * lembrete do ticket (quem confirmou e quando). A notificação é conferida
 * pela RLS — só a própria pessoa confirma o seu aviso.
 */
export async function confirmarAviso(id: string): Promise<{ ok: boolean }> {
  const usuario = await exigirUsuario({ restritos: true });
  const supabase = criarClienteServidor();
  const agora = new Date().toISOString();
  const { data } = await supabase
    .from("notificacoes")
    .update({ confirmada_em: agora, lida: true })
    .eq("id", id)
    .eq("confirmar", true)
    .is("confirmada_em", null)
    .select("ref_id, tipo")
    .maybeSingle();
  if (data?.tipo === "lembrete" && data.ref_id) {
    const { criarClienteAdmin } = await import("@/lib/supabase/admin");
    await criarClienteAdmin()
      .from("ticket_acoes")
      .update({ confirmada_em: agora, confirmada_por: usuario.id })
      .eq("id", data.ref_id)
      .is("confirmada_em", null);
  }
  return { ok: Boolean(data) };
}

/** "Lembrar em 10 min": o aviso some e volta depois, ainda sem confirmar. */
export async function adiarAviso(id: string): Promise<{ ok: boolean }> {
  await exigirUsuario({ restritos: true });
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("notificacoes")
    .update({ adiada_ate: new Date(Date.now() + ADIAR_MIN * 60_000).toISOString() })
    .eq("id", id)
    .eq("confirmar", true)
    .is("confirmada_em", null);
  return { ok: !error };
}
