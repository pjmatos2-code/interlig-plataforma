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
  /** de onde veio a comissão — muda os rótulos do demonstrativo */
  tipo?: "venda" | "refidelizacao" | "retencao" | "gerencia";
  vendedora: string;
  pop: string | null;
  /** regra congelada — as faixas COMO ESTAVAM no fechamento */
  regra: { degraus: DegrauComissao[]; gatilhos: GatilhoComissao[]; estornoDias: number };
  meta: number;
  resultado: ResultadoComissao;
  debito: { aplicado: boolean; quantidade: number; coorte: string; janela?: { de: string; ate: string } | null; observacao: string | null };
  contratos: ContratoSnapshot[];
  assinaturasDispensadas: { sgpContratoId: string | null; cliente: string; motivo: string }[];
  fechadoEm: string;
  fechadoPor: string | null;
  /** memória do override (só tipo "gerencia") */
  gerencia?: {
    pilares: { rotulo: string; volume: number; meta: number | null; atingimentoPct: number | null; nivel: number }[];
    nivelFinal: number;
    nomeNivel: string;
    overridePct: number;
    base: { vtvVendas: number; vtvRefi: number; vtvRetido: number; vtvLigchip: number; total: number };
    pilarLimitante: string | null;
    flags: { earlyChurn: boolean; clawback: boolean };
  };
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
        janela: debito.janela,
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

/**
 * Snapshots do Setor de Atendimento (refidelização). Mesma estrutura da
 * comissão de venda, para o fechamento, o financeiro e o demonstrativo em PDF
 * tratarem os dois casos pelo mesmo caminho — o que muda são os rótulos e a
 * régua, que vive em lib/refidelizacao.
 */
export async function montarSnapshotsRefidelizacao(
  competenciaIso: string,
  fechadoPorNome: string | null
): Promise<Map<string, SnapshotComissao>> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(competenciaIso);
  const { refidelizacaoDoMes, META_REFIDELIZACAO, FAIXAS_REFIDELIZACAO } = await import(
    "@/lib/refidelizacao/dados"
  );
  const dados = await refidelizacaoDoMes(mes);
  const fechadoEm = new Date().toISOString();
  const saida = new Map<string, SnapshotComissao>();

  const { data: agentes } = await admin
    .from("vendedores")
    .select("id, nome, sgp_login, pops(nome)")
    .eq("setor", "atendimento");

  for (const a of dados.agentes) {
    const cadastro = (agentes ?? []).find(
      (v) => String(v.sgp_login ?? "").toLowerCase() === a.agente
    );
    if (!cadastro) continue; // sem cadastro não há a quem pagar

    const linhas: ContratoSnapshot[] = a.linhas
      .filter((l) => l.conta)
      .map((l) => ({
        sgpContratoId: l.sgpContratoId,
        cliente: l.cliente,
        plano: l.plano,
        valor: l.valorMensal,
        dataVenda: l.data,
        status: "refidelizado",
        liberadaPor: l.decisao === "aprovado" ? "gestao" : "regra",
        ...(l.decisao === "aprovado"
          ? { aprovacaoMotivo: l.decisaoMotivo ?? "liberado pela gestão", aprovadoPor: null }
          : {}),
      }));

    saida.set(cadastro.id as string, {
      competencia: mes,
      tipo: "refidelizacao",
      vendedora: a.nome ?? (cadastro.nome as string),
      pop: (cadastro.pops as unknown as { nome: string } | null)?.nome ?? null,
      regra: {
        degraus: FAIXAS_REFIDELIZACAO.map((f) => ({
          atingimento_min: f.min,
          atingimento_max: null,
          tipo: "percentual_receita" as const,
          valor: f.pct,
        })),
        gatilhos: [],
        estornoDias: 0,
      },
      meta: META_REFIDELIZACAO,
      resultado: {
        atingimentoPct: a.atingimentoPct / 100,
        degrau: {
          atingimento_min: 0,
          atingimento_max: null,
          tipo: "percentual_receita",
          valor: a.percentual,
        },
        vendasComissionaveis: a.validos,
        vendasPendentes: a.pendentes,
        estornos: a.reprovados,
        valorBase: a.comissao,
        bonusFixo: 0,
        gatilhos: [],
        total: a.comissao,
        totalSeLiberar: a.comissao,
        debitoMeta: 0,
        metaEfetiva: META_REFIDELIZACAO,
      },
      debito: { aplicado: false, quantidade: 0, coorte: mes, observacao: null },
      contratos: linhas,
      assinaturasDispensadas: [],
      fechadoEm,
      fechadoPor: fechadoPorNome,
    });
  }

  return saida;
}

/**
 * Snapshots do Setor de Retenção (régua por taxa, aprovada 31/08/2026 — sem
 * mês de sombra, valendo desde agosto). Mesma estrutura dos demais para o
 * fechamento, o financeiro e o PDF tratarem tudo pelo mesmo caminho.
 *
 * Tradução da régua para o formato do snapshot: "meta" = casos elegíveis,
 * "vendas comissionáveis" = clientes retidos, atingimento = taxa de retenção.
 */
