import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { primeiroDiaDoMes, ultimoDiaDoMes, hojeIso } from "@/lib/datas";

/**
 * Retenção — números do mês pela régua por TAXA (aprovada 30/08/2026).
 *
 * taxa = retidos ÷ (retidos + perdidos + em risco). Irreversíveis e
 * transferidos ficam fora das duas pontas: mudança de cidade e inviabilidade
 * não são derrota da agente (64–92% das perdas nos 3 meses auditados).
 * Em risco (suspenso) conta no denominador de propósito: cliente que ficou
 * sem pagar ainda não é vitória — reativou, vira retido e paga retroativo.
 */

export const FAIXAS_RETENCAO = [
  { min: 50, pct: 10 },
  { min: 65, pct: 15 },
  { min: 75, pct: 20 },
  { min: 85, pct: 30 },
] as const;

export const PISO_ELEGIVEIS = 15;

export function faixaRetencao(taxaPct: number): number {
  return [...FAIXAS_RETENCAO].reverse().find((f) => taxaPct >= f.min)?.pct ?? 0;
}

export type CasoLinha = {
  id: string;
  clienteNome: string;
  sgpContratoId: string | null;
  telefone: string | null;
  valorMensal: number;
  etapa: string;
  desfecho: string | null;
  desfechoAuto: boolean;
  trilha: string | null;
  motivoDeclarado: string | null;
  alcadaUsada: string | null;
  resumo: string | null;
  irreversivelMotivo: string | null;
  clawback: boolean;
  reincidente: boolean;
  origem: string;
  criadoEm: string;
  analise: Record<string, unknown> | null;
};

export type RetencaoMes = {
  competencia: string;
  agente: string;
  casos: number;
  retidos: number;
  perdidos: number;
  emRisco: number;
  irreversiveis: number;
  transferidos: number;
  semResposta: number;
  clawbacks: number;
  elegiveis: number;
  taxaPct: number;
  faixaPct: number;
  abaixoDoPiso: boolean;
  vtvRetido: number;
  comissao: number;
  linhas: CasoLinha[];
};

export async function retencaoDoMes(
  mesIso?: string,
  agenteLogin?: string | null
): Promise<RetencaoMes[]> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(mesIso ?? hojeIso());
  const fim = `${ultimoDiaDoMes(mes)}T23:59:59Z`;

  let q = admin
    .from("casos_retencao")
    .select(
      "id, cliente_nome, sgp_contrato_id, telefone, valor_mensal, etapa, desfecho, desfecho_auto, trilha, motivo_declarado, alcada_usada, resumo, irreversivel_motivo, clawback_em, reincidente_de, origem, criado_em, analise, agente_login"
    )
    .gte("criado_em", mes)
    .lte("criado_em", fim)
    .order("criado_em", { ascending: false })
    .limit(2000);
  if (agenteLogin) q = q.eq("agente_login", agenteLogin.toLowerCase());
  const { data } = await q;

  const porAgente = new Map<string, CasoLinha[]>();
  for (const c of data ?? []) {
    const linha: CasoLinha = {
      id: c.id as string,
      clienteNome: c.cliente_nome as string,
      sgpContratoId: (c.sgp_contrato_id as string) ?? null,
      telefone: (c.telefone as string) ?? null,
      valorMensal: Number(c.valor_mensal ?? 0),
      etapa: c.etapa as string,
      desfecho: (c.desfecho as string) ?? null,
      desfechoAuto: c.desfecho_auto === true,
      trilha: (c.trilha as string) ?? null,
      motivoDeclarado: (c.motivo_declarado as string) ?? null,
      alcadaUsada: (c.alcada_usada as string) ?? null,
      resumo: (c.resumo as string) ?? null,
      irreversivelMotivo: (c.irreversivel_motivo as string) ?? null,
      clawback: c.clawback_em !== null,
      reincidente: c.reincidente_de !== null,
      origem: c.origem as string,
      criadoEm: c.criado_em as string,
      analise: (c.analise as Record<string, unknown>) ?? null,
    };
    const ag = (c.agente_login as string) ?? "(sem agente)";
    porAgente.set(ag, [...(porAgente.get(ag) ?? []), linha]);
  }

  return [...porAgente.entries()].map(([agente, linhas]) => {
    const conta = (d: string) => linhas.filter((l) => l.desfecho === d).length;
    const retidos = conta("retido");
    const perdidos = conta("perdido");
    const emRisco = conta("em_risco");
    const elegiveis = retidos + perdidos + emRisco;
    const taxaPct = elegiveis > 0 ? (retidos / elegiveis) * 100 : 0;
    const abaixoDoPiso = elegiveis < PISO_ELEGIVEIS;
    const faixaPct = abaixoDoPiso ? 0 : faixaRetencao(taxaPct);
    const vtvRetido = linhas
      .filter((l) => l.desfecho === "retido" && !l.clawback)
      .reduce((s, l) => s + l.valorMensal, 0);
    return {
      competencia: mes,
      agente,
      casos: linhas.length,
      retidos,
      perdidos,
      emRisco,
      irreversiveis: conta("irreversivel"),
      transferidos: conta("transferido"),
      semResposta: conta("sem_resposta"),
      clawbacks: linhas.filter((l) => l.clawback).length,
      elegiveis,
      taxaPct,
      faixaPct,
      abaixoDoPiso,
      vtvRetido,
      comissao: (faixaPct / 100) * vtvRetido,
      linhas,
    };
  }).sort((a, b) => b.casos - a.casos);
}
