import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  calcularComissao,
  type ResultadoComissao,
  type VendaComissao,
} from "@/lib/indicadores/comissao";
import { regraPara, type RegraComissao } from "@/lib/comissao/dados";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes, somarDias } from "@/lib/datas";

/**
 * "Minha comissão" — visão da PRÓPRIA vendedora (Minhas vendas), com os mesmos
 * números do módulo do Administrador: resultado por faixa (D5/D8), contratos
 * PENDENTES de liberação com o que falta em cada um, e os inadimplentes dos 90
 * dias que somam débito na meta (precisa repor). Usa o client admin escopado
 * pelo vendedor_id porque o cálculo depende dos títulos (que a RLS não expõe
 * à vendedora) — só dados dos clientes DELA saem daqui.
 */

export type PendenteLiberacao = {
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  cliente: string;
  plano: string | null;
  dataVenda: string;
  valor: number;
  pendencias: string[];
};

export type InadimplenteDebito = {
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  cliente: string;
  status: string;
  vencimento1a: string | null;
};

export type MinhaComissao = {
  temRegra: boolean;
  /** mês da coorte avaliada (M-3) — as vendas que geram o débito deste mês */
  mesCoorte: string;
  /** número veio de ajuste manual validado pela gestão */
  debitoManual: boolean;
  metaMensal: number | null;
  faixaAtual: string | null;
  resultado: ResultadoComissao | null;
  pendentes: PendenteLiberacao[];
  liberadas: number;
  inadimplentes: InadimplenteDebito[];
  entradaSimulador: {
    vendas: VendaComissao[];
    metaMensal: number;
    degraus: RegraComissao["degraus"];
    gatilhos: RegraComissao["gatilhos"];
    debitoMeta: number;
  } | null;
};

type ContratoM = ContratoIndicador & {
  id: string;
  sgp_contrato_id: string | null;
  plano_id: string | null;
  termo_adesao_assinado: boolean | null;
  fidelidade_assinada: boolean | null;
  planos: { nome: string } | null;
  clientes: { nome: string; sgp_cliente_id: string | null } | null;
};

