import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Regra ÚNICA de liberação da venda para comissão (D5/D8 + adendo 29/08/2026).
 *
 * Decisões da gestão em 29/08/2026:
 *
 * 1. A vendedora da venda é a do campo "vendedor" do SGP — sempre. O cliente
 *    pode ter sido atendido no CRM por outra pessoa; isso não muda a autoria
 *    da venda. Por isso divergência de ticket NÃO segura mais a comissão (era
 *    a regra D5 antiga, aposentada aqui).
 * 2. Assinatura é inegociável: sem Termo de Adesão e Contrato de Fidelidade
 *    assinados a venda não comissiona, e nem o gestor pode liberar. É o único
 *    bloqueio absoluto.
 * 3. Serviço ainda não ativo PODE ser liberado à mão pelo gestor — o caso da
 *    venda do dia 31 cuja instalação só cabe na agenda do mês seguinte. A
 *    vendedora não responde pela fila do operacional.
 *
 * As duas telas (painel do gestor e "Minhas vendas") chamam daqui, então o
 * número que a vendedora vê é sempre o mesmo que o gestor vê.
 */

export type ContratoLiberacao = {
  id: string;
  status: string;
  termo_adesao_assinado: boolean | null;
  fidelidade_assinada: boolean | null;
  /** gestor marcou que este contrato não requer assinatura (cortesia, licitação) */
  assinatura_dispensada?: boolean | null;
  /** false em produtos sem Termo/Fidelidade — LigChip e afins */
  planos?: { exige_assinatura?: boolean | null } | null;
};

export type Aprovacao = {
  motivo: string;
  aprovadoPor: string | null;
  criadoEm: string;
};

export type Veredito = {
  liberada: boolean;
  /** o que trava a liberação automática — vazio quando nada trava */
  pendencias: string[];
  /** falta assinatura: nem a gestão pode liberar */
  bloqueioAbsoluto: boolean;
  /** preenchido quando quem liberou foi o gestor, não a regra */
  aprovacaoManual: Aprovacao | null;
};

/**
 * O contrato exige as duas assinaturas? LigChip é só serviço (não tem os
 * documentos), e cortesia/licitação são dispensados caso a caso pelo gestor.
 */
export function exigeAssinatura(c: ContratoLiberacao): boolean {
  if (c.assinatura_dispensada === true) return false;
  if (c.planos && c.planos.exige_assinatura === false) return false;
  return true;
}

/** Pendências que o gestor NÃO pode dispensar pela tela de aprovação. */
export function temPendenciaDeAssinatura(c: ContratoLiberacao): boolean {
  if (!exigeAssinatura(c)) return false;
  return c.termo_adesao_assinado !== true || c.fidelidade_assinada !== true;
}

/** Liberações manuais vigentes (não revogadas) de uma competência. */
export async function liberacoesManuais(
  competenciaIso: string
): Promise<Map<string, Aprovacao>> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("comissao_liberacoes")
    .select("contrato_id, motivo, aprovado_por, criado_em, usuarios!comissao_liberacoes_aprovado_por_fkey(nome)")
    .eq("competencia", competenciaIso)
    .is("revogado_em", null)
    .limit(5000);
  const mapa = new Map<string, Aprovacao>();
  for (const l of data ?? []) {
    const u = l.usuarios as unknown as { nome: string } | null;
    mapa.set(l.contrato_id as string, {
      motivo: l.motivo as string,
      aprovadoPor: u?.nome ?? null,
      criadoEm: l.criado_em as string,
    });
  }
  return mapa;
}

/**
 * Decide se a venda entra na comissão e, se não entrar, diz exatamente o quê
 * está travando (o texto vai direto para a tela da vendedora).
 */
export function avaliarLiberacao(
  contrato: ContratoLiberacao,
  aprovacao: Aprovacao | null
): Veredito {
  const pendencias: string[] = [];
  if (exigeAssinatura(contrato)) {
    if (contrato.termo_adesao_assinado !== true) pendencias.push("Termo de Adesão sem assinatura");
    if (contrato.fidelidade_assinada !== true)
      pendencias.push("Contrato de Fidelidade sem assinatura");
  }
  if (contrato.status !== "ativo") pendencias.push(`serviço ${contrato.status.replace(/_/g, " ")}`);

  const bloqueioAbsoluto = temPendenciaDeAssinatura(contrato);

  if (pendencias.length === 0)
    return { liberada: true, pendencias: [], bloqueioAbsoluto: false, aprovacaoManual: null };

  // assinatura pendente não comissiona nem com aprovação registrada
  if (bloqueioAbsoluto)
    return { liberada: false, pendencias, bloqueioAbsoluto: true, aprovacaoManual: null };

  if (aprovacao)
    return { liberada: true, pendencias, bloqueioAbsoluto: false, aprovacaoManual: aprovacao };

  return { liberada: false, pendencias, bloqueioAbsoluto: false, aprovacaoManual: null };
}
