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
 *
 * Chave da competência: comissao_competencia_config.aplicar_debito=false
 * zera o débito do mês inteiro — a LISTA de pendentes continua sendo montada e
 * exibida (acompanhamento), mas não desconta da meta de ninguém. Foi o caso de
 * agosto/2026, mês de transição entre as duas regras.
 */

export type FarolFatura = {
  parcela: number;
  /** paga = liquidada · atrasada = aberta e vencida · a_vencer = aberta no prazo ou ainda não gerada */
  situacao: "paga" | "atrasada" | "a_vencer";
  vencimento: string | null;
};

export type ItemDebito = {
  vendedorId: string;
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  cliente: string;
  plano: string | null;
  dataVenda: string;
  status: string;
  vencimento1a: string | null;
  /** farol das 3 primeiras faturas — as únicas que julgam a venda */
  faturas: FarolFatura[];
};

export type DebitoCoorte = {
  /** competência avaliada (1º dia do mês) */
  competencia: string;
  /** mês das vendas analisadas (M-3) — regra vigente até agosto/2026 */
  coorte: string;
  /** janela de vencimentos 21→20 (regra de setembro/2026 em diante); null antes */
  janela: { de: string; ate: string } | null;
  /** quantidade por vendedora (já com override manual aplicado) */
  porVendedora: Map<string, number>;
  /** contratos que estão debitando, por vendedora */
  itensPorVendedora: Map<string, ItemDebito[]>;
  /** vendedoras cujo número veio de ajuste manual da gestão */
  manuais: Set<string>;
  /** false quando a competência foi fechada sem débito (lista só informativa) */
  aplicado: boolean;
  /** por que o mês não aplica débito */
  observacao: string | null;
};

/** Mês da coorte avaliada por uma competência (M-3). */
export function mesDaCoorte(competenciaIso: string): string {
  return mesAtras(primeiroDiaDoMes(competenciaIso), 3);
}

/**
 * Regra de setembro/2026 em diante (Política Early Churn — Apuração por
 * Período, 31/08): a competência M avalia as vendas cujo 1º VENCIMENTO caiu
 * na janela de 21 do mês M-4 a 20 do mês M-3. Assim o último vencimento da
 * janela já cumpriu maturação (3 meses) + bloqueio de confirmação (D+6) e
 * ainda sobra folga de validação até o fechamento.
 *   setembro/2026 → vencimentos de 21/05 a 20/06
 *   outubro/2026  → vencimentos de 21/06 a 20/07
 */
export const INICIO_APURACAO_POR_PERIODO = "2026-09-01";

export function janelaDaCompetencia(
  competenciaIso: string
): { de: string; ate: string } | null {
  const competencia = primeiroDiaDoMes(competenciaIso);
  if (competencia < INICIO_APURACAO_POR_PERIODO) return null;
  return {
    de: `${mesAtras(competencia, 4).slice(0, 7)}-21`,
    ate: `${mesAtras(competencia, 3).slice(0, 7)}-20`,
  };
}

export async function debitoPorCoorte(competenciaIso?: string): Promise<DebitoCoorte> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const competencia = primeiroDiaDoMes(competenciaIso ?? hoje);
  const coorte = mesDaCoorte(competencia);
  const fimCoorte = ultimoDiaDoMes(coorte);
  const janela = janelaDaCompetencia(competencia);

  // Recorte dos candidatos:
  // - até agosto/2026: vendas do MÊS da coorte (M-3), por data_venda;
  // - de setembro/2026 em diante: vendas cujo 1º VENCIMENTO cai na janela
  //   21→20 (o SQL pega uma margem por data_venda e o filtro fino da janela
  //   é feito abaixo, com o título em mãos).
  // Join à esquerda de propósito: contrato cancelado costuma vir SEM títulos do
  // SGP e um INNER JOIN o eliminaria do cálculo.
  const { data: candidatos } = await admin
    .from("contratos")
    .select(
      "vendedor_id, sgp_contrato_id, status, data_venda, planos(nome), clientes(nome, sgp_cliente_id), titulos(numero_parcela, status, vencimento)"
    )
    .gte("data_venda", janela ? mesAtras(primeiroDiaDoMes(janela.de), 2) : coorte)
    .lte("data_venda", janela ? janela.ate : fimCoorte)
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

    if (janela) {
      // âncora da janela = 1º vencimento; sem título (cancelado cedo demais
      // para faturar), estima-se venda + 30 dias para o cliente não escapar
      // da régua por nunca ter sido cobrado.
      const venc =
        primeira?.vencimento ??
        new Date(Date.parse(`${c.data_venda}T00:00:00Z`) + 30 * 86_400_000)
          .toISOString()
          .slice(0, 10);
      if (venc < janela.de || venc > janela.ate) continue;
    }

    // Regra de 04/09/2026 (decisão do gestor): instalação que NÃO foi
    // efetivada não penaliza a agente — a venda nem virou cliente; a cobrança
    // do que travou a ativação é da esteira, não da régua de inadimplência.
    if (c.status === "aguardando_ativacao" || c.status === "pendente_assinatura") continue;

    // Regra de 03/09/2026 (decisão do gestor): a análise continua nos 90 dias,
    // mas só as 3 PRIMEIRAS faturas julgam a venda. Cliente que pagou as três
    // e caiu na 4ª em diante é problema de COBRANÇA, não de qualidade da
    // venda — sai da régua do comercial mesmo suspenso/cancelado agora.
    const tresPrimeirasPagas = [1, 2, 3].every((n) => {
      const t = (c.titulos ?? []).find((x) => x.numero_parcela === n);
      return t?.status === "liquidado";
    });
    if (tresPrimeirasPagas) continue;

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
      faturas: [1, 2, 3].map((n) => {
        const t = (c.titulos ?? []).find((x) => x.numero_parcela === n);
        const situacao =
          t?.status === "liquidado"
            ? ("paga" as const)
            : t?.status === "aberto" && t.vencimento < hoje
              ? ("atrasada" as const)
              : ("a_vencer" as const);
        return { parcela: n, situacao, vencimento: t?.vencimento ?? null };
      }),
    });
    itensPorVendedora.set(c.vendedor_id, lista);
  }

  // a competência aplica débito? (decisão do mês, acima do cálculo)
  const { data: cfg } = await admin
    .from("comissao_competencia_config")
    .select("aplicar_debito, observacao")
    .eq("competencia", competencia)
    .maybeSingle();
  const aplicado = cfg?.aplicar_debito !== false;
  const observacao = (cfg?.observacao as string | null) ?? null;

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

  // mês sem débito: mantém a lista (para a vendedora acompanhar) e zera o peso
  if (!aplicado) {
    for (const id of porVendedora.keys()) porVendedora.set(id, 0);
  }

  return { competencia, coorte, janela, porVendedora, itensPorVendedora, manuais, aplicado, observacao };
}
