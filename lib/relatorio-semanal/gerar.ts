import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { montarDados } from "./dados";
import { montarPlacar } from "./placar";
import { escreverTextos } from "./textos";
import { semanaAnterior, type Semana } from "./periodo";
import type { DadosRelatorio, TextosRelatorio } from "./tipos";

/**
 * Gera (ou regera) o relatório de uma semana: lê os números, calcula o
 * placar, grava, e depois pede os textos ao Claude. Se os textos falharem,
 * o relatório fica com os números e o erro — "Reescrever textos" tenta de
 * novo. Regerar uma semana mantém o que foi digitado na reunião.
 */

export type LinhaRelatorio = {
  id: string;
  semana_inicio: string;
  semana_fim: string;
  dados: DadosRelatorio;
  textos: TextosRelatorio | null;
  textos_erro: string | null;
  reuniao: Record<string, string>;
  token: string;
  gerado_em: string;
};

/** o relatório da semana anterior, para comparar fotos (base, fila, esteira) */
export async function relatorioAnterior(semana: Semana): Promise<LinhaRelatorio | null> {
  const { data } = await criarClienteAdmin()
    .from("relatorios_semanais")
    .select("id, semana_inicio, semana_fim, dados, textos, textos_erro, reuniao, token, gerado_em")
    .lt("semana_inicio", semana.inicio)
    .order("semana_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LinhaRelatorio | null) ?? null;
}

/** checklist combinado numa reunião (ações p1..p5 com responsável) */
export function checklistDaReuniao(reuniao: Record<string, string> | null | undefined): { acao: string; responsavel: string }[] {
  const r = reuniao ?? {};
  return [1, 2, 3, 4, 5]
    .map((n) => ({ acao: (r[`p${n}a`] ?? "").trim(), responsavel: (r[`p${n}r`] ?? "").trim() }))
    .filter((x) => x.acao);
}

async function textosPara(dados: DadosRelatorio, anterior: LinhaRelatorio | null): Promise<{ textos: TextosRelatorio | null; erro: string | null }> {
  try {
    const textos = await escreverTextos(
      dados,
      anterior
        ? {
            checklist: checklistDaReuniao(anterior.reuniao).map((x) => `${x.acao}${x.responsavel ? ` (${x.responsavel})` : ""}`),
            statusAnterior: Object.fromEntries((anterior.dados.placar ?? []).map((p) => [p.indicador, p.status])),
          }
        : null
    );
    return { textos, erro: null };
  } catch (e) {
    return { textos: null, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function gerarRelatorio(semana: Semana, usuarioId: string | null): Promise<{ id: string; erroTextos: string | null }> {
  const admin = criarClienteAdmin();
  const anterior = await relatorioAnterior(semana);
  // só compara com um relatório de no máximo 2 semanas antes
  const comparavel = anterior && anterior.semana_inicio >= semanaAnterior(semanaAnterior(semana)).inicio ? anterior : null;
  const semPlacar = await montarDados(semana, comparavel?.dados ?? null);
  const dados: DadosRelatorio = { ...semPlacar, placar: montarPlacar(semPlacar) };
  const { data, error } = await admin
    .from("relatorios_semanais")
    .upsert(
      {
        semana_inicio: semana.inicio,
        semana_fim: semana.fim,
        dados,
        textos: null,
        textos_erro: null,
        gerado_em: new Date().toISOString(),
        gerado_por: usuarioId,
      },
      { onConflict: "semana_inicio" }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`não foi possível gravar o relatório: ${error?.message ?? "sem resposta"}`);
  const { textos, erro } = await textosPara(dados, comparavel);
  await admin.from("relatorios_semanais").update({ textos, textos_erro: erro }).eq("id", data.id);
  return { id: data.id as string, erroTextos: erro };
}

/** pede os textos de novo, sem reler os números */
export async function reescreverTextos(id: string): Promise<string | null> {
  const admin = criarClienteAdmin();
  const { data } = await admin.from("relatorios_semanais").select("semana_inicio, semana_fim, dados").eq("id", id).maybeSingle();
  if (!data) return "Relatório não encontrado.";
  const anterior = await relatorioAnterior({ inicio: data.semana_inicio as string, fim: data.semana_fim as string });
  const { textos, erro } = await textosPara(data.dados as DadosRelatorio, anterior);
  await admin.from("relatorios_semanais").update({ textos, textos_erro: erro }).eq("id", id);
  return erro;
}
