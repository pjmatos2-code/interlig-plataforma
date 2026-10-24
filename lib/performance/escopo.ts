import "server-only";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Usuario } from "@/lib/tipos";
import { carregarConfig } from "./config-servidor";

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

export type PapelPerformance = "admin" | "diretoria" | "supervisor" | "gerente_unidade" | "vendedor";

export type EscopoPerformance = {
  usuario: Usuario;
  papel: PapelPerformance;
  /** null = todos os vendedores */
  vendedorIds: string[] | null;
  vendedorProprio: string | null;
  podeVerConversas: boolean;
  podeConfigurar: boolean;
  podeGerirMetas: boolean;
  podeTratarAlertas: boolean;
  /** vendedor vê posições do ranking, sem os números das colegas (PRD 2) */
  verValoresDeColegas: boolean;
  podeExportar: boolean;
};

const PERFIS_VENDEDOR = ["vendedora", "vendedora_externa", "agente_atendimento", "agente_retencao", "agente_corporativo"];

export async function resolverEscopo(usuario: Usuario): Promise<EscopoPerformance | null> {
  const cfg = await carregarConfig();
  const conversasLiberadas = cfg.acesso.conversas.includes(usuario.perfil);
  const base = { usuario, vendedorProprio: null, podeConfigurar: false, podeGerirMetas: false, verValoresDeColegas: true, podeExportar: true };

  if (usuario.perfil === "gestor")
    return { ...base, papel: "admin", vendedorIds: null, podeVerConversas: true, podeConfigurar: true, podeGerirMetas: true, podeTratarAlertas: true };
  if (usuario.perfil === "direcao")
    return { ...base, papel: "diretoria", vendedorIds: null, podeVerConversas: conversasLiberadas, podeTratarAlertas: false };

  const admin = criarClienteAdmin();
  if (usuario.perfil === "supervisor") {
    // time (direto + co-coordenação), incluindo inativos para o histórico
    const [{ data: diretos }, { data: extras }] = await Promise.all([
      admin.from("vendedores").select("id").eq("coordenador_id", usuario.id),
      admin.from("coordenadores_extras").select("vendedor_id").eq("usuario_id", usuario.id),
    ]);
    const time = [...new Set([...(diretos ?? []).map((d) => d.id as string), ...(extras ?? []).map((e) => e.vendedor_id as string)])];
    if (time.length)
      return { ...base, papel: "supervisor", vendedorIds: time, podeVerConversas: conversasLiberadas, podeTratarAlertas: true };
    if (!usuario.pop_id) return null;
    const { data: daPop } = await admin.from("vendedores").select("id").eq("pop_id", usuario.pop_id);
    return { ...base, papel: "gerente_unidade", vendedorIds: (daPop ?? []).map((v) => v.id as string), podeVerConversas: conversasLiberadas, podeTratarAlertas: true };
  }
  if (PERFIS_VENDEDOR.includes(usuario.perfil) && usuario.vendedor_id) {
    return {
      ...base,
      papel: "vendedor",
      vendedorIds: [usuario.vendedor_id],
      vendedorProprio: usuario.vendedor_id,
      podeVerConversas: true, // só as próprias: as consultas já filtram por vendedorIds
      podeTratarAlertas: false,
      verValoresDeColegas: false,
      podeExportar: false,
    };
  }
  return null;
}

/** página do módulo: exige papel com acesso (senão volta para o início) */
export async function exigirEscopo(): Promise<EscopoPerformance> {
  const usuario = await exigirUsuario();
  const escopo = await resolverEscopo(usuario);
  if (!escopo) redirect("/");
  return escopo;
}

/** o escopo alcança este vendedor? */
export function alcanca(escopo: EscopoPerformance, vendedorId: string | null | undefined): boolean {
  if (!vendedorId) return escopo.vendedorIds === null;
  return escopo.vendedorIds === null || escopo.vendedorIds.includes(vendedorId);
}
