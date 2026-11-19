import type { Perfil } from "@/lib/tipos";

/**
 * Escopo do GRR: o recorte que a pessoa enxerga e o que ela pode filtrar.
 * Função pura (o cadastro e o time do coordenador entram por parâmetro) —
 * a mesma regra de acesso do Dashboard: direção e administração veem a
 * empresa e podem filtrar; a coordenação fica presa à própria equipe
 * (quem coordena agentes) ou à própria unidade (quem não coordena ninguém).
 * A permissão por linha do banco continua valendo por baixo.
 */

export type NivelEscopo = "empresa" | "unidade" | "equipe" | "agente";

export type VendedorGrr = {
  id: string;
  nome: string;
  pop_id: string | null;
  setor: string | null;
  ativo: boolean;
  eh_coordenador: boolean;
  coordenador_id: string | null;
};

export type EquipeGrr = { coordenadorId: string; nome: string; vendedorIds: string[] };

export type CadastroGrr = {
  pops: { id: string; nome: string }[];
  vendedores: VendedorGrr[];
  /** equipe direta ∪ apoio de cada coordenador (uma agente pode estar em mais de uma) */
  equipes: EquipeGrr[];
};

export type EscopoGrr = {
  nivel: NivelEscopo;
  rotulo: string;
  /** unidade do recorte (null = todas) */
  popId: string | null;
  /** agentes do recorte (null = sem recorte por agente) */
  vendedorIds: string[] | null;
  /** equipe escolhida no filtro (só direção e administração) */
  equipeId: string | null;
  /** agente escolhido no filtro */
  agenteId: string | null;
  /** o que a pessoa pode trocar na tela */
  podeFiltrar: { unidade: boolean; equipe: boolean; agente: boolean };
  /** agentes que podem aparecer no seletor */
  agentesDisponiveis: VendedorGrr[];
};

export type FiltrosEscopo = { unidade?: string; equipe?: string; agente?: string };

const SETORES_VENDA = ["comercial_interno", "comercial_externo", "corporativo"];

/** quem aparece nos seletores e nas quebras por agente: time de vendas ativo, sem coordenadores */
export function agentesDeVenda(vendedores: VendedorGrr[]): VendedorGrr[] {
  return vendedores
    .filter((v) => v.ativo && !v.eh_coordenador && SETORES_VENDA.includes(String(v.setor)))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function resolverEscopo(
  usuario: { perfil: Perfil; pop_id: string | null },
  /** time que vale no mês para quem coordena agentes; null para quem não coordena */
  timeDoUsuario: string[] | null,
  filtros: FiltrosEscopo,
  cadastro: CadastroGrr
): EscopoGrr {
  const nomePop = new Map(cadastro.pops.map((p) => [p.id, p.nome]));
  const porId = new Map(cadastro.vendedores.map((v) => [v.id, v]));
  const todos = agentesDeVenda(cadastro.vendedores);

  // ---------- coordenação: recorte travado ----------
  if (usuario.perfil === "supervisor") {
    const deTime = timeDoUsuario !== null;
    const disponiveis = deTime
      ? timeDoUsuario.map((id) => porId.get(id)).filter((v): v is VendedorGrr => !!v).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      : todos.filter((v) => usuario.pop_id !== null && v.pop_id === usuario.pop_id);
    const agente = filtros.agente && disponiveis.some((v) => v.id === filtros.agente) ? porId.get(filtros.agente)! : null;
    const base = {
      equipeId: null,
      podeFiltrar: { unidade: false, equipe: false, agente: disponiveis.length > 1 },
      agentesDisponiveis: disponiveis,
    };
    if (agente)
      return { nivel: "agente", rotulo: agente.nome, popId: deTime ? null : usuario.pop_id, vendedorIds: [agente.id], agenteId: agente.id, ...base };
    if (deTime) return { nivel: "equipe", rotulo: "Minha equipe", popId: null, vendedorIds: timeDoUsuario, agenteId: null, ...base };
    return {
      nivel: "unidade",
      rotulo: usuario.pop_id ? nomePop.get(usuario.pop_id) ?? "Minha unidade" : "Minha unidade",
      // sem unidade no cadastro, nada entra no recorte (nunca a empresa inteira)
      popId: usuario.pop_id ?? "sem-unidade",
      vendedorIds: null,
      agenteId: null,
      ...base,
    };
  }

  // ---------- direção e administração: empresa, com filtros ----------
  const unidade = filtros.unidade && nomePop.has(filtros.unidade) ? filtros.unidade : null;
  const equipe = filtros.equipe ? cadastro.equipes.find((e) => e.coordenadorId === filtros.equipe) ?? null : null;
  const noRecorte = (v: VendedorGrr) => (!unidade || v.pop_id === unidade) && (!equipe || equipe.vendedorIds.includes(v.id));
  const disponiveis = todos.filter(noRecorte);
  const agente = filtros.agente ? disponiveis.find((v) => v.id === filtros.agente) ?? null : null;
  const base = {
    equipeId: equipe?.coordenadorId ?? null,
    podeFiltrar: { unidade: true, equipe: cadastro.equipes.length > 0, agente: true },
    agentesDisponiveis: disponiveis,
  };
  // equipe e agente recortam pelas pessoas: a venda conta para quem vendeu,
  // em qualquer unidade (a unidade só estreita a lista de agentes do seletor)
  if (agente) return { nivel: "agente", rotulo: agente.nome, popId: null, vendedorIds: [agente.id], agenteId: agente.id, ...base };
  if (equipe) return { nivel: "equipe", rotulo: `Equipe de ${equipe.nome}`, popId: null, vendedorIds: equipe.vendedorIds, agenteId: null, ...base };
  if (unidade) return { nivel: "unidade", rotulo: nomePop.get(unidade)!, popId: unidade, vendedorIds: null, agenteId: null, ...base };
  return { nivel: "empresa", rotulo: "Empresa", popId: null, vendedorIds: null, agenteId: null, ...base };
}

/** o registro (contrato ou ticket) está no recorte? */
export function noEscopo(escopo: Pick<EscopoGrr, "popId" | "vendedorIds">, r: { pop_id: string | null; vendedor_id: string | null }): boolean {
  if (escopo.popId && r.pop_id !== escopo.popId) return false;
  if (escopo.vendedorIds && !(r.vendedor_id && escopo.vendedorIds.includes(r.vendedor_id))) return false;
  return true;
}
