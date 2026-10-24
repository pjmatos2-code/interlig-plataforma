import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarConfig } from "./config-servidor";
import { exigirEscopo, type EscopoPerformance } from "./escopo";
import { resolverPeriodoPerf, type PeriodoPerf } from "./periodo";
import { rotuloSetor } from "./dados/calcular";
import type { FiltrosPerformance } from "./dados/apurar";

export type SearchParams = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export type Opcao = { id: string; nome: string };
export type ContextoPagina = {
  escopo: EscopoPerformance;
  periodo: PeriodoPerf;
  filtros: FiltrosPerformance;
  opcoes: { pops: Opcao[]; setores: Opcao[]; coordenadores: Opcao[]; vendedores: Opcao[] };
};

/**
 * Escopo + período + filtros de uma tela do módulo. Valor de filtro fora do
 * escopo do usuário é ignorado (a autorização é sempre do servidor).
 */
export async function contextoPagina(sp: SearchParams): Promise<ContextoPagina> {
  const escopo = await exigirEscopo();
  const cfg = await carregarConfig();
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const periodo = resolverPeriodoPerf({ periodo: um(sp.periodo), de: um(sp.de), ate: um(sp.ate) }, hoje);

  const admin = criarClienteAdmin();
  const [{ data: vends }, { data: pops }, { data: usuarios }] = await Promise.all([
    admin.from("vendedores").select("id, nome, setor, pop_id, coordenador_id, ativo"),
    admin.from("pops").select("id, nome"),
    admin.from("usuarios").select("id, nome"),
  ]);
  const alcancaveis = (vends ?? []).filter(
    (v) => (escopo.vendedorIds === null || escopo.vendedorIds.includes(v.id as string)) && cfg.setores.includes(String(v.setor ?? ""))
  );
  const popsIds = new Set(alcancaveis.map((v) => v.pop_id as string).filter(Boolean));
  const coordIds = new Set(alcancaveis.map((v) => v.coordenador_id as string).filter(Boolean));
  const nomeUsuario = new Map((usuarios ?? []).map((u) => [u.id as string, u.nome as string]));
  const opcoes = {
    pops: (pops ?? []).filter((p) => popsIds.has(p.id as string)).map((p) => ({ id: p.id as string, nome: p.nome as string })).sort((a, b) => a.nome.localeCompare(b.nome)),
    setores: [...new Set(alcancaveis.map((v) => String(v.setor)))].map((s) => ({ id: s, nome: rotuloSetor(s) })),
    coordenadores: [...coordIds].map((id) => ({ id, nome: nomeUsuario.get(id) ?? "Coordenador" })).sort((a, b) => a.nome.localeCompare(b.nome)),
    vendedores: alcancaveis.filter((v) => v.ativo).map((v) => ({ id: v.id as string, nome: v.nome as string })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
  const valido = (v: string | undefined, lista: Opcao[]) => (v && lista.some((o) => o.id === v) ? v : null);
  const filtros: FiltrosPerformance =
    escopo.papel === "vendedor"
      ? { vendedorId: escopo.vendedorProprio }
      : {
          popId: valido(um(sp.pop), opcoes.pops),
          setor: valido(um(sp.setor), opcoes.setores),
          coordenadorId: valido(um(sp.coord), opcoes.coordenadores),
          vendedorId: valido(um(sp.vendedor), opcoes.vendedores),
        };
  return { escopo, periodo, filtros, opcoes };
}
