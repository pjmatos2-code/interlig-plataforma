import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeIso, mesAtras, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";

/**
 * Débito de meta por COORTE MENSAL (regra 28/08/2026, adendo à Instrução
 * Geral AGO/2026 — substitui a janela móvel de 90 dias).
 *
 * A competência M avalia SOMENTE as vendas do mês M-3:
 *   agosto/2026  → vendas de maio/2026
 *   setembro/2026 → vendas de junho/2026
 *   outubro/2026  → vendas de julho/2026
 *
 * A LISTA de clientes é fixa (é a coorte do mês M-3, que não muda); o STATUS é
 * reavaliado ao longo do mês e vale o do fechamento: cliente recuperado
 * (reativado ou que quitou a 1ª fatura) SAI do débito. Cada venda é julgada
 * uma única vez — o mesmo cliente nunca debita em dois meses (o que acontecia
 * na janela móvel de 90 dias).
 *
 * Critério de débito (definição do gestor, 28/08): conta como PENDENTE todo
 * contrato da coorte que, no fechamento, NÃO esteja ATIVO — ou seja, que
 * esteja pendente de instalação, inativo (aguardando ativação), suspenso ou
 * cancelado. A venda só se sustenta quando o cliente está ativo e pagando; o
 * que não estiver ativo a agente repõe.
 *
 * Override: uma linha em debitos_meta_mensal com origem 'manual' para a
 * competência/vendedora tem precedência (ajuste validado pela gestão).
 */

export type ItemDebito = {
  vendedorId: string;
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  cliente: string;
  plano: string | null;
  dataVenda: string;
  status: string;
  vencimento1a: string | null;
};

export type DebitoCoorte = {
  /** competência avaliada (1º dia do mês) */
  competencia: string;
  /** mês das vendas analisadas (M-3) */
  coorte: string;
  /** quantidade por vendedora (já com override manual aplicado) */
  porVendedora: Map<string, number>;
  /** contratos que estão debitando, por vendedora */
  itensPorVendedora: Map<string, ItemDebito[]>;
  /** vendedoras cujo número veio de ajuste manual da gestão */
  manuais: Set<string>;
};

/** Mês da coorte avaliada por uma competência (M-3). */
export function mesDaCoorte(competenciaIso: string): string {
  return mesAtras(primeiroDiaDoMes(competenciaIso), 3);
}

export async function debitoPorCoorte(competenciaIso?: string): Promise<DebitoCoorte> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const competencia = primeiroDiaDoMes(competenciaIso ?? hoje);
  const coorte = mesDaCoorte(competencia);
  const fimCoorte = ultimoDiaDoMes(coorte);

  // vendas do mês da coorte que HOJE não estão ativas (pendente de assinatura,
  // aguardando ativação/inativo, suspenso ou cancelado).
  // Join à esquerda de propósito: contrato cancelado costuma vir SEM títulos do
  // SGP e um INNER JOIN o eliminaria do cálculo.
  const { data: candidatos } = await admin
    .from("contratos")
    .select(
      "vendedor_id, sgp_contrato_id, status, data_venda, planos(nome), clientes(nome, sgp_cliente_id), titulos(numero_parcela, status, vencimento)"
    )
    .gte("data_venda", coorte)
    .lte("data_venda", fimCoorte)
    .neq("status", "ativo")
    .not("vendedor_id", "is", null)
    .limit(5000);

  const porVendedora = new Map<string, number>();
  const itensPorVendedora = new Map<string, ItemDebito[]>();

  for (const c of (candidatos ?? []) as unknown as {
    vendedor_id: string;
    sgp_contrato_id: string | null;
    status: string;
    data_venda: string;
    planos: { nome: string } | null;
    clientes: { nome: string; sgp_cliente_id: string | null } | null;
    titulos: { numero_parcela: number; status: string; vencimento: string }[];
  }[]) {
    // status reavaliado AGORA: se o contrato voltar a ATIVO até o fechamento,
    // ele deixa de constar aqui (a consulta já filtra) — recuperar o cliente
    // continua sendo alternativa à reposição.
    const primeira = (c.titulos ?? []).find((t) => t.numero_parcela === 1);

    porVendedora.set(c.vendedor_id, (porVendedora.get(c.vendedor_id) ?? 0) + 1);
    const lista = itensPorVendedora.get(c.vendedor_id) ?? [];
    lista.push({
      vendedorId: c.vendedor_id,
      sgpContratoId: c.sgp_contrato_id,
      sgpClienteId: c.clientes?.sgp_cliente_id ?? null,
      cliente: c.clientes?.nome ?? "—",
      plano: c.planos?.nome ?? null,
      dataVenda: c.data_venda,
      status: c.status,
      vencimento1a: primeira?.vencimento ?? null,
    });
    itensPorVendedora.set(c.vendedor_id, lista);
  }

  // override manual da gestão (precedência sobre o cálculo)
  const manuais = new Set<string>();
  const { data: ajustes } = await admin
    .from("debitos_meta_mensal")
    .select("vendedor_id, quantidade")
    .eq("competencia", competencia)
    .eq("origem", "manual");
  for (const a of ajustes ?? []) {
    porVendedora.set(a.vendedor_id as string, a.quantidade as number);
    manuais.add(a.vendedor_id as string);
  }

  return { competencia, coorte, porVendedora, itensPorVendedora, manuais };
}
