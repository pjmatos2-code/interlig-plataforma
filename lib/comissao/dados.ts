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
  assinatura_dispensada: boolean | null;
  planos: { nome: string; exige_assinatura: boolean | null } | null;
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

  const [{ data: vendedoras }, { data: contratosBrutos }, { data: metas }, regras] =
    await Promise.all([
      supabase.from("vendedores").select("id, nome, pop_id").eq("ativo", true).order("nome"),
      supabase
        .from("contratos")
        .select(
          "id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id, plano_id, termo_adesao_assinado, fidelidade_assinada, assinatura_dispensada, planos(nome, exige_assinatura)"
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
    ]);

  // critério D5 (revisado 28/08) + aprovação manual do gestor (29/08):
  // regra única em lib/comissao/liberacao.ts
  const { avaliarLiberacao, liberacoesManuais } = await import("@/lib/comissao/liberacao");
  const aprovacoes = await liberacoesManuais(mes);
  // débito por COORTE M-3 (adendo 28/08): a competência avalia só as vendas
  // de três meses atrás; status reavaliado até o fechamento.
  const { debitoPorCoorte } = await import("@/lib/comissao/debito");
  const coorte = await debitoPorCoorte(mes);
  const debitoPorVendedora = coorte.porVendedora;

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

      // liberação D5/D8, com a aprovação manual do gestor sobrepondo as
      // pendências (venda do fim do mês que só instala no mês seguinte)
      const { liberada } = avaliarLiberacao(c, aprovacoes.get(c.id) ?? null);

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

export type ConferenciaItem = {
  sgpContratoId: string;
  sgpClienteId: string | null;
  cliente: string | null;
  vendedora: string;
  plano: string | null;
  dataVenda: string | null;
  vlBase: number;
  statusSgp: "elegivel" | "pendente" | "glosado";
  nossaLiberada: boolean;
  diverge: boolean;
  /** o que está segurando a liberação (acionável antes do fechamento) */
  pendencias: string[];
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
  itens: ConferenciaItem[];
};

export async function conferenciaSgp(mesIso: string): Promise<ConferenciaSgp> {
  const supabase = criarClienteServidor();
  const { data: itens } = await supabase
    .from("comissao_sgp_itens")
    .select(
      "sgp_contrato_id, contrato_id, vendedor_nome, plano, data_venda, vl_base, status_sgp, servico_sgp, importado_em"
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
    itens: [],
  };
  if (!itens || itens.length === 0) return vazio;

  // dados dos contratos casados, para rodar a nossa validação
  const contratoIds = itens.map((i) => i.contrato_id).filter(Boolean) as string[];
  const { data: contratos } = await supabase
    .from("contratos")
    .select(
      "id, status, termo_adesao_assinado, fidelidade_assinada, assinatura_dispensada, plano_id, vendedor_id, data_venda, planos(nome, exige_assinatura), clientes(nome, sgp_cliente_id)"
    )
    .in("id", contratoIds.length ? contratoIds : ["00000000-0000-0000-0000-000000000000"]);

  const contratoPor = new Map((contratos ?? []).map((c) => [c.id, c]));
  const porVend = new Map<string, ConferenciaVendedora>();
  const motivos = new Map<string, number>();
  const detalhes: ConferenciaItem[] = [];
  const t = { ...vazio.totais };

  for (const it of itens) {
    t.total++;
    const pagavelSgp = it.status_sgp === "elegivel";
    if (it.status_sgp === "elegivel") t.sgpElegivel++;
    else if (it.status_sgp === "pendente") t.sgpPendente++;
    else t.sgpGlosado++;
    if (pagavelSgp) t.receitaBaseElegivel += Number(it.vl_base ?? 0);

    // nossa validação (adendo 29/08): a vendedora é a do SGP — ticket do CRM
    // não julga mais a venda. Assinatura e ativação continuam valendo.
    const c = it.contrato_id ? contratoPor.get(it.contrato_id) : undefined;
    const assinaturasOk =
      c?.termo_adesao_assinado === true && c?.fidelidade_assinada === true;
    const nossaLiberada = Boolean(c) && assinaturasOk && c?.status === "ativo";
    if (nossaLiberada) t.nossaLiberada++;

    const diverge = pagavelSgp !== nossaLiberada;
    if (diverge) {
      t.divergencias++;
      // motivos: por que a nossa validação segura o que o SGP liberou (ou vice-versa)
      if (pagavelSgp && !nossaLiberada) {
        if (!c) motivos.set("contrato ainda não sincronizado", (motivos.get("contrato ainda não sincronizado") ?? 0) + 1);
        else {
          if (!assinaturasOk) motivos.set("assinatura eletrônica pendente", (motivos.get("assinatura eletrônica pendente") ?? 0) + 1);
          if (c.status !== "ativo") motivos.set(`serviço ${c.status}`, (motivos.get(`serviço ${c.status}`) ?? 0) + 1);
        }
      } else {
        motivos.set(`nós liberamos, SGP marcou ${it.status_sgp}`, (motivos.get(`nós liberamos, SGP marcou ${it.status_sgp}`) ?? 0) + 1);
      }
    }

    // ---- item detalhado (drill-down clicável no painel) ----
    const rel = c as unknown as
      | { data_venda?: string; planos?: { nome: string } | null; clientes?: { nome: string; sgp_cliente_id: string | null } | null }
      | undefined;
    const pendencias: string[] = [];
    if (!c) pendencias.push("contrato ainda não sincronizado na plataforma");
    else {
      if (c.termo_adesao_assinado !== true) pendencias.push("Termo de Adesão sem assinatura");
      if (c.fidelidade_assinada !== true) pendencias.push("Contrato de Fidelidade sem assinatura");
      if (c.status !== "ativo") pendencias.push(`serviço ${c.status.replace(/_/g, " ")}`);
    }
    if (pendencias.length === 0 && it.status_sgp === "pendente")
      pendencias.push("nada pendente do nosso lado — conferir o motivo no SGP");
    detalhes.push({
      sgpContratoId: String(it.sgp_contrato_id),
      sgpClienteId: rel?.clientes?.sgp_cliente_id ?? null,
      cliente: rel?.clientes?.nome ?? null,
      vendedora: it.vendedor_nome,
      plano: rel?.planos?.nome ?? ((it as { plano?: string | null }).plano ?? null),
      dataVenda: rel?.data_venda ?? ((it as { data_venda?: string | null }).data_venda ?? null),
      vlBase: Number(it.vl_base ?? 0),
      statusSgp: it.status_sgp as ConferenciaItem["statusSgp"],
      nossaLiberada,
      diverge,
      pendencias,
    });

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
    itens: detalhes.sort((a, b) => (a.dataVenda ?? "") < (b.dataVenda ?? "") ? -1 : 1),
  };
}
