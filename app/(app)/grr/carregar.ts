import "server-only";
import { exigirPerfil } from "@/lib/auth";
import { aplicarConfig } from "@/lib/grr/config";
import { lerConfigGrr } from "@/lib/grr/config-dados";
import { carregarCadastroGrr, carregarGrrComercial } from "@/lib/grr/dados";
import { resolverEscopo } from "@/lib/grr/escopo";
import { chaveDoEscopo } from "@/lib/grr/fotos";
import { lerFoto } from "@/lib/grr/fotos-dados";
import { resolverSemana, semanasVizinhas } from "@/lib/grr/semana";
import { hojeSantarem, mesDeReferencia, rotuloSemana } from "@/lib/relatorio-semanal/periodo";

export type ParametrosGrr = { semana?: string; unidade?: string; equipe?: string; agente?: string; vivo?: string };

/** quem abre o GRR: direção, administração e coordenação (agentes não acessam) */
export const PERFIS_GRR = ["gestor", "direcao", "supervisor"] as const;

/** o que a tela precisa saber sobre a foto da semana */
export type Congelamento = {
  /** as tabelas do GRR existem no banco? */
  disponivel: boolean;
  /** a semana já terminou? Só semana completa é congelada */
  completa: boolean;
  foto: { versao: number; congeladoEm: string; motivo: string | null } | null;
  /** a tela mostra os números de agora (não a foto) */
  aoVivo: boolean;
  podeCongelar: boolean;
};

/**
 * Tudo o que as telas do GRR precisam: confere o perfil, resolve a semana e o
 * recorte de quem abriu e entrega os números. Semana completa que já tem foto
 * abre congelada; `?vivo=1` mostra os números de agora. A coordenação fica
 * presa à própria equipe (o time que vale no mês, como no Dashboard) ou à
 * própria unidade.
 */
export async function carregarTelaGrr(params: ParametrosGrr) {
  const usuario = await exigirPerfil([...PERFIS_GRR]);
  const hoje = hojeSantarem();
  const semana = resolverSemana(params.semana, hoje);
  const [cadastro, config] = await Promise.all([carregarCadastroGrr(mesDeReferencia(semana).de), lerConfigGrr()]);
  const time = usuario.perfil === "supervisor" ? cadastro.equipes.find((e) => e.coordenadorId === usuario.id)?.vendedorIds ?? null : null;
  const escopo = resolverEscopo(usuario, time, { unidade: params.unidade, equipe: params.equipe, agente: params.agente }, cadastro);
  const chave = chaveDoEscopo(escopo, usuario.id);

  const completa = semana.fim < hoje;
  const foto = config.disponivel && completa ? await lerFoto(semana, chave) : null;
  const aoVivo = !foto || params.vivo === "1";
  const dados = aoVivo
    ? await carregarGrrComercial(semana, escopo, cadastro).then((d) => ({ ...d, cartoes: aplicarConfig(d.cartoes, config, chave, semana.inicio) }))
    : foto!.dados;
  const congelamento: Congelamento = {
    disponivel: config.disponivel,
    completa,
    foto: foto ? { versao: foto.versao, congeladoEm: foto.congelado_em, motivo: foto.motivo } : null,
    aoVivo,
    podeCongelar: usuario.perfil === "gestor" || usuario.perfil === "direcao",
  };

  // o que os seletores mostram: só valores que existem e que a pessoa pode escolher
  const unidadeValida = escopo.podeFiltrar.unidade && cadastro.pops.some((p) => p.id === params.unidade) ? params.unidade! : "";
  const filtros = {
    podeFiltrar: escopo.podeFiltrar,
    unidades: cadastro.pops,
    equipes: cadastro.equipes.map((e) => ({ id: e.coordenadorId, nome: e.nome })),
    agentes: escopo.agentesDisponiveis.map((v) => ({ id: v.id, nome: v.nome })),
    valores: { unidade: unidadeValida, equipe: escopo.equipeId ?? "", agente: escopo.agenteId ?? "" },
  };
  return { usuario, hoje, semana, rotuloDaSemana: rotuloSemana(semana), vizinhas: semanasVizinhas(semana, hoje), cadastro, config, escopo, dados, filtros, congelamento };
}

/** monta "?semana=…&unidade=…" preservando os filtros, com trocas opcionais */
export function parametrosDaTela(params: ParametrosGrr, trocas: Partial<Record<keyof ParametrosGrr, string | null>> = {}): string {
  const q = new URLSearchParams();
  for (const chave of ["semana", "unidade", "equipe", "agente", "vivo"] as const) {
    const valor = chave in trocas ? trocas[chave] : params[chave];
    if (valor) q.set(chave, valor);
  }
  const texto = q.toString();
  return texto ? `?${texto}` : "";
}
