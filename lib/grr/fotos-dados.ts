import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeSantarem, mesDeReferencia, type Semana } from "@/lib/relatorio-semanal/periodo";
import { aplicarConfig, type ChaveEscopo } from "./config";
import { EMPRESA_GRR, SETOR_GRR, lerConfigGrr } from "./config-dados";
import { carregarCadastroGrr, lerBaseGrr } from "./dados";
import { escoposParaCongelar, paraFoto, proximaVersao, type FotoGrr } from "./fotos";
import { montarGrr } from "./montar";

const CAMPOS_FOTO = "id, periodo_inicio, periodo_fim, escopo_tipo, escopo_ref, escopo_rotulo, versao, motivo, origem, congelado_em, congelado_por";

/** a foto mais recente (maior versão) de uma semana, no recorte dado; null se não há ou se as tabelas ainda não existem */
export async function lerFoto(semana: Semana, chave: ChaveEscopo): Promise<FotoGrr | null> {
  let consulta = criarClienteServidor()
    .from("grr_fotos")
    .select(`${CAMPOS_FOTO}, dados`)
    .eq("empresa", EMPRESA_GRR)
    .eq("setor", SETOR_GRR)
    .eq("periodo_tipo", "semana")
    .eq("periodo_inicio", semana.inicio)
    .eq("escopo_tipo", chave.tipo);
  consulta = chave.ref ? consulta.eq("escopo_ref", chave.ref) : consulta.is("escopo_ref", null);
  const { data, error } = await consulta.order("versao", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as unknown as FotoGrr;
}

export type LinhaHistorico = Omit<FotoGrr, "dados">;

/** fotos de um recorte, da semana mais recente para a mais antiga (sem os dados) */
export async function listarFotos(chave: ChaveEscopo): Promise<{ disponivel: boolean; fotos: LinhaHistorico[] }> {
  let consulta = criarClienteServidor().from("grr_fotos").select(CAMPOS_FOTO).eq("empresa", EMPRESA_GRR).eq("setor", SETOR_GRR).eq("periodo_tipo", "semana").eq("escopo_tipo", chave.tipo);
  consulta = chave.ref ? consulta.eq("escopo_ref", chave.ref) : consulta.is("escopo_ref", null);
  const { data, error } = await consulta.order("periodo_inicio", { ascending: false }).order("versao", { ascending: false }).limit(300);
  if (error) return { disponivel: false, fotos: [] };
  return { disponivel: true, fotos: (data ?? []) as unknown as LinhaHistorico[] };
}

/**
 * Congela a semana: lê a base uma vez, monta o painel de cada recorte
 * (empresa, unidades, equipes e agentes) com as metas vigentes na semana e
 * grava uma foto por recorte, todas na mesma versão. Congelar de novo abre a
 * versão seguinte e exige o motivo; as versões anteriores ficam guardadas.
 * A leitura e a gravação usam a sessão de quem pediu (administração ou direção).
 */
export async function congelarSemana(semana: Semana, opcoes: { usuarioId: string; motivo: string | null }): Promise<{ versao: number; recortes: number }> {
  const hoje = hojeSantarem();
  if (semana.fim >= hoje) throw new Error("Só dá para congelar uma semana completa.");
  const supabase = criarClienteServidor();
  const [cadastro, config, { base, ehExpediente }, existentes] = await Promise.all([
    carregarCadastroGrr(mesDeReferencia(semana).de),
    lerConfigGrr(supabase),
    lerBaseGrr(semana, supabase),
    supabase.from("grr_fotos").select("versao").eq("empresa", EMPRESA_GRR).eq("setor", SETOR_GRR).eq("periodo_tipo", "semana").eq("periodo_inicio", semana.inicio),
  ]);
  if (!config.disponivel || existentes.error) throw new Error("As tabelas do GRR ainda não existem no banco. Aplique a migração 0134 antes de congelar.");
  const { versao, exigeMotivo } = proximaVersao((existentes.data ?? []).map((x) => Number(x.versao)));
  const motivo = opcoes.motivo?.trim() || null;
  if (exigeMotivo && !motivo) throw new Error("Esta semana já foi congelada. Informe o motivo para congelar de novo.");

  const linhas = escoposParaCongelar(cadastro).map(({ chave, escopo }) => {
    const dados = montarGrr(base, semana, escopo, cadastro, ehExpediente, hoje);
    return {
      empresa: EMPRESA_GRR,
      setor: SETOR_GRR,
      periodo_tipo: "semana",
      periodo_inicio: semana.inicio,
      periodo_fim: semana.fim,
      escopo_tipo: chave.tipo,
      escopo_ref: chave.ref,
      escopo_rotulo: escopo.rotulo,
      versao,
      dados: paraFoto({ ...dados, cartoes: aplicarConfig(dados.cartoes, config, chave, semana.inicio) }),
      motivo,
      origem: "manual",
      congelado_por: opcoes.usuarioId,
    };
  });
  const { error } = await supabase.from("grr_fotos").insert(linhas);
  if (error) throw new Error(`O banco recusou a foto: ${error.message}`);
  return { versao, recortes: linhas.length };
}
