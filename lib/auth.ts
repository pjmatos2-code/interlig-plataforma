import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Perfil, Usuario } from "@/lib/tipos";

/** Usuário autenticado + linha em `usuarios`. Null se não houver sessão. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("id, nome, email, perfil, pop_id, vendedor_id, ativo")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Usuario | null) ?? null;
}

/** Exige sessão válida e cadastro ativo. Sem autocadastro (PRD seção 2). */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  if (!usuario.ativo) redirect("/sem-acesso?motivo=inativo");
  return usuario;
}

/** Bloqueia a rota por perfil. A RLS já barra os dados; isto evita tela vazia. */
export async function exigirPerfil(perfis: Perfil[]): Promise<Usuario> {
  const usuario = await exigirUsuario();
  if (!perfis.includes(usuario.perfil)) redirect("/sem-acesso");
  return usuario;
}

/** Rota inicial de cada perfil. */
export function rotaInicial(perfil: Perfil): string {
  if (perfil === "vendedora_externa") return "/externa";
  if (perfil === "agente_corporativo") return "/corporativo";
  if (perfil === "vendedora") return "/minhas-vendas";
  if (perfil === "financeiro") return "/financeiro";
  if (perfil === "agente_atendimento") return "/atendimento";
  return "/dashboard";
}
