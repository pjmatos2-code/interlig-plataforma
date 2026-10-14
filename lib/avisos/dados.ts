import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Avisos direcionados (14/10/2026). O alvo é uma UNIÃO: todos, ou quem tiver
 * um dos perfis escolhidos, ou for de uma das unidades, ou estiver na lista
 * de pessoas. Os destinatários são gravados na criação.
 */

export type Alvo = { todos?: boolean; perfis?: string[]; pops?: string[]; usuarios?: string[] };

export type PessoaAviso = { id: string; nome: string; perfil: string; popId: string | null; pop: string | null; setor: string | null };

export async function pessoasAtivas(): Promise<PessoaAviso[]> {
  const admin = criarClienteAdmin();
  const [{ data: us }, { data: pops }] = await Promise.all([
    admin
      .from("usuarios")
      .select("id, nome, perfil, pop_id, vendedores!usuarios_vendedor_fk(setor, pop_id)")
      .eq("ativo", true)
      .order("nome"),
    admin.from("pops").select("id, nome"),
  ]);
  const nomePop = new Map((pops ?? []).map((p) => [p.id as string, p.nome as string]));
  return (us ?? [])
    .filter((u) => !/teste/i.test(String(u.nome)))
    .map((u) => {
      const v = u.vendedores as unknown as { setor: string | null; pop_id: string | null } | null;
      const popId = (u.pop_id as string | null) ?? v?.pop_id ?? null;
      return {
        id: u.id as string,
        nome: u.nome as string,
        perfil: u.perfil as string,
        popId,
        pop: popId ? nomePop.get(popId) ?? null : null,
        setor: v?.setor ?? null,
      };
    });
}

export function resolverAlvo(alvo: Alvo, pessoas: PessoaAviso[], autorId?: string): string[] {
  const perfis = new Set(alvo.perfis ?? []);
  const pops = new Set(alvo.pops ?? []);
  const escolhidos = new Set(alvo.usuarios ?? []);
  return pessoas
    .filter((p) => p.id !== autorId)
    .filter((p) => alvo.todos || perfis.has(p.perfil) || (p.popId && pops.has(p.popId)) || escolhidos.has(p.id))
    .map((p) => p.id);
}

export type AvisoPendente = {
  id: string;
  titulo: string;
  mensagem: string;
  importancia: "normal" | "importante";
  criadoEm: string;
  autor: string | null;
};

export async function avisosPendentes(usuarioId: string): Promise<AvisoPendente[]> {
  const { data, error } = await criarClienteAdmin()
    .from("avisos_destinatarios")
    .select("aviso_id, avisos!inner(id, titulo, mensagem, importancia, criado_em, ativo, usuarios!avisos_criado_por_fkey(nome))")
    .eq("usuario_id", usuarioId)
    .is("lido_em", null)
    .eq("avisos.ativo", true)
    .limit(20);
  if (error) console.error("avisos pendentes:", error.message);
  return (data ?? [])
    .map((d) => {
      const a = d.avisos as unknown as {
        id: string; titulo: string; mensagem: string; importancia: "normal" | "importante"; criado_em: string; usuarios: { nome: string } | null;
      };
      return { id: a.id, titulo: a.titulo, mensagem: a.mensagem, importancia: a.importancia, criadoEm: a.criado_em, autor: a.usuarios?.nome ?? null };
    })
    .sort((a, b) => (a.importancia === b.importancia ? (a.criadoEm < b.criadoEm ? -1 : 1) : a.importancia === "importante" ? -1 : 1));
}

export type AvisoEnviado = {
  id: string;
  titulo: string;
  mensagem: string;
  importancia: "normal" | "importante";
  alvo: Alvo;
  ativo: boolean;
  criadoEm: string;
  autor: string | null;
  destinatarios: { usuarioId: string; nome: string; lidoEm: string | null }[];
};

export async function avisosEnviados(limite = 50): Promise<AvisoEnviado[]> {
  const { data, error } = await criarClienteAdmin()
    .from("avisos")
    .select("id, titulo, mensagem, importancia, alvo, ativo, criado_em, usuarios!avisos_criado_por_fkey(nome), avisos_destinatarios(usuario_id, lido_em, usuarios(nome))")
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) console.error("avisos enviados:", error.message);
  return (data ?? []).map((a) => ({
    id: a.id as string,
    titulo: a.titulo as string,
    mensagem: a.mensagem as string,
    importancia: a.importancia as "normal" | "importante",
    alvo: (a.alvo ?? {}) as Alvo,
    ativo: Boolean(a.ativo),
    criadoEm: a.criado_em as string,
    autor: (a.usuarios as unknown as { nome: string } | null)?.nome ?? null,
    destinatarios: ((a.avisos_destinatarios ?? []) as unknown as { usuario_id: string; lido_em: string | null; usuarios: { nome: string } | null }[])
      .map((d) => ({ usuarioId: d.usuario_id, nome: d.usuarios?.nome ?? "—", lidoEm: d.lido_em }))
      .sort((x, y) => (x.lidoEm ? 1 : 0) - (y.lidoEm ? 1 : 0) || x.nome.localeCompare(y.nome)),
  }));
}
