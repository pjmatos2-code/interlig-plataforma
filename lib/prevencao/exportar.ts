import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Dados complementares da planilha da Prevenção de cancelamento (13/10/2026):
 * por contrato, quantos pedidos de cancelamento o cliente já fez e quantos
 * boletos estão em atraso; e a lista nominal dos cancelamentos com motivo.
 */

export type IndicadoresContrato = {
  pedidosCancelamento12m: number;
  retencoes12m: number;
  ultimoPedido: string | null;
  boletosAtraso: number;
  valorAtraso: number;
  diasAtraso: number;
};

const vazio = (): IndicadoresContrato => ({
  pedidosCancelamento12m: 0,
  retencoes12m: 0,
  ultimoPedido: null,
  boletosAtraso: 0,
  valorAtraso: 0,
  diasAtraso: 0,
});

export async function indicadoresPorContrato(sgpIds: string[]): Promise<Map<string, IndicadoresContrato>> {
  const admin = criarClienteAdmin();
  const mapa = new Map<string, IndicadoresContrato>();
  const ids = [...new Set(sgpIds.filter(Boolean))];
  for (const id of ids) mapa.set(id, vazio());
  const desde = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [{ data: ocs }, { data: cts }] = await Promise.all([
      admin
        .from("ocorrencias_sgp")
        .select("sgp_contrato_id, tipo, criada_em")
        .in("sgp_contrato_id", lote)
        .in("tipo", ["Cancelamento Contrato", "Retenção de Cancelamento"])
        .gte("criada_em", desde)
        .limit(5000),
      admin.from("contratos").select("id, sgp_contrato_id").in("sgp_contrato_id", lote),
    ]);
    for (const o of ocs ?? []) {
      const m = mapa.get(o.sgp_contrato_id as string)!;
      if (o.tipo === "Cancelamento Contrato") {
        m.pedidosCancelamento12m++;
        if (!m.ultimoPedido || (o.criada_em as string) > m.ultimoPedido) m.ultimoPedido = o.criada_em as string;
      } else m.retencoes12m++;
    }
    const porUuid = new Map((cts ?? []).map((c) => [c.id as string, c.sgp_contrato_id as string]));
    const uuids = [...porUuid.keys()];
    if (uuids.length === 0) continue;
    const { data: tits } = await admin
      .from("titulos")
      .select("contrato_id, valor, vencimento")
      .in("contrato_id", uuids)
      .eq("status", "aberto")
      .is("data_pagamento", null)
      .lt("vencimento", hoje)
      .limit(10000);
    for (const t of tits ?? []) {
      const m = mapa.get(porUuid.get(t.contrato_id as string)!)!;
      m.boletosAtraso++;
      m.valorAtraso += Number(t.valor ?? 0);
      const dias = Math.round((Date.parse(hoje) - Date.parse(t.vencimento as string)) / 86_400_000);
      if (dias > m.diasAtraso) m.diasAtraso = dias;
    }
  }
  return mapa;
}

export type LinhaCancelamento = {
  data: string;
  sgpContratoId: string;
  sgpClienteId: string | null;
  cliente: string;
  telefone: string | null;
  pop: string | null;
  plano: string | null;
  valor: number;
  corporativo: boolean;
  /** Ativo = pediu para sair; Suspenso = débito; Inativo/Novo = não chegou a instalar */
  situacaoAnterior: string | null;
  motivo: string | null;
  usuario: string | null;
};

/** cancelamentos oficiais do SGP no período [de, ate] (aaaa-mm-dd), com o cadastro do contrato */
export async function cancelamentosPeriodo(de: string, ate: string): Promise<LinhaCancelamento[]> {
  const admin = criarClienteAdmin();
  const linhas: { sgp_contrato_id: string; data_cancelamento: string; motivo: string | null; status_anterior: string | null; usuario: string | null; cliente: string | null }[] = [];
  for (let ini = 0; ; ini += 1000) {
    const { data } = await admin
      .from("cancelamentos_sgp")
      .select("sgp_contrato_id, data_cancelamento, motivo, status_anterior, usuario, cliente")
      .gte("data_cancelamento", de)
      .lte("data_cancelamento", ate)
      .order("sgp_contrato_id")
      .order("data_cancelamento")
      .range(ini, ini + 999);
    linhas.push(...((data ?? []) as typeof linhas));
    if (!data || data.length < 1000) break;
  }
  const ids = [...new Set(linhas.map((l) => l.sgp_contrato_id))];
  const cad = new Map<string, { cliente: string; cpf: string | null; telefone: string | null; sgpCliente: string | null; pop: string | null; plano: string | null; valor: number }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin
      .from("contratos")
      .select("sgp_contrato_id, valor_mensalidade, clientes(nome, cpf, telefone, sgp_cliente_id), planos(nome), pops(nome)")
      .in("sgp_contrato_id", ids.slice(i, i + 300));
    for (const c of data ?? []) {
      const cl = c.clientes as unknown as { nome: string; cpf: string | null; telefone: string | null; sgp_cliente_id: string | null } | null;
      cad.set(c.sgp_contrato_id as string, {
        cliente: cl?.nome ?? "",
        cpf: cl?.cpf ?? null,
        telefone: cl?.telefone ?? null,
        sgpCliente: cl?.sgp_cliente_id ?? null,
        pop: (c.pops as unknown as { nome: string } | null)?.nome ?? null,
        plano: (c.planos as unknown as { nome: string } | null)?.nome ?? null,
        valor: Number(c.valor_mensalidade ?? 0),
      });
    }
  }
  return linhas
    .map((l) => {
      const c = cad.get(l.sgp_contrato_id);
      const cpf = (c?.cpf ?? "").replace(/\D/g, "");
      return {
        data: l.data_cancelamento,
        sgpContratoId: l.sgp_contrato_id,
        sgpClienteId: c?.sgpCliente ?? null,
        // o relatório traz "NOME - CPF": só o nome vai para a planilha
        cliente: c?.cliente || (l.cliente ?? "").replace(/\s+-\s+[\d./-]+$/, ""),
        telefone: c?.telefone ?? null,
        pop: c?.pop ?? null,
        plano: c?.plano ?? null,
        valor: c?.valor ?? 0,
        corporativo: cpf.length === 14 || /CORPORATE|\bPJ\b|DEDICADO|EMPRESARIAL|COMERCIAL/i.test(c?.plano ?? ""),
        situacaoAnterior: l.status_anterior,
        motivo: (l.motivo ?? "").replace(/^Cancelamento - /, "").trim() || null,
        usuario: l.usuario,
      };
    })
    .sort((a, b) => (a.data < b.data ? 1 : -1));
}