const dias = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export async function minhaComissao(vendedorId: string): Promise<MinhaComissao> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const mes = primeiroDiaDoMes(hoje);
  const fim = ultimoDiaDoMes(mes);
  const ateData = fim < hoje ? fim : hoje;

  const { debitoPorCoorte, mesDaCoorte } = await import("@/lib/comissao/debito");
  const vazio: MinhaComissao = {
    temRegra: false, mesCoorte: mesDaCoorte(mes), debitoManual: false, metaMensal: null,
    faixaAtual: null, resultado: null, pendentes: [], liberadas: 0, inadimplentes: [],
    entradaSimulador: null,
  };

  const [{ data: vend }, { data: contratosBrutos }, { data: metaRow }, regras, { data: ticketsConvertidos }] =
    await Promise.all([
      admin.from("vendedores").select("id, pop_id").eq("id", vendedorId).maybeSingle(),
      admin
        .from("contratos")
        .select(
          "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, plano_id, termo_adesao_assinado, fidelidade_assinada, planos(nome), clientes(nome, sgp_cliente_id)"
        )
        .eq("vendedor_id", vendedorId)
        .gte("data_venda", mes)
        .lte("data_venda", fim)
        .limit(2000),
      admin
        .from("metas")
        .select("quantidade_vendas")
        .eq("escopo", "vendedora")
        .eq("referencia_id", vendedorId)
        .eq("mes_ano", mes)
        .maybeSingle(),
      admin
        .from("regras_comissao")
        .select("id, escopo, referencia_id, vigencia_inicio, vigencia_fim, degraus, gatilhos, estorno_dias")
        .lte("vigencia_inicio", mes)
        .or(`vigencia_fim.is.null,vigencia_fim.gte.${mes}`)
        .then((r) => (r.data ?? []) as unknown as RegraComissao[]),
      admin
        .from("tickets")
        .select("contrato_id, vendedor_id, plano_id")
        .eq("etapa", "fechado")
        .eq("desfecho", "convertido")
        .not("contrato_id", "is", null)
        .limit(3000),
    ]);

  if (!vend) return vazio;
  const meta = (metaRow?.quantidade_vendas as number | undefined) ?? null;
  const regra = regraPara(regras, vendedorId, vend.pop_id);
  if (!meta || !regra) return { ...vazio, metaMensal: meta };

  const contratos = (contratosBrutos ?? []) as unknown as ContratoM[];
  const ticketPorContrato = new Map(
    (ticketsConvertidos ?? [])
      .filter((t) => t.vendedor_id === vendedorId || true)
      .map((t) => [t.contrato_id as string, t])
  );

  // ---- débito por COORTE M-3 (adendo 28/08) ----
  const coorteDebito = await debitoPorCoorte(mes);
  const inadimplentes: InadimplenteDebito[] = (
    coorteDebito.itensPorVendedora.get(vendedorId) ?? []
  ).map((i) => ({
    sgpContratoId: i.sgpContratoId,
    sgpClienteId: i.sgpClienteId,
    cliente: i.cliente,
    status: i.status,
    vencimento1a: i.vencimento1a,
  }));
  const debitoMeta = coorteDebito.porVendedora.get(vendedorId) ?? 0;
  const debitoManual = coorteDebito.manuais.has(vendedorId);

  // ---- vendas do mês + liberação D5/D8 + pendências detalhadas ----
  const proprias = vendasDoPeriodo(contratos, mes, ateData) as ContratoM[];
  const pendentes: PendenteLiberacao[] = [];
  let liberadas = 0;
  const vendas: VendaComissao[] = proprias.map((c) => {
    const referencia = c.data_ativacao ?? c.data_venda;
    const estornada =
      c.data_cancelamento !== null && dias(referencia, c.data_cancelamento) <= regra.estorno_dias;
    const ticket = ticketPorContrato.get(c.id);
    const crmConsistente =
      ticket === undefined ||
      (ticket.vendedor_id === vendedorId &&
        (ticket.plano_id === null || c.plano_id === null || ticket.plano_id === c.plano_id));
    const assinaturasOk = c.termo_adesao_assinado === true && c.fidelidade_assinada === true;
    const liberada = crmConsistente && assinaturasOk && c.status === "ativo";

    if (!estornada && !liberada) {
      const p: string[] = [];
      if (c.termo_adesao_assinado !== true) p.push("Termo de Adesão sem assinatura");
      if (c.fidelidade_assinada !== true) p.push("Contrato de Fidelidade sem assinatura");
      if (c.status !== "ativo") p.push(`serviço ${c.status.replace(/_/g, " ")}`);
      if (!crmConsistente) p.push("ticket do CRM inconsistente");
      pendentes.push({
        sgpContratoId: c.sgp_contrato_id,
        sgpClienteId: c.clientes?.sgp_cliente_id ?? null,
        cliente: c.clientes?.nome ?? "—",
        plano: c.planos?.nome ?? null,
        dataVenda: c.data_venda,
        valor: c.valor_mensalidade,
        pendencias: p,
      });
    }
    if (!estornada && liberada) liberadas += 1;
    return { valor_mensalidade: c.valor_mensalidade, plano: c.planos?.nome ?? null, estornada, liberada };
  });

  const entrada = {
    vendas,
    metaMensal: meta,
    degraus: regra.degraus,
    gatilhos: regra.gatilhos,
    debitoMeta,
  };
  const resultado = calcularComissao(entrada);
  const faixaAtual = resultado.degrau
    ? `${resultado.degrau.valor}%${resultado.degrau.tipo === "valor_por_venda" ? " (R$/venda)" : " do VTV"}`
    : "abaixo da faixa mínima";

  return {
    temRegra: true,
    mesCoorte: coorteDebito.coorte,
    debitoManual,
    metaMensal: meta,
    faixaAtual,
    resultado,
    pendentes: pendentes.sort((a, b) => (a.dataVenda < b.dataVenda ? -1 : 1)),
    liberadas,
    inadimplentes,
    entradaSimulador: entrada,
  };
}