export async function montarSnapshotsRetencao(
  competenciaIso: string,
  fechadoPorNome: string | null
): Promise<Map<string, SnapshotComissao>> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(competenciaIso);
  const { retencaoDoMes, FAIXAS_RETENCAO } = await import("@/lib/retencao/dados");
  const dados = await retencaoDoMes(mes);
  const fechadoEm = new Date().toISOString();
  const saida = new Map<string, SnapshotComissao>();

  const { data: agentes } = await admin
    .from("vendedores")
    .select("id, nome, sgp_login, pops(nome)")
    .eq("setor", "retencao");

  for (const a of dados) {
    const cadastro = (agentes ?? []).find(
      (v) => String(v.sgp_login ?? "").toLowerCase() === a.agente
    );
    if (!cadastro) continue;

    const linhas: ContratoSnapshot[] = a.linhas
      .filter((l) => l.desfecho === "retido" && !l.clawback)
      .map((l) => ({
        sgpContratoId: l.sgpContratoId,
        cliente: l.clienteNome,
        plano: l.trilha ? `trilha ${l.trilha}` : null,
        valor: l.valorMensal,
        dataVenda: l.criadoEm.slice(0, 10),
        status: "retido",
        liberadaPor: "regra",
      }));

    saida.set(cadastro.id as string, {
      competencia: mes,
      tipo: "retencao",
      vendedora: (cadastro.nome as string) ?? a.agente,
      pop: (cadastro.pops as unknown as { nome: string } | null)?.nome ?? null,
      regra: {
        degraus: FAIXAS_RETENCAO.map((f) => ({
          atingimento_min: f.min,
          atingimento_max: null,
          tipo: "percentual_receita" as const,
          valor: f.pct,
        })),
        gatilhos: [],
        estornoDias: 30,
      },
      meta: a.elegiveis,
      resultado: {
        atingimentoPct: a.taxaPct / 100,
        degrau: a.faixaPct
          ? {
              atingimento_min: 0,
              atingimento_max: null,
              tipo: "percentual_receita",
              valor: a.faixaPct,
            }
          : null,
        vendasComissionaveis: a.retidos,
        vendasPendentes: a.emRisco,
        estornos: a.clawbacks,
        valorBase: a.comissao,
        bonusFixo: 0,
        gatilhos: [],
        total: a.comissao,
        totalSeLiberar: a.comissao,
        debitoMeta: 0,
        metaEfetiva: a.elegiveis,
      },
      debito: { aplicado: false, quantidade: 0, coorte: mes, observacao: null },
      contratos: linhas,
      assinaturasDispensadas: [],
      fechadoEm,
      fechadoPor: fechadoPorNome,
    });
  }
  return saida;
}


/**
 * Etapa 3 do fechamento: o override da gestão entra na MESMA competência dos
 * agentes — o financeiro paga tudo junto. 100% derivado dos pilares.
 */
export async function montarSnapshotGerencia(
  competenciaIso: string,
  fechadoPorNome: string | null
): Promise<Map<string, SnapshotComissao>> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(competenciaIso);
  const { overrideDoMes, NOME_NIVEL, PCT_POR_NIVEL } = await import("@/lib/gerencia/dados");
  const d = await overrideDoMes(mes);
  const saida = new Map<string, SnapshotComissao>();

  const { data: pseudo } = await admin
    .from("vendedores")
    .select("id")
    .eq("nome", "Gestão Comercial")
    .maybeSingle();
  if (!pseudo || d.bloqueado) return saida;

  saida.set(pseudo.id as string, {
    competencia: mes,
    tipo: "gerencia",
    vendedora: "Gestão Comercial — Override",
    pop: null,
    regra: {
      degraus: PCT_POR_NIVEL.slice(1).map((pct, i) => ({
        atingimento_min: [60, 81, 101, 121][i],
        atingimento_max: null,
        tipo: "percentual_receita" as const,
        valor: pct,
      })),
      gatilhos: [],
      estorno_dias: 0,
    } as never,
    meta: 4,
    resultado: {
      atingimentoPct: d.overridePct / 100,
      degrau:
        d.nivelFinal > 0
          ? { atingimento_min: 0, atingimento_max: null, tipo: "percentual_receita", valor: d.overridePct }
          : null,
      vendasComissionaveis: d.nivelFinal,
      vendasPendentes: 0,
      estornos: 0,
      valorBase: d.base.total,
      bonusFixo: 0,
      gatilhos: [],
      total: d.comissao,
      totalSeLiberar: d.comissao,
      debitoMeta: 0,
      metaEfetiva: 4,
    },
    debito: {
      aplicado: false,
      quantidade: 0,
      coorte: mes,
      observacao: d.flags.observacao,
    },
    contratos: [],
    assinaturasDispensadas: [],
    fechadoEm: new Date().toISOString(),
    fechadoPor: fechadoPorNome,
    gerencia: {
      pilares: d.pilares.map((pl) => ({
        rotulo: pl.rotulo,
        volume: pl.volume,
        meta: pl.meta,
        atingimentoPct: pl.atingimentoPct,
        nivel: pl.nivel,
      })),
      nivelFinal: d.nivelFinal,
      nomeNivel: NOME_NIVEL[d.nivelFinal],
      overridePct: d.overridePct,
      base: d.base,
      pilarLimitante: d.pilarLimitante?.rotulo ?? null,
      flags: { earlyChurn: d.flags.earlyChurn, clawback: d.flags.clawback },
    },
  });
  return saida;
}
