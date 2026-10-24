import "server-only";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Usuario } from "@/lib/tipos";
import { carregarConfig } from "./config-servidor";
import { montarEscopo, type EscopoPerformance } from "./escopo-regras";

/**
 * Escopo de acesso da Performance Comercial (24/10/2026) — aplicado no
 * SERVIDOR em toda consulta, exportação e ação (as tabelas do módulo não
 * têm policy de leitura: só o service role lê). Papéis da spec mapeados para
 * a hierarquia que já existe na plataforma:
 *   Administrador      = gestor            → tudo, configurações e metas
 *   Diretoria          = direção           → todas as unidades (leitura)
 *   Supervisor         = coordenador de time → vendedores que coordena
 *   Gerente de unidade = coordenador de unidade → vendedores da sua POP
 *   Vendedor           = vendedora/externa/agentes com vínculo → só o próprio
 * Conteúdo de conversas (resumos, mensagens) só para os perfis liberados em
 * Configurações (padrão: gestor) e para o próprio vendedor nas conversas dele.
 */

export type { EscopoPerformance, PapelPerformance } from "./escopo-regras";
export { alcanca } from "./escopo-regras";

export async function resolverEscopo(usuario: Usuario): Promise<EscopoPerformance | null> {
  const cfg = await carregarConfig();
  let time: string[] = [];
  let daPop: string[] | null = null;
  if (usuario.perfil === "supervisor") {
    const admin = criarClienteAdmin();
    // time (direto + co-coordenação), incluindo inativos para o histórico
    const [{ data: diretos }, { data: extras }] = await Promise.all([
      admin.from("vendedores").select("id").eq("coordenador_id", usuario.id),
      admin.from("coordenadores_extras").select("vendedor_id").eq("usuario_id", usuario.id),
    ]);
    time = [...new Set([...(diretos ?? []).map((d) => d.id as string), ...(extras ?? []).map((e) => e.vendedor_id as string)])];
    if (!time.length && usuario.pop_id) {
      const { data } = await admin.from("vendedores").select("id").eq("pop_id", usuario.pop_id);
      daPop = (data ?? []).map((v) => v.id as string);
    }
  }
  return montarEscopo(usuario, { conversasLiberadas: cfg.acesso.conversas.includes(usuario.perfil), time, daPop });
}

/** página do módulo: exige papel com acesso (senão volta para o início) */
export async function exigirEscopo(): Promise<EscopoPerformance> {
  const usuario = await exigirUsuario();
  const escopo = await resolverEscopo(usuario);
  if (!escopo) redirect("/");
  return escopo;
}
