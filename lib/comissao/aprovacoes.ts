import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { avaliarLiberacao, liberacoesManuais, type Aprovacao } from "@/lib/comissao/liberacao";

/**
 * Fila de aprovação do fechamento (Admin → Metas e comissão → Aprovações).
 * Lista as vendas da competência que a regra automática NÃO liberou, com o
 * motivo de cada uma, para o gestor decidir uma a uma antes de fechar o mês.
 */

export type ItemAprovacao = {
  contratoId: string;
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  cliente: string;
  plano: string | null;
  dataVenda: string;
  valor: number;
  vendedorId: string | null;
  vendedora: string;
  pendencias: string[];
  /** assinatura pendente: fica na fila, mas sem botão — ninguém libera */
  bloqueioAbsoluto: boolean;
  aprovacao: Aprovacao | null;
};

export type FilaAprovacao = {
  competencia: string;
  pendentes: ItemAprovacao[];
  aprovados: ItemAprovacao[];
  vendedoras: { id: string; nome: string }[];
  totais: { vendas: number; liberadasAuto: number; aprovadasMao: number; pendentes: number };
};

type ContratoA = ContratoIndicador & {
  id: string;
  sgp_contrato_id: string | null;
  vendedor_id: string | null;
  plano_id: string | null;
  termo_adesao_assinado: boolean | null;
  fidelidade_assinada: boolean | null;
  planos: { nome: string } | null;
  clientes: { nome: string; sgp_cliente_id: string | null } | null;
};

export async function filaAprovacao(mesIso?: string): Promise<FilaAprovacao> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const mes = mesIso ?? primeiroDiaDoMes(hoje);
  const fim = ultimoDiaDoMes(mes);
  const ateData = fim < hoje ? fim : hoje;

  const [{ data: contratosBrutos }, { data: vendedoras }, aprovacoes] =
    await Promise.all([
      admin
        .from("contratos")
        .select(
          "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id, plano_id, termo_adesao_assinado, fidelidade_assinada, planos(nome), clientes(nome, sgp_cliente_id)"
        )
        .gte("data_venda", mes)
        .lte("data_venda", fim)
        .limit(5000),
      admin.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
      liberacoesManuais(mes),
    ]);

  const nomeVend = (id: string | null) =>
    (vendedoras ?? []).find((v) => v.id === id)?.nome ?? "não atribuído";

  const contratos = (contratosBrutos ?? []) as unknown as ContratoA[];
  const doMes = vendasDoPeriodo(contratos, mes, ateData) as ContratoA[];

  const pendentes: ItemAprovacao[] = [];
  const aprovados: ItemAprovacao[] = [];
  let liberadasAuto = 0;

  for (const c of doMes) {
    const aprovacao = aprovacoes.get(c.id) ?? null;
    const v = avaliarLiberacao(c, aprovacao);
    if (v.pendencias.length === 0) {
      liberadasAuto += 1;
      continue;
    }
    const item: ItemAprovacao = {
      contratoId: c.id,
      sgpContratoId: c.sgp_contrato_id,
      sgpClienteId: c.clientes?.sgp_cliente_id ?? null,
      cliente: c.clientes?.nome ?? "—",
      plano: c.planos?.nome ?? null,
      dataVenda: c.data_venda,
      valor: c.valor_mensalidade,
      vendedorId: c.vendedor_id,
      vendedora: c.vendedor_id ? nomeVend(c.vendedor_id) : "não atribuída",
      pendencias: v.pendencias,
      bloqueioAbsoluto: v.bloqueioAbsoluto,
      aprovacao,
    };
    if (aprovacao && !v.bloqueioAbsoluto) aprovados.push(item);
    else pendentes.push(item);
  }

  const ordenar = (a: ItemAprovacao, b: ItemAprovacao) => (a.dataVenda < b.dataVenda ? -1 : 1);
  return {
    competencia: mes,
    pendentes: pendentes.sort(ordenar),
    aprovados: aprovados.sort(ordenar),
    vendedoras: (vendedoras ?? []) as { id: string; nome: string }[],
    totais: {
      vendas: doMes.length,
      liberadasAuto,
      aprovadasMao: aprovados.length,
      pendentes: pendentes.length,
    },
  };
}
