import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { consistenciaCrm } from "@/lib/comissao/consistencia";

/**
 * Regra ÚNICA de liberação da venda para comissão (D5/D8 + adendo 29/08/2026).
 *
 * Antes essa decisão estava escrita duas vezes — no painel do gestor e no
 * "Minhas vendas" da vendedora — e as duas precisavam mudar juntas. Agora as
 * duas telas chamam daqui, e por isso o número que a vendedora vê é sempre o
 * mesmo que o gestor vê.
 *
 * O que libera automaticamente: contrato ATIVO + Termo de Adesão e Fidelidade
 * assinados + CRM consistente. O que NÃO libera pode ser liberado à mão pelo
 * gestor (comissao_liberacoes) — caso clássico: venda do último dia do mês
 * cuja instalação só cabe na agenda do mês seguinte. A vendedora não pode ser
 * penalizada por uma fila que não é dela.
 */

export type TicketConsistencia = {
  contrato_id: string | null;
  vendedor_id: string | null;
  plano_id: string | null;
};

export type ContratoLiberacao = {
  id: string;
  status: string;
  vendedor_id: string | null;
  plano_id: string | null;
  termo_adesao_assinado: boolean | null;
  fidelidade_assinada: boolean | null;
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
  /** preenchido quando quem liberou foi o gestor, não a regra */
  aprovacaoManual: Aprovacao | null;
};

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
  tickets: TicketConsistencia[],
  nomeVendedora: (id: string | null) => string,
  aprovacao: Aprovacao | null
): Veredito {
  const pendencias: string[] = [];

  if (contrato.termo_adesao_assinado !== true) pendencias.push("Termo de Adesão sem assinatura");
  if (contrato.fidelidade_assinada !== true) pendencias.push("Contrato de Fidelidade sem assinatura");
  if (contrato.status !== "ativo") pendencias.push(`serviço ${contrato.status.replace(/_/g, " ")}`);

  const cons = consistenciaCrm(
    tickets,
    { vendedor_id: contrato.vendedor_id, plano_id: contrato.plano_id },
    nomeVendedora
  );
  if (!cons.ok) pendencias.push(cons.motivo ?? "CRM divergente");

  if (pendencias.length === 0) return { liberada: true, pendencias: [], aprovacaoManual: null };
  if (aprovacao) return { liberada: true, pendencias, aprovacaoManual: aprovacao };
  return { liberada: false, pendencias, aprovacaoManual: null };
}
