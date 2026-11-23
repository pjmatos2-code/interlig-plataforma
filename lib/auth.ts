import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { vendeERefideliza } from "@/lib/refidelizacao/agentes";
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

/**
 * A vendedora interna que também refideliza (17/11/2026): o cadastro dela é do
 * comercial, mas o login do SGP está na lista da refidelização.
 */
export async function tambemRefideliza(usuario: Pick<Usuario, "perfil" | "vendedor_id">): Promise<boolean> {
  if (usuario.perfil !== "vendedora" || !usuario.vendedor_id) return false;
  const { data } = await criarClienteAdmin()
    .from("vendedores")
    .select("setor, sgp_login")
    .eq("id", usuario.vendedor_id)
    .maybeSingle();
  return vendeERefideliza(data as { setor: string | null; sgp_login: string | null } | null);
}

/**
 * Fidelidade da base, Prevenção de cancelamento e a atualização dos aditivos
 * são telas do Setor de Atendimento. Quem vende e ainda refideliza entra nelas
 * COMO agente de atendimento — com as mesmas regras da tela, sem exceção
 * espalhada. No resto da plataforma o perfil dela continua o de vendedora.
 */
export async function comoAtendimento(usuario: Usuario): Promise<Usuario> {
  return (await tambemRefideliza(usuario)) ? { ...usuario, perfil: "agente_atendimento" } : usuario;
}

/** exigirPerfil para as telas do Atendimento (ver comoAtendimento). */
export async function exigirPerfilAtendimento(perfis: Perfil[]): Promise<Usuario> {
  const usuario = await comoAtendimento(await exigirUsuario());
  if (!perfis.includes(usuario.perfil)) redirect("/sem-acesso");
  return usuario;
}

/** Rota inicial de cada perfil. */
export function rotaInicial(perfil: Perfil): string {
  if (perfil === "vendedora_externa") return "/meu-painel";
  if (perfil === "agente_corporativo") return "/meu-painel";
  if (perfil === "vendedora") return "/meu-painel";
  if (perfil === "financeiro") return "/financeiro";
  if (perfil === "agente_atendimento") return "/meu-painel";
  if (perfil === "agente_retencao") return "/retencao";
  if (perfil === "gestor_tecnico") return "/tecnica";
  if (perfil === "gestor_infraestrutura") return "/infraestrutura";
  return "/dashboard";
}
