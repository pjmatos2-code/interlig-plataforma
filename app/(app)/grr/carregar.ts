import "server-only";
import { exigirPerfil } from "@/lib/auth";
import { timeComMetaNoMes, timeDoCoordenador } from "@/lib/coordenacao";
import { carregarCadastroGrr, carregarGrrComercial } from "@/lib/grr/dados";
import { resolverEscopo } from "@/lib/grr/escopo";
import { resolverSemana, semanasVizinhas } from "@/lib/grr/semana";
import { hojeSantarem, mesDeReferencia, rotuloSemana } from "@/lib/relatorio-semanal/periodo";

export type ParametrosGrr = { semana?: string; unidade?: string; equipe?: string; agente?: string };

/** quem abre o GRR na Etapa 1: direção, administração e coordenação (agentes não acessam) */
export const PERFIS_GRR = ["gestor", "direcao", "supervisor"] as const;

/**
 * Tudo o que as telas do GRR precisam: confere o perfil, resolve a semana e o
 * recorte de quem abriu e lê os números. A coordenação fica presa à própria
 * equipe (o time que vale no mês, como no Dashboard) ou à própria unidade.
 */
export async function carregarTelaGrr(params: ParametrosGrr) {
  const usuario = await exigirPerfil([...PERFIS_GRR]);
  const hoje = hojeSantarem();
  const semana = resolverSemana(params.semana, hoje);
  const cadastro = await carregarCadastroGrr();
  let time: string[] | null = null;
  if (usuario.perfil === "supervisor") {
    const acompanhados = await timeDoCoordenador(usuario.id);
    time = acompanhados ? await timeComMetaNoMes(acompanhados, mesDeReferencia(semana).de) : null;
  }
  const escopo = resolverEscopo(usuario, time, { unidade: params.unidade, equipe: params.equipe, agente: params.agente }, cadastro);
  const dados = await carregarGrrComercial(semana, escopo, cadastro);
  // o que os seletores mostram: só valores que existem e que a pessoa pode escolher
  const unidadeValida = escopo.podeFiltrar.unidade && cadastro.pops.some((p) => p.id === params.unidade) ? params.unidade! : "";
  const filtros = {
    podeFiltrar: escopo.podeFiltrar,
    unidades: cadastro.pops,
    equipes: cadastro.equipes.map((e) => ({ id: e.coordenadorId, nome: e.nome })),
    agentes: escopo.agentesDisponiveis.map((v) => ({ id: v.id, nome: v.nome })),
    valores: { unidade: unidadeValida, equipe: escopo.equipeId ?? "", agente: escopo.agenteId ?? "" },
  };
  return { usuario, hoje, semana, rotuloDaSemana: rotuloSemana(semana), vizinhas: semanasVizinhas(semana, hoje), cadastro, escopo, dados, filtros };
}

/** monta "?semana=…&unidade=…" preservando os filtros, com trocas opcionais */
export function parametrosDaTela(params: ParametrosGrr, trocas: Partial<Record<keyof ParametrosGrr, string | null>> = {}): string {
  const q = new URLSearchParams();
  for (const chave of ["semana", "unidade", "equipe", "agente"] as const) {
    const valor = chave in trocas ? trocas[chave] : params[chave];
    if (valor) q.set(chave, valor);
  }
  const texto = q.toString();
  return texto ? `?${texto}` : "";
}
