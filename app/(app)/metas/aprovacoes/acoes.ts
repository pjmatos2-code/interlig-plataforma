"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type Resultado = { erro?: string; ok?: string };

function revalidar() {
  revalidatePath("/metas/aprovacoes");
  revalidatePath("/metas");
  revalidatePath("/minhas-vendas");
  revalidatePath("/vendedoras");
}

/**
 * Libera à mão uma venda que a regra automática segurou (ex.: vendida no
 * último dia do mês, instalação agendada para o mês seguinte). O motivo fica
 * registrado com o nome de quem aprovou — é o que sustenta a decisão depois.
 */
export async function aprovarVenda(
  contratoId: string,
  competencia: string,
  motivo: string,
  pendencias: string[]
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  const texto = motivo.trim();
  if (!contratoId || !competencia) return { erro: "Contrato ou competência ausente." };
  if (texto.length < 5) return { erro: "Descreva o motivo (mín. 5 caracteres)." };

  const admin = criarClienteAdmin();

  // trava dura (decisão 29/08): sem Termo de Adesão e Fidelidade assinados a
  // venda não comissiona — nem por aprovação da gestão. Revalidado aqui no
  // servidor porque esconder o botão na tela não é controle de verdade.
  const { data: contrato } = await admin
    .from("contratos")
    .select("termo_adesao_assinado, fidelidade_assinada")
    .eq("id", contratoId)
    .maybeSingle();
  if (!contrato) return { erro: "Contrato não encontrado." };
  const { temPendenciaDeAssinatura } = await import("@/lib/comissao/liberacao");
  if (temPendenciaDeAssinatura({ id: contratoId, status: "", ...contrato })) {
    return {
      erro: "Contrato sem Termo de Adesão ou Fidelidade assinado — a política não permite liberar.",
    };
  }
  const { error } = await admin.from("comissao_liberacoes").upsert(
    {
      contrato_id: contratoId,
      competencia,
      motivo: texto,
      pendencias_dispensadas: pendencias,
      aprovado_por: usuario.id,
      criado_em: new Date().toISOString(),
      revogado_em: null,
      revogado_por: null,
      revogado_motivo: null,
    },
    { onConflict: "contrato_id,competencia" }
  );
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Venda liberada para a comissão." };
}

/** Desfaz a liberação — o histórico fica (revogado_em), nada é apagado. */
export async function revogarAprovacao(
  contratoId: string,
  competencia: string,
  motivo?: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  if (!contratoId || !competencia) return { erro: "Contrato ou competência ausente." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("comissao_liberacoes")
    .update({
      revogado_em: new Date().toISOString(),
      revogado_por: usuario.id,
      revogado_motivo: motivo?.trim() || "revogada pela gestão",
    })
    .eq("contrato_id", contratoId)
    .eq("competencia", competencia)
    .is("revogado_em", null);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Liberação revogada." };
}

/**
 * Corrige a vendedora do contrato direto na fila — conserta a divergência
 * "ticket é de X, contrato é de Y" sem sair da tela de fechamento.
 */
export async function atribuirVendedoraContrato(
  contratoId: string,
  vendedorId: string
): Promise<Resultado> {
  await exigirPerfil(["gestor"]);
  if (!contratoId || !vendedorId) return { erro: "Escolha a vendedora." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("contratos")
    .update({ vendedor_id: vendedorId })
    .eq("id", contratoId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Vendedora atribuída." };
}

/**
 * Marca que o contrato NÃO requer assinatura — cortesia, ponto de licitação,
 * aditivo de um contrato que já tem instrumento. É diferente de aprovar uma
 * venda sem assinatura: aqui o documento não existe por natureza do negócio.
 */
export async function dispensarAssinatura(
  contratoId: string,
  motivo: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  const texto = motivo.trim();
  if (!contratoId) return { erro: "Contrato ausente." };
  if (texto.length < 5) return { erro: "Descreva o motivo (mín. 5 caracteres)." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("contratos")
    .update({
      assinatura_dispensada: true,
      assinatura_dispensada_motivo: texto,
      assinatura_dispensada_por: usuario.id,
      assinatura_dispensada_em: new Date().toISOString(),
    })
    .eq("id", contratoId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Assinatura dispensada para este contrato." };
}

/** Volta a exigir assinatura (desfaz a dispensa). */
export async function reexigirAssinatura(contratoId: string): Promise<Resultado> {
  await exigirPerfil(["gestor"]);
  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("contratos")
    .update({
      assinatura_dispensada: false,
      assinatura_dispensada_motivo: null,
      assinatura_dispensada_por: null,
      assinatura_dispensada_em: null,
    })
    .eq("id", contratoId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Contrato volta a exigir assinatura." };
}

/**
 * Liga/desliga o débito de inadimplentes na competência inteira. Usado na
 * transição de regra (agosto/2026): a lista de pendentes continua visível para
 * a vendedora acompanhar, mas não desconta da meta.
 */
export async function definirDebitoCompetencia(
  competencia: string,
  aplicar: boolean,
  observacao: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  if (!competencia) return { erro: "Competência ausente." };
  const texto = observacao.trim();
  if (!aplicar && texto.length < 5)
    return { erro: "Explique por que este mês fecha sem débito (mín. 5 caracteres)." };

  const admin = criarClienteAdmin();
  const { error } = await admin.from("comissao_competencia_config").upsert(
    {
      competencia,
      aplicar_debito: aplicar,
      observacao: aplicar ? null : texto,
      definido_por: usuario.id,
      definido_em: new Date().toISOString(),
    },
    { onConflict: "competencia" }
  );
  if (error) return { erro: error.message };
  revalidar();
  return {
    ok: aplicar
      ? "Débito de inadimplentes voltou a contar nesta competência."
      : "Competência fechará sem débito de inadimplentes.",
  };
}
