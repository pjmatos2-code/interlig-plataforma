import { criarClienteServidor } from "@/lib/supabase/server";
import {
  calcularComissao,
  type DegrauComissao,
  type GatilhoComissao,
  type ResultadoComissao,
  type VendaComissao,
} from "@/lib/indicadores/comissao";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes, somarDias } from "@/lib/datas";

export type RegraComissao = {
  id: string;
  escopo: "global" | "pop" | "vendedora";
  referencia_id: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  degraus: DegrauComissao[];
  gatilhos: GatilhoComissao[];
  estorno_dias: number;
};

type ContratoC = ContratoIndicador & {
  id: string;
  vendedor_id: string | null;
  plano_id: string | null;
  termo_adesao_assinado: boolean | null;
  fidelidade_assinada: boolean | null;
  planos: { nome: string } | null;
};

const dias = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/** Todas as regras vigentes num mês (o chamador resolve a precedência). */
export async function regrasVigentes(mesIso: string): Promise<RegraComissao[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("regras_comissao")
    .select("id, escopo, referencia_id, vigencia_inicio, vigencia_fim, degraus, gatilhos, estorno_dias")
    .lte("vigencia_inicio", mesIso)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${mesIso}`);
  return (data ?? []) as unknown as RegraComissao[];
}

/** Precedência do PRD 6: vendedora > POP > global. */
export function regraPara(
  regras: RegraComissao[],
  vendedorId: string,
  popId: string | null
): RegraComissao | null {
  return (
    regras.find((r) => r.escopo === "vendedora" && r.referencia_id === vendedorId) ??
    regras.find((r) => r.escopo === "pop" && r.referencia_id === popId) ??
    regras.find((r) => r.escopo === "global") ??
    null
  );
}

export type ComissaoVendedora = {
  vendedorId: string;
  nome: string;
  metaMensal: number | null;
  regra: RegraComissao | null;
  resultado: ResultadoComissao | null;
  /** entrada pura para o simulador no navegador */
  entradaSimulador: {
    vendas: VendaComissao[];
    metaMensal: number;
    degraus: DegrauComissao[];
    gatilhos: GatilhoComissao[];
    debitoMeta: number;
  } | null;
};

/**
 * Comissão do mês por vendedora (estimativa em andamento). Estorno (PRD 6):
 * venda do mês cancelada em ≤ N dias (da ativação; sem ativação, da venda)
 * sai da base — casa com o churn precoce.
 */
export async function comissoesDoMes(mesIso?: string): Promise<ComissaoVendedora[]> {
  const supabase = criarClienteServidor();
  const hoje = hojeIso();
  const mes = mesIso ?? primeiroDiaDoMes(hoje);
  const fim = ultimoDiaDoMes(mes);
  const ateData = fim < hoje ? fim : hoje;

  const [{ data: vendedoras }, { data: contratosBrutos }, { data: metas }, regras, { data: ticketsConvertidos }, { data: monitorados }] =
    await Promise.all([
      supabase.from("vendedores").select("id, nome, pop_id").eq("ativo", true).order("nome"),
      supabase
        .from("contratos")
        .select(
          "id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id, plano_id, termo_adesao_assinado, fidelidade_assinada, planos(nome)"
        )
        .gte("data_venda", mes)
        .lte("data_venda", fim)
        .limit(5000),
      supabase
        .from("metas")
        .select("referencia_id, quantidade_vendas")
        .eq("escopo", "vendedora")
        .eq("mes_ano", mes),
      regrasVigentes(mes),
      supabase
        .from("tickets")
        .select("contrato_id, vendedor_id, plano_id")
        .eq("etapa", "fechado")
        .eq("desfecho", "convertido")
        .not("contrato_id", "is", null)
        .limit(3000),
      // estorno por QUANTIDADE (regra do gestor): vendas dos 90 dias
      // anteriores ao mês cujo cadastro está suspenso/cancelado — cada uma
      // soma +1 na meta do mês da vendedora
      supabase
        .from("contratos")
        .select("id, vendedor_id, status, data_venda, titulos!inner(numero_parcela, status, vencimento)")
        .gte("data_venda", somarDias(mes, -90))
        .lt("data_venda", mes)
        .in("status", ["suspenso", "cancelado"])
        .not("vendedor_id", "is", null)
        .eq("titulos.numero_parcela", 1)
        .limit(3000),
    ]);

  // critério D5: liberação exige ticket convertido reconciliado com o MESMO
  // plano e a MESMA vendedora do contrato
  const ticketPorContrato = new Map(
    (ticketsConvertidos ?? []).map((t) => [t.contrato_id as string, t])
  );

  // débito: suspenso/cancelado ≤90d E 1ª fatura vencida sem pagamento
  const hojeIsoStr = hoje;
  const debitoPorVendedora = new Map<string, number>();
  for (const m of (monitorados ?? []) as unknown as {
    vendedor_id: string;
    titulos: { numero_parcela: number; status: string; vencimento: string }[];
  }[]) {
    const primeira = (m.titulos ?? []).find((t) => t.numero_parcela === 1);
    const naoPagou =
      primeira !== undefined &&
      primeira.status !== "liquidado" &&
      primeira.vencimento < hojeIsoStr;
    if (!naoPagou) continue;
    debitoPorVendedora.set(m.vendedor_id, (debitoPorVendedora.get(m.vendedor_id) ?? 0) + 1);
  }

  const contratos = (contratosBrutos ?? []) as unknown as ContratoC[];
  const metaPor = new Map(
    (metas ?? []).map((m) => [m.referencia_id as string, m.quantidade_vendas as number])
  );

  return (vendedoras ?? []).map((v) => {
    const meta = metaPor.get(v.id) ?? null;
    const regra = regraPara(regras, v.id, v.pop_id);
    if (!meta || !regra) {
      return {
        vendedorId: v.id,
        nome: v.nome,
        metaMensal: meta,
        regra,
        resultado: null,
        entradaSimulador: null,
      };
    }

    const proprias = vendasDoPeriodo(
      contratos.filter((c) => c.vendedor_id === v.id),
      mes,
      ateData
    );
    const vendas: VendaComissao[] = proprias.map((contrato) => {
      const c = contrato as ContratoC;
      const referencia = c.data_ativacao ?? c.data_venda;
      const estornada =
        c.data_cancelamento !== null &&
        dias(referencia, c.data_cancelamento) <= regra.estorno_dias;

      // ---- liberação da comissão (critério D5) ----
      const ticket = ticketPorContrato.get(c.id);
      const crmOk =
        ticket !== undefined &&
        ticket.vendedor_id === c.vendedor_id &&
        (ticket.plano_id === null || c.plano_id === null || ticket.plano_id === c.plano_id);
      const assinaturasOk = c.termo_adesao_assinado === true && c.fidelidade_assinada === true;
      const liberada = crmOk && assinaturasOk && c.status === "ativo";

      return {
        valor_mensalidade: c.valor_mensalidade,
        plano: c.planos?.nome ?? null,
        estornada,
        liberada,
      };
    });

    const entrada = {
      vendas,
      metaMensal: meta,
      degraus: regra.degraus,
      gatilhos: regra.gatilhos,
      debitoMeta: debitoPorVendedora.get(v.id) ?? 0,
    };
    return {
      vendedorId: v.id,
      nome: v.nome,
      metaMensal: meta,
      regra,
      resultado: calcularComissao(entrada),
      entradaSimulador: entrada,
    };
  });
}

// ---------------------------------------------------------------------------
// Conferência com o SGP: status oficial (elegível/pendente/glosado importado do
// PDF "Detalhe Comissão") lado a lado com a nossa validação D5.
// ---------------------------------------------------------------------------
export type ConferenciaVendedora = {
  nome: string;
  total: number;
  sgpElegivel: number;
  sgpPendente: number;
  sgpGlosado: number;
  nossaLiberada: number;
  divergencias: number;
};

export type ConferenciaSgp = {
  competencia: string;
  temDados: boolean;
  importadoEm: string | null;
  totais: {
    total: number;
    sgpElegivel: number;
    sgpPendente: number;
    sgpGlosado: number;
    nossaLiberada: number;
    divergencias: number;
    receitaBaseElegivel: number;
  };
  porVendedora: ConferenciaVendedora[];
  motivosResumo: { motivo: string; quantidade: number }[];
};

export async function conferenciaSgp(mesIso: string): Promise<ConferenciaSgp> {
  const supabase = criarClienteServidor();
  const { data: itens } = await supabase
    .from("comissao_sgp_itens")
    .select(
      "sgp_contrato_id, contrato_id, vendedor_nome, vl_base, status_sgp, servico_sgp, importado_em"
    )
    .eq("competencia", mesIso);

  const vazio: ConferenciaSgp = {
    competencia: mesIso,
    temDados: false,
    importadoEm: null,
    totais: {
      total: 0,
      sgpElegivel: 0,
      sgpPendente: 0,
      sgpGlosado: 0,
      nossaLiberada: 0,
      divergencias: 0,
      receitaBaseElegivel: 0,
    },
    porVendedora: [],
    motivosResumo: [],
  };
  if (!itens || itens.length === 0) return vazio;

  // dados dos contratos casados, para rodar a nossa validação D5
  const contratoIds = itens.map((i) => i.contrato_id).filter(Boolean) as string[];
  const [{ data: contratos }, { data: ticketsConvertidos }] = await Promise.all([
    supabase
      .from("contratos")
      .select("id, status, termo_adesao_assinado, fidelidade_assinada, plano_id, vendedor_id")
      .in("id", contratoIds.length ? contratoIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("tickets")
      .select("contrato_id, vendedor_id, plano_id")
      .eq("etapa", "fechado")
      .eq("desfecho", "convertido")
      .not("contrato_id", "is", null)
      .in("contrato_id", contratoIds.length ? contratoIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const contratoPor = new Map((contratos ?? []).map((c) => [c.id, c]));
  const ticketPor = new Map((ticketsConvertidos ?? []).map((t) => [t.contrato_id as string, t]));

  const porVend = new Map<string, ConferenciaVendedora>();
  const motivos = new Map<string, number>();
  const t = { ...vazio.totais };

  for (const it of itens) {
    t.total++;
    const pagavelSgp = it.status_sgp === "elegivel";
    if (it.status_sgp === "elegivel") t.sgpElegivel++;
    else if (it.status_sgp === "pendente") t.sgpPendente++;
    else t.sgpGlosado++;
    if (pagavelSgp) t.receitaBaseElegivel += Number(it.vl_base ?? 0);

    // nossa validação D5
    const c = it.contrato_id ? contratoPor.get(it.contrato_id) : undefined;
    const ticket = it.contrato_id ? ticketPor.get(it.contrato_id) : undefined;
    const crmOk =
      ticket !== undefined &&
      c !== undefined &&
      ticket.vendedor_id === c.vendedor_id &&
      (ticket.plano_id === null || c.plano_id === null || ticket.plano_id === c.plano_id);
    const assinaturasOk =
      c?.termo_adesao_assinado === true && c?.fidelidade_assinada === true;
    const nossaLiberada = Boolean(c) && crmOk && assinaturasOk && c?.status === "ativo";
    if (nossaLiberada) t.nossaLiberada++;

    const diverge = pagavelSgp !== nossaLiberada;
    if (diverge) {
      t.divergencias++;
      // motivos: por que a nossa validação segura o que o SGP liberou (ou vice-versa)
      if (pagavelSgp && !nossaLiberada) {
        if (!c) motivos.set("contrato ainda não sincronizado", (motivos.get("contrato ainda não sincronizado") ?? 0) + 1);
        else {
          if (!crmOk) motivos.set("sem ticket convertido no CRM", (motivos.get("sem ticket convertido no CRM") ?? 0) + 1);
          if (!assinaturasOk) motivos.set("assinatura eletrônica pendente", (motivos.get("assinatura eletrônica pendente") ?? 0) + 1);
          if (c.status !== "ativo") motivos.set(`serviço ${c.status}`, (motivos.get(`serviço ${c.status}`) ?? 0) + 1);
        }
      } else {
        motivos.set(`nós liberamos, SGP marcou ${it.status_sgp}`, (motivos.get(`nós liberamos, SGP marcou ${it.status_sgp}`) ?? 0) + 1);
      }
    }

    const chave = it.vendedor_nome;
    const v =
      porVend.get(chave) ??
      { nome: chave, total: 0, sgpElegivel: 0, sgpPendente: 0, sgpGlosado: 0, nossaLiberada: 0, divergencias: 0 };
    v.total++;
    if (it.status_sgp === "elegivel") v.sgpElegivel++;
    else if (it.status_sgp === "pendente") v.sgpPendente++;
    else v.sgpGlosado++;
    if (nossaLiberada) v.nossaLiberada++;
    if (diverge) v.divergencias++;
    porVend.set(chave, v);
  }

  return {
    competencia: mesIso,
    temDados: true,
    importadoEm: (itens[0] as { importado_em: string }).importado_em ?? null,
    totais: t,
    porVendedora: [...porVend.values()].sort((a, b) => b.total - a.total),
    motivosResumo: [...motivos.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
  };
}
