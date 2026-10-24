import type { Usuario } from "@/lib/tipos";

/**
 * Regras puras do escopo da Performance Comercial (24/10/2026) — testadas em
 * escopo.test.ts. O que depende do banco (time do coordenador, vendedores da
 * POP, perfis liberados para conversas) chega pronto em `DadosEscopo`.
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

export const PERFIS_VENDEDOR = ["vendedora", "vendedora_externa", "agente_atendimento", "agente_retencao", "agente_corporativo"];

/** o que só o banco sabe */
export type DadosEscopo = {
  conversasLiberadas: boolean;
  /** vendedores coordenados (direto + co-coordenação), inclusive inativos */
  time: string[];
  /** vendedores da POP do coordenador de unidade; null = sem POP */
  daPop: string[] | null;
  /** papéis liberados nas Configurações além do administrador (diretoria, supervisor, vendedor) */
  papeisLiberados: string[];
};

/** menu: o perfil abre o módulo? (sem consultar o banco — o escopo completo é conferido na tela) */
export function perfilAbreModulo(perfil: string, liberados: string[]): boolean {
  if (perfil === "gestor") return true;
  if (perfil === "direcao") return liberados.includes("diretoria");
  if (perfil === "supervisor") return liberados.includes("supervisor");
  return PERFIS_VENDEDOR.includes(perfil) && liberados.includes("vendedor");
}

/** o papel abre o módulo? administrador sempre; os outros só se o gestor liberou */
export function papelLiberado(papel: PapelPerformance, liberados: string[]): boolean {
  if (papel === "admin") return true;
  return liberados.includes(papel === "gerente_unidade" ? "supervisor" : papel);
}

export function montarEscopo(usuario: Usuario, d: DadosEscopo): EscopoPerformance | null {
  const e = escopoDoPapel(usuario, d);
  return e && papelLiberado(e.papel, d.papeisLiberados) ? e : null;
}

function escopoDoPapel(usuario: Usuario, d: DadosEscopo): EscopoPerformance | null {
  const base = { usuario, vendedorProprio: null, podeConfigurar: false, podeGerirMetas: false, verValoresDeColegas: true, podeExportar: true };
  if (usuario.perfil === "gestor")
    return { ...base, papel: "admin", vendedorIds: null, podeVerConversas: true, podeConfigurar: true, podeGerirMetas: true, podeTratarAlertas: true };
  if (usuario.perfil === "direcao")
    return { ...base, papel: "diretoria", vendedorIds: null, podeVerConversas: d.conversasLiberadas, podeTratarAlertas: false };
  if (usuario.perfil === "supervisor") {
    if (d.time.length) return { ...base, papel: "supervisor", vendedorIds: d.time, podeVerConversas: d.conversasLiberadas, podeTratarAlertas: true };
    if (d.daPop === null) return null;
    return { ...base, papel: "gerente_unidade", vendedorIds: d.daPop, podeVerConversas: d.conversasLiberadas, podeTratarAlertas: true };
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

/** o escopo alcança este vendedor? */
export function alcanca(escopo: EscopoPerformance, vendedorId: string | null | undefined): boolean {
  if (!vendedorId) return escopo.vendedorIds === null;
  return escopo.vendedorIds === null || escopo.vendedorIds.includes(vendedorId);
}
