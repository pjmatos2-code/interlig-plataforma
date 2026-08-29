import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { primeiroDiaDoMes, ultimoDiaDoMes, hojeIso } from "@/lib/datas";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { avaliarLiberacao, liberacoesManuais } from "@/lib/comissao/liberacao";
import { debitoPorCoorte } from "@/lib/comissao/debito";
import { comissoesDoMes } from "@/lib/comissao/dados";
import type { ResultadoComissao, DegrauComissao, GatilhoComissao } from "@/lib/indicadores/comissao";

/**
 * Snapshot do fechamento — o documento que o financeiro paga e que sustenta
 * uma auditoria daqui a anos.
 *
 * Regra de ouro: ele tem de se explicar SOZINHO. Guardar só o id da regra não
 * serve — se as faixas forem editadas depois, o fechamento antigo perde o
 * sentido. Por isso congelamos a regra inteira, a lista nominal de contratos e
 * cada exceção aplicada (liberação manual, dispensa de assinatura, débito),
 * com motivo e autor.
 */

export type ContratoSnapshot = {
  sgpContratoId: string | null;
  cliente: string;
  plano: string | null;
  valor: number;
  dataVenda: string;
  status: string;
  /** liberada pela regra automática ou por decisão da gestão */
  liberadaPor: "regra" | "gestao";
  aprovacaoMotivo?: string;
  aprovadoPor?: string | null;
};

export type SnapshotComissao = {
  competencia: string;
  vendedora: string;
  pop: string | null;
  /** regra congelada — as faixas COMO ESTAVAM no fechamento */
  regra: { degraus: DegrauComissao[]; gatilhos: GatilhoComissao[]; estornoDias: number };
  meta: number;
  resultado: ResultadoComissao;
  debito: { aplicado: boolean; quantidade: number; coorte: string; observacao: string | null };
  contratos: ContratoSnapshot[];
  assinaturasDispensadas: { sgpContratoId: string | null; cliente: string; motivo: string }[];
  fechadoEm: string;
  fechadoPor: string | null;
};

type ContratoS = ContratoIndicador & {
  id: string;
  sgp_contrato_id: string | null;
  vendedor_id: string | null;
  termo_adesao_assinado: boolean | null;
  fidelidade_assinada: boolean | null;
  assinatura_dispensada: boolean | null;
  assinatura_dispensada_motivo: string | null;
  planos: { nome: string; exige_assinatura: boolean | null } | null;
  clientes: { nome: string } | null;
};

/**
 * Monta o snapshot de todas as vendedoras da competência. Roda uma vez, no
 * fechamento — a partir daí ninguém recalcula nada.
 */
export async function montarSnapshots(
  competenciaIso: string,
  fechadoPorNome: string | null
): Promise<Map<string, SnapshotComissao>> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(competenciaIso);
  const fim = ultimoDiaDoMes(mes);
  const hoje = hojeIso();
  const ateData = fim < hoje ? fim : hoje;

  const [comissoes, aprovacoes, debito, { data: contratosBrutos }, { data: pops }] =
    await Promise.all([
      comissoesDoMes(mes),
      liberacoesManuais(mes),
      debitoPorCoorte(mes),
      admin
        .from("contratos")
        .select(
          "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id, plano_id, termo_adesao_assinado, fidelidade_assinada, assinatura_dispensada, assinatura_dispensada_motivo, planos(nome, exige_assinatura), clientes(nome)"
        )
        .gte("data_venda", mes)
        .lte("data_venda", fim)
        .limit(5000),
      admin.from("vendedores").select("id, nome, pops(nome)"),
    ]);

  const popPor = new Map(
    (pops ?? []).map((v) => [
      v.id as string,
      (v.pops as unknown as { nome: string } | null)?.nome ?? null,
    ])
  );
  const contratos = (contratosBrutos ?? []) as unknown as ContratoS[];
  const fechadoEm = new Date().toISOString();
  const saida = new Map<string, SnapshotComissao>();

  for (const c of comissoes) {
    if (!c.resultado || !c.regra || !c.metaMensal) continue;

    const proprias = vendasDoPeriodo(
      contratos.filter((x) => x.vendedor_id === c.vendedorId),
      mes,
      ateData
    ) as ContratoS[];

    const linhas: ContratoSnapshot[] = [];
    const dispensadas: SnapshotComissao["assinaturasDispensadas"] = [];

    for (const ct of proprias) {
      const aprovacao = aprovacoes.get(ct.id) ?? null;
      const v = avaliarLiberacao(ct, aprovacao);
      if (!v.liberada) continue; // só entram no demonstrativo as que pagam

      linhas.push({
        sgpContratoId: ct.sgp_contrato_id,
        cliente: ct.clientes?.nome ?? "—",
        plano: ct.planos?.nome ?? null,
        valor: ct.valor_mensalidade,
        dataVenda: ct.data_venda,
        status: ct.status,
        liberadaPor: v.aprovacaoManual ? "gestao" : "regra",
        ...(v.aprovacaoManual
          ? {
              aprovacaoMotivo: v.aprovacaoManual.motivo,
              aprovadoPor: v.aprovacaoManual.aprovadoPor,
            }
          : {}),
      });

      if (ct.assinatura_dispensada) {
        dispensadas.push({
          sgpContratoId: ct.sgp_contrato_id,
          cliente: ct.clientes?.nome ?? "—",
          motivo: ct.assinatura_dispensada_motivo ?? "—",
        });
      }
    }

    saida.set(c.vendedorId, {
      competencia: mes,
      vendedora: c.nome,
      pop: popPor.get(c.vendedorId) ?? null,
      regra: {
        degraus: c.regra.degraus,
        gatilhos: c.regra.gatilhos,
        estornoDias: c.regra.estorno_dias,
      },
      meta: c.metaMensal,
      resultado: c.resultado,
      debito: {
        aplicado: debito.aplicado,
        quantidade: debito.porVendedora.get(c.vendedorId) ?? 0,
        coorte: debito.coorte,
        observacao: debito.observacao,
      },
      contratos: linhas.sort((a, b) => (a.dataVenda < b.dataVenda ? -1 : 1)),
      assinaturasDispensadas: dispensadas,
      fechadoEm,
      fechadoPor: fechadoPorNome,
    });
  }

  return saida;
}

/**
 * Código de verificação impresso no demonstrativo: deriva do conteúdo, então
 * muda se o fechamento for refeito. Serve para conferir, no futuro, que o PDF
 * em mãos corresponde à apuração registrada.
 */
export function codigoVerificacao(
  vendedorId: string,
  competencia: string,
  versao: number,
  total: number
): string {
  const semente = `${vendedorId}|${competencia}|${versao}|${total.toFixed(2)}`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < semente.length; i++) {
    h1 ^= semente.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  let h2 = 0x9e3779b9;
  for (let i = semente.length - 1; i >= 0; i--) {
    h2 ^= semente.charCodeAt(i);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const bruto = (h1.toString(36) + h2.toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cod = (bruto + "0000000000").slice(0, 10);
  return `${cod.slice(0, 5)}-${cod.slice(5, 10)}`;
}
