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
  /** já ativado alguma vez: "cliente desistiu da instalação" não cabe */
  ativado: boolean;
  /** encerrada sem comissão: desistência (contrato) ou "não comissiona" (fila) */
  desfecho: Desfecho | null;
};

export type Desfecho = {
  tipo: "desistencia" | "nao_comissiona";
  motivo: string;
  definidoPor: string | null;
  definidoEm: string | null;
};

export type FilaAprovacao = {
  competencia: string;
  pendentes: ItemAprovacao[];
  aprovados: ItemAprovacao[];
  /** saíram da fila com desfecho (27/11/2026) — Desfazer devolve */
  encerradas: ItemAprovacao[];
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
  assinatura_dispensada: boolean | null;
  planos: { nome: string; exige_assinatura: boolean | null } | null;
  clientes: { nome: string; sgp_cliente_id: string | null } | null;
};

export async function filaAprovacao(mesIso?: string): Promise<FilaAprovacao> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const mes = mesIso ?? primeiroDiaDoMes(hoje);
  const fim = ultimoDiaDoMes(mes);
  const ateData = fim < hoje ? fim : hoje;

  const [{ data: contratosBrutos }, { data: vendedoras }, aprovacoes, { data: desfechosBrutos }, { data: usuarios }] =
    await Promise.all([
      admin
        .from("contratos")
        .select(
          "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, desistencia_motivo, desistencia_por, valor_mensalidade, vendedor_id, plano_id, termo_adesao_assinado, fidelidade_assinada, assinatura_dispensada, planos(nome, exige_assinatura), clientes(nome, sgp_cliente_id)"
        )
        .gte("data_venda", mes)
        .lte("data_venda", fim)
        .limit(5000),
      admin.from("vendedores").select("id, nome, ativo").order("nome"),
      liberacoesManuais(mes),
      admin
        .from("comissao_desfechos")
        .select("contrato_id, motivo, definido_por, definido_em")
        .eq("competencia", mes)
        .is("desfeito_em", null)
        .limit(5000),
      admin.from("usuarios").select("id, nome"),
    ]);
  const nomeUsuario = (id: string | null) => (usuarios ?? []).find((u) => u.id === id)?.nome ?? null;
  const naoComissiona = new Map(
    (desfechosBrutos ?? []).map((d) => [
      d.contrato_id as string,
      {
        tipo: "nao_comissiona" as const,
        motivo: d.motivo as string,
        definidoPor: nomeUsuario(d.definido_por as string | null),
        definidoEm: d.definido_em as string,
      },
    ])
  );

  const nomeVend = (id: string | null) =>
    (vendedoras ?? []).find((v) => v.id === id)?.nome ?? "não atribuído";

  const contratos = (contratosBrutos ?? []) as unknown as ContratoA[];
  const doMes = vendasDoPeriodo(contratos, mes, ateData) as ContratoA[];

  const pendentes: ItemAprovacao[] = [];
  const aprovados: ItemAprovacao[] = [];
  const encerradas: ItemAprovacao[] = [];
  let liberadasAuto = 0;

  for (const c of doMes) {
    const aprovacao = aprovacoes.get(c.id) ?? null;
    const v = avaliarLiberacao(c, aprovacao);
    if (v.pendencias.length === 0) {
      liberadasAuto += 1;
      continue;
    }
    const cx = c as { desistencia_em?: string | null; desistencia_motivo?: string | null; desistencia_por?: string | null };
    const desfecho: Desfecho | null = cx.desistencia_em
      ? {
          tipo: "desistencia",
          motivo: cx.desistencia_motivo ?? "cliente desistiu",
          definidoPor: nomeUsuario(cx.desistencia_por ?? null),
          definidoEm: cx.desistencia_em,
        }
      : (naoComissiona.get(c.id) ?? null);
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
      ativado: c.data_ativacao !== null,
      desfecho,
    };
    if (desfecho) encerradas.push(item);
    else if (aprovacao && !v.bloqueioAbsoluto) aprovados.push(item);
    else pendentes.push(item);
  }

  const ordenar = (a: ItemAprovacao, b: ItemAprovacao) => (a.dataVenda < b.dataVenda ? -1 : 1);
  return {
    competencia: mes,
    pendentes: pendentes.sort(ordenar),
    aprovados: aprovados.sort(ordenar),
    encerradas: encerradas.sort(ordenar),
    vendedoras: (vendedoras ?? []).filter((v) => v.ativo).map((v) => ({ id: v.id as string, nome: v.nome as string })),
    totais: {
      vendas: doMes.length,
      liberadasAuto,
      aprovadasMao: aprovados.length,
      pendentes: pendentes.length,
    },
  };
}
