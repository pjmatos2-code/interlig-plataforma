"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type Resultado = { erro?: string; ok?: string };

function revalidar() {
  revalidatePath("/refidelizacao");
  revalidatePath("/minha-comissao");
  revalidatePath("/minhas-vendas");
  revalidatePath("/metas");
}

/**
 * Decide um aditivo à mão. Aprovar libera para a comissão mesmo sem as duas
 * assinaturas (ex.: cliente assinou em papel); reprovar tira da conta mesmo
 * estando assinado (ex.: duplicidade no mesmo contrato). Sempre com motivo —
 * é o que sustenta a decisão no fechamento.
 */
export async function decidirAditivo(
  aditivoId: string,
  decisao: "aprovado" | "reprovado",
  motivo: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  const texto = motivo.trim();
  if (!aditivoId) return { erro: "Aditivo ausente." };
  if (texto.length < 5) return { erro: "Descreva o motivo (mín. 5 caracteres)." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("aditivos")
    .update({
      decisao,
      decisao_motivo: texto,
      decisao_por: usuario.id,
      decisao_em: new Date().toISOString(),
    })
    .eq("id", aditivoId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: decisao === "aprovado" ? "Aditivo liberado." : "Aditivo reprovado." };
}

/** Volta a valer a régua automática (assinatura do SGPsign). */
export async function limparDecisao(aditivoId: string): Promise<Resultado> {
  await exigirPerfil(["gestor"]);
  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("aditivos")
    .update({ decisao: null, decisao_motivo: null, decisao_por: null, decisao_em: null })
    .eq("id", aditivoId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Decisão desfeita — vale a assinatura do SGPsign." };
}

/**
 * Corrige o valor mensal quando o SGP guarda cobrança anual (caso do plano
 * dedicado). O sync não sobrescreve este campo.
 */
export async function ajustarValor(
  aditivoId: string,
  valor: number,
  motivo: string
): Promise<Resultado> {
  await exigirPerfil(["gestor"]);
  const texto = motivo.trim();
  if (!(valor > 0)) return { erro: "Informe um valor mensal maior que zero." };
  if (texto.length < 5) return { erro: "Explique o motivo do ajuste." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("aditivos")
    .update({ valor_mensal_ajustado: valor, valor_ajuste_motivo: texto })
    .eq("id", aditivoId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Valor ajustado." };
}

/** Busca os aditivos do mês no SGP e atualiza a base. A agente também pode
 * rodar: depois de regularizar a assinatura no SGP, ela mesma atualiza e o
 * aditivo sai de pendente. Sem mês informado, vale o mês corrente. */
export async function sincronizar(mes?: string): Promise<Resultado> {
  await exigirPerfil(["gestor", "agente_atendimento"]);
  const { primeiroDiaDoMes, hojeIso } = await import("@/lib/datas");
  const { sincronizarAditivos } = await import("@/lib/sgp/aditivos");
  const r = await sincronizarAditivos(mes ?? primeiroDiaDoMes(hojeIso()));
  if (!r.ok) return { erro: r.erro ?? "Falha na sincronização." };
  revalidar();
  return { ok: `${r.lidos} aditivo(s) lidos · ${r.validos} com as duas assinaturas.` };
}

/**
 * Aprova vários aditivos de uma vez, com um único motivo. Só aprovação — a
 * reprovação continua caso a caso, porque cada uma precisa da sua justificativa.
 */
export async function decidirEmLote(ids: string[], motivo: string): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  const texto = motivo.trim();
  if (!ids.length) return { erro: "Nenhum aditivo selecionado." };
  if (texto.length < 5) return { erro: "Descreva o motivo (mín. 5 caracteres)." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("aditivos")
    .update({
      decisao: "aprovado",
      decisao_motivo: texto,
      decisao_por: usuario.id,
      decisao_em: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: `${ids.length} aditivo(s) liberados.` };
}
