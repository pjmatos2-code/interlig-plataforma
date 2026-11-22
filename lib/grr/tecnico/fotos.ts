import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeSantarem, ultimaSemanaCompleta, type Semana } from "@/lib/relatorio-semanal/periodo";
import { EMPRESA_GRR } from "../config-dados";
import { SETOR_TECNICO } from "./catalogo";
import { expedienteDaSemana, lerBaseTecnico, lerMetasTecnico, recortesTecnico } from "./dados";
import { montarTecnico, type CartaoTecnico, type RecorteTecnico } from "./regras";

/**
 * Fotos do GRR Técnico (Etapa 1, 21/11/2026): a semana congelada guarda os
 * cartões de cada recorte (empresa e unidades), com as metas vigentes e os
 * estoques medidos no fechamento. Mesma tabela do comercial, setor "tecnico".
 */

export type DadosFotoTecnico = { cartoes: CartaoTecnico[]; trecho: { de: string; ate: string }; geradoEm: string };
export type FotoTecnico = { versao: number; origem: string; congelado_em: string; dados: DadosFotoTecnico };

type Admin = ReturnType<typeof criarClienteAdmin>;

export async function lerFotoTecnico(semana: Semana, recorte: RecorteTecnico, admin: Admin = criarClienteAdmin()): Promise<FotoTecnico | null> {
  let q = admin
    .from("grr_fotos")
    .select("versao, origem, congelado_em, dados")
    .eq("empresa", EMPRESA_GRR)
    .eq("setor", SETOR_TECNICO)
    .eq("periodo_tipo", "semana")
    .eq("periodo_inicio", semana.inicio)
    .eq("escopo_tipo", recorte.chave.tipo);
  q = recorte.chave.ref ? q.eq("escopo_ref", recorte.chave.ref) : q.is("escopo_ref", null);
  const { data, error } = await q.order("versao", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as unknown as FotoTecnico;
}

/** congela a semana do setor técnico em todos os recortes, na mesma versão */
export async function congelarSemanaTecnico(semana: Semana, opcoes: { usuarioId: string | null; motivo: string | null; origem: "manual" | "reuniao" | "rotina"; admin?: Admin }): Promise<{ versao: number; recortes: number }> {
  const hoje = hojeSantarem();
  if (semana.fim >= hoje) throw new Error("Só dá para congelar uma semana completa.");
  const admin = opcoes.admin ?? criarClienteAdmin();
  const [base, { disponivel, metas }, recortes, expediente, existentes] = await Promise.all([
    lerBaseTecnico(semana, hoje, admin),
    lerMetasTecnico(admin),
    recortesTecnico(admin),
    expedienteDaSemana(semana, hoje),
    admin.from("grr_fotos").select("versao").eq("empresa", EMPRESA_GRR).eq("setor", SETOR_TECNICO).eq("periodo_tipo", "semana").eq("periodo_inicio", semana.inicio),
  ]);
  if (!disponivel || existentes.error) throw new Error("As tabelas do GRR não responderam.");
  const versao = Math.max(0, ...(existentes.data ?? []).map((x) => Number(x.versao))) + 1;
  const motivo = opcoes.motivo?.trim() || null;
  if (versao > 1 && !motivo) throw new Error("Esta semana já foi congelada. Informe o motivo para congelar de novo.");
  const geradoEm = new Date().toISOString();
  const linhas = recortes.map((recorte) => {
    const r = montarTecnico({ base, semana, hoje, recorte, metas, expediente });
    const dados: DadosFotoTecnico = { cartoes: r.cartoes, trecho: r.trecho, geradoEm };
    return {
      empresa: EMPRESA_GRR,
      setor: SETOR_TECNICO,
      periodo_tipo: "semana",
      periodo_inicio: semana.inicio,
      periodo_fim: semana.fim,
      escopo_tipo: recorte.chave.tipo,
      escopo_ref: recorte.chave.ref,
      escopo_rotulo: recorte.rotulo,
      versao,
      dados,
      motivo,
      origem: opcoes.origem,
      congelado_por: opcoes.usuarioId,
    };
  });
  const { error } = await admin.from("grr_fotos").insert(linhas);
  if (error) throw new Error(`O banco recusou a foto do setor técnico: ${error.message}`);
  return { versao, recortes: linhas.length };
}

/** fechamento automático do setor técnico: congela a última semana completa se ela ainda não tem foto */
export async function fecharSemanaTecnicoAutomaticamente(): Promise<{ semana: string; resultado: "congelada" | "ja_congelada"; versao: number; recortes?: number }> {
  const semana = ultimaSemanaCompleta(hojeSantarem());
  const admin = criarClienteAdmin();
  const { data, error } = await admin
    .from("grr_fotos")
    .select("versao")
    .eq("empresa", EMPRESA_GRR)
    .eq("setor", SETOR_TECNICO)
    .eq("periodo_tipo", "semana")
    .eq("periodo_inicio", semana.inicio)
    .order("versao", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Não foi possível ler as fotos do setor técnico: ${error.message}`);
  if (data?.length) return { semana: semana.inicio, resultado: "ja_congelada", versao: Number(data[0].versao) };
  const r = await congelarSemanaTecnico(semana, { usuarioId: null, motivo: null, origem: "rotina", admin });
  return { semana: semana.inicio, resultado: "congelada", versao: r.versao, recortes: r.recortes };
}
