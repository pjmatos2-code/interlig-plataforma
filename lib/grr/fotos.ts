import type { ChaveEscopo } from "./config";
import { resolverEscopo, type CadastroGrr, type EscopoGrr } from "./escopo";
import type { DadosGrr } from "./montar";

/**
 * Fotos do GRR (Etapa 2): os resultados de uma semana congelados por
 * recorte. Funções puras; a gravação está em lib/grr/fotos-dados.ts.
 */

export type FotoGrr = {
  id: string;
  periodo_inicio: string;
  periodo_fim: string;
  escopo_tipo: ChaveEscopo["tipo"];
  escopo_ref: string | null;
  escopo_rotulo: string;
  versao: number;
  dados: DadosGrr;
  motivo: string | null;
  origem: "manual" | "rotina" | "reuniao";
  congelado_em: string;
  congelado_por: string | null;
};

/** o que entra na foto: tudo o que o painel mostrou, menos a lista de tickets (nomes de clientes não são congelados) */
export function paraFoto(dados: DadosGrr): DadosGrr {
  return { ...dados, tickets: [] };
}

/** como o recorte da tela é guardado: empresa; unidade + id; equipe + id do coordenador; agente + id */
export function chaveDoEscopo(escopo: EscopoGrr, usuarioId: string): ChaveEscopo {
  if (escopo.nivel === "agente") return { tipo: "agente", ref: escopo.agenteId };
  if (escopo.nivel === "equipe") return { tipo: "equipe", ref: escopo.equipeId ?? usuarioId };
  if (escopo.nivel === "unidade") return { tipo: "unidade", ref: escopo.popId };
  return { tipo: "empresa", ref: null };
}

/** todos os recortes que uma foto da semana cobre: a empresa, cada unidade, cada equipe e cada agente de venda */
export function escoposParaCongelar(cadastro: CadastroGrr): { chave: ChaveEscopo; escopo: EscopoGrr }[] {
  const direcao = { perfil: "direcao" as const, pop_id: null };
  const empresa = resolverEscopo(direcao, null, {}, cadastro);
  return [
    { chave: { tipo: "empresa" as const, ref: null }, escopo: empresa },
    ...cadastro.pops.map((p) => ({ chave: { tipo: "unidade" as const, ref: p.id }, escopo: resolverEscopo(direcao, null, { unidade: p.id }, cadastro) })),
    ...cadastro.equipes.map((e) => ({ chave: { tipo: "equipe" as const, ref: e.coordenadorId }, escopo: resolverEscopo(direcao, null, { equipe: e.coordenadorId }, cadastro) })),
    ...empresa.agentesDisponiveis.map((v) => ({ chave: { tipo: "agente" as const, ref: v.id }, escopo: resolverEscopo(direcao, null, { agente: v.id }, cadastro) })),
  ];
}

/** a próxima versão da foto de uma semana e se ela precisa de motivo */
export function proximaVersao(versoesExistentes: number[]): { versao: number; exigeMotivo: boolean } {
  const maior = versoesExistentes.length ? Math.max(...versoesExistentes) : 0;
  return { versao: maior + 1, exigeMotivo: maior >= 1 };
}
