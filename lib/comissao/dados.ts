import { criarClienteServidor } from "@/lib/supabase/server";
import {
  calcularComissao,
  type DegrauComissao,
  type GatilhoComissao,
  type ResultadoComissao,
  type VendaComissao,
} from "@/lib/indicadores/comissao";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";

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

  const [{ data: vendedoras }, { data: contratosBrutos }, { data: metas }, regras, { data: ticketsConvertidos }] =
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
    ]);

  // critério D5: liberação exige ticket convertido reconciliado com o MESMO
  // plano e a MESMA vendedora do contrato
  const ticketPorContrato = new Map(
    (ticketsConvertidos ?? []).map((t) => [t.contrato_id as string, t])
  );

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
