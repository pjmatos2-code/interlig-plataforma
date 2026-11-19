import type { Perfil } from "@/lib/tipos";
import { resolverEscopo, type CadastroGrr, type EscopoGrr } from "./escopo";
import type { EscopoTipo } from "./planos";

/**
 * Recortes em que a pessoa pode registrar diagnóstico e propor plano (o banco
 * confere de novo): direção e administração em qualquer recorte; coordenação
 * com equipe → a equipe e os agentes dela; sem equipe → a unidade e os
 * agentes da unidade.
 */
export type Recorte = { tipo: EscopoTipo; ref: string | null; rotulo: string };

export const valorDoRecorte = (r: Pick<Recorte, "tipo" | "ref">) => `${r.tipo}:${r.ref ?? ""}`;

export function recortesDePlano(usuario: { id: string; perfil: Perfil; pop_id: string | null }, cadastro: CadastroGrr): Recorte[] {
  const nomePop = new Map(cadastro.pops.map((p) => [p.id, p.nome]));
  const porId = new Map(cadastro.vendedores.map((v) => [v.id, v]));
  const agentes = (ids: string[]) =>
    ids
      .map((id) => porId.get(id))
      .filter((v): v is NonNullable<typeof v> => !!v && v.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map((v) => ({ tipo: "agente" as const, ref: v.id, rotulo: v.nome }));
  if (usuario.perfil === "gestor" || usuario.perfil === "direcao") {
    return [
      { tipo: "empresa", ref: null, rotulo: "Empresa" },
      ...cadastro.pops.map((p) => ({ tipo: "unidade" as const, ref: p.id, rotulo: p.nome })),
      ...cadastro.equipes.map((e) => ({ tipo: "equipe" as const, ref: e.coordenadorId, rotulo: `Equipe de ${e.nome}` })),
      ...agentes(cadastro.vendedores.filter((v) => !v.eh_coordenador).map((v) => v.id)),
    ];
  }
  if (usuario.perfil !== "supervisor") return [];
  const equipe = cadastro.equipes.find((e) => e.coordenadorId === usuario.id);
  if (equipe) return [{ tipo: "equipe", ref: equipe.coordenadorId, rotulo: "Minha equipe" }, ...agentes(equipe.vendedorIds)];
  if (!usuario.pop_id) return [];
  return [
    { tipo: "unidade", ref: usuario.pop_id, rotulo: nomePop.get(usuario.pop_id) ?? "Minha unidade" },
    ...agentes(cadastro.vendedores.filter((v) => v.pop_id === usuario.pop_id && !v.eh_coordenador).map((v) => v.id)),
  ];
}

/** o recorte escolhido, se for um dos permitidos */
export function lerRecorte(valor: string, permitidos: Recorte[]): Recorte | null {
  return permitidos.find((r) => valorDoRecorte(r) === valor) ?? null;
}

/** os indicadores de um recorte, como a direção veria com o filtro correspondente */
export function escopoDoRecorte(r: Pick<Recorte, "tipo" | "ref">, cadastro: CadastroGrr): EscopoGrr {
  const filtros = r.tipo === "equipe" ? { equipe: r.ref ?? undefined } : r.tipo === "unidade" ? { unidade: r.ref ?? undefined } : r.tipo === "agente" ? { agente: r.ref ?? undefined } : {};
  return resolverEscopo({ perfil: "direcao", pop_id: null }, null, filtros, cadastro);
}
