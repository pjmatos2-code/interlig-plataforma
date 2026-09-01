import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";
import { refidelizacaoDoMes, AGENTES_SETOR } from "@/lib/refidelizacao/dados";
import { META_REFIDELIZACAO } from "@/lib/refidelizacao/regras";
import { retencaoDoMes } from "@/lib/retencao/dados";
import { debitoPorCoorte } from "@/lib/comissao/debito";

/**
 * Módulo de Override de Gerência — Instrução Geral Ago/2026, Seção 6 (v1.1,
 * homologada 01/09/2026). 100% derivado dos lançamentos já validados: nada é
 * digitado aqui.
 *
 * Comissão da gestão = base global × percentual do MENOR nível entre os três
 * pilares (Vendas, Refidelização, Retenção). Qualquer pilar abaixo da entrada
 * (vendas < 60%, refi < 60%, retenção < 16) zera o override do mês inteiro.
 *
 * Base global = VTV vendas novas + VTV refidelizado + VTV retido + LIGCHIP.
 * LIGCHIP compõe o VALOR, mas não conta no VOLUME de nenhum pilar.
 */

export const VERSAO_REGRA = "v1.1 · Ago/2026 · POP-RET-001 v2.0";

/** N0..N4 → percentual do override */
export const PCT_POR_NIVEL = [0, 1.5, 2.0, 2.5, 3.0] as const;
export const NOME_NIVEL = ["Abaixo do mínimo", "Mínimo", "Básico", "Meta", "Desafio"] as const;

/** eixos da faixa absoluta de retenção (escala v2.0 — 1 agente ativa) */
export const EIXOS_RETENCAO = [16, 21, 25, 29] as const;

/** faixa por % de atingimento (2 casas, sem arredondar pra cima — seção 2.4) */
export function nivelPorPct(atingimentoPct: number): number {
  const p = Math.floor(atingimentoPct * 100) / 100;
  if (p < 60) return 0;
  if (p <= 80) return 1;
  if (p <= 100) return 2;
  if (p <= 120) return 3;
  return 4;
}

/** faixa absoluta de retenção: <16→N0 · 16–20→N1 · 21–24→N2 · 25–28→N3 · 29+→N4 */
export function nivelPorRetencao(retencoes: number): number {
  if (retencoes < EIXOS_RETENCAO[0]) return 0;
  if (retencoes < EIXOS_RETENCAO[1]) return 1;
  if (retencoes < EIXOS_RETENCAO[2]) return 2;
  if (retencoes < EIXOS_RETENCAO[3]) return 3;
  return 4;
}

export type Pilar = {
  chave: "vendas" | "refidelizacao" | "retencao";
  rotulo: string;
  volume: number;
  meta: number | null; // null = faixa absoluta (retenção)
  atingimentoPct: number | null;
  nivel: number;
  /** quanto falta para o PRÓXIMO nível deste pilar (em unidades do pilar) */
  faltamProximo: number | null;
};

export type OverrideGerencia = {
  competencia: string;
  regra: string;
  flags: { earlyChurn: boolean; clawback: boolean; observacao: string | null };
  bloqueado: string | null; // meta não cadastrada etc.
  pilares: Pilar[];
  pilarLimitante: Pilar | null;
  nivelFinal: number;
  overridePct: number;
  base: { vtvVendas: number; vtvRefi: number; vtvRetido: number; vtvLigchip: number; total: number };
  comissao: number;
  /** oportunidade: se só o limitante sobe 1 nível, quanto o mês ganha */
  oportunidade: { faltam: number; unidade: string; novoPct: number; ganho: number } | null;
  riscoZerar: Pilar[];
  debitoEarlyChurn: number;
  /** composição da meta de vendas (quem soma) */
  metaVendasComposicao: { nome: string; meta: number }[];
  foraDaMeta: string[];
};

const ehLigchip = (plano: string | null | undefined) =>
  (plano ?? "").toUpperCase().includes("LIGCHIP");

// regra 5.1: cancelamento por erro de cadastro/duplicidade não é venda
const MOTIVOS_EXCLUIDOS = ["erro de cadastro", "duplicidade"];

export async function overrideDoMes(mesIso?: string): Promise<OverrideGerencia> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(mesIso ?? hojeIso());
  const fim = ultimoDiaDoMes(mes);

  const [{ data: contratos }, { data: vendedores }, { data: cfg }, refi, retencao, debitoCoorte] =
    await Promise.all([
      admin
        .from("contratos")
        .select("valor_mensalidade, vendedor_id, status, motivo_cancelamento, planos(nome)")
        .gte("data_venda", mes)
        .lte("data_venda", fim)
        .limit(5000),
      admin.from("vendedores").select("id, nome, setor, ativo, soma_meta"),
      admin.from("gerencia_config").select("*").eq("competencia", mes).maybeSingle(),
      refidelizacaoDoMes(mes),
      retencaoDoMes(mes),
      debitoPorCoorte(mes),
    ]);

  const flags = {
    earlyChurn: cfg?.flag_early_churn ?? true,
    clawback: cfg?.flag_clawback ?? true,
    observacao: (cfg?.observacao as string | null) ?? null,
  };

  // ---- pilar VENDAS: times interno e externo, todas as unidades ----
  const comerciais = new Set(
    (vendedores ?? [])
      .filter((v) => String(v.setor ?? "").startsWith("comercial"))
      .map((v) => v.id as string)
  );
  const vendasDoMes = (contratos ?? []).filter((c) => {
    if (!c.vendedor_id || !comerciais.has(c.vendedor_id as string)) return false;
    const motivo = String(c.motivo_cancelamento ?? "").toLowerCase();
    if (c.status === "cancelado" && MOTIVOS_EXCLUIDOS.some((m) => motivo.includes(m))) return false;
    return true;
  });
  const ligchips = vendasDoMes.filter((c) => ehLigchip((c.planos as unknown as { nome: string } | null)?.nome));
  const vendasNovas = vendasDoMes.filter((c) => !ehLigchip((c.planos as unknown as { nome: string } | null)?.nome));

  const vtvVendas = vendasNovas.reduce((s, c) => s + Number(c.valor_mensalidade ?? 0), 0);
  const vtvLigchip = ligchips.reduce((s, c) => s + Number(c.valor_mensalidade ?? 0), 0);

  // early churn: débito em VOLUME na meta de vendas (OFF no mês de migração)
  const debitoEarlyChurn = flags.earlyChurn
    ? [...debitoCoorte.porVendedora.entries()]
        .filter(([id]) => comerciais.has(id))
        .reduce((s, [, q]) => s + q, 0)
    : 0;
  const vendasAjustadas = Math.max(vendasNovas.length - debitoEarlyChurn, 0);

  // meta gerencial = soma das metas dos agentes comerciais ativos com soma_meta
  const { data: metas } = await admin
    .from("metas")
    .select("referencia_id, quantidade_vendas")
    .eq("mes_ano", mes)
    .eq("escopo", "vendedora");
  const infoVend = new Map((vendedores ?? []).map((v) => [v.id as string, v]));
  const metaVendasComposicao: { nome: string; meta: number }[] = [];
  const foraDaMeta: string[] = [];
  for (const m of metas ?? []) {
    const v = infoVend.get(m.referencia_id as string);
    if (!v || !v.ativo || !String(v.setor ?? "").startsWith("comercial")) continue;
    if (v.soma_meta) metaVendasComposicao.push({ nome: v.nome as string, meta: Number(m.quantidade_vendas ?? 0) });
    else foraDaMeta.push(v.nome as string);
  }
  const metaVendas = metaVendasComposicao.reduce((s, m) => s + m.meta, 0);

  // ---- pilar REFIDELIZAÇÃO ----
  const metaRefi = META_REFIDELIZACAO * AGENTES_SETOR.length;
  const refiPlanos = refi.totais.validos;
  const vtvRefi = refi.totais.vtv;

  // ---- pilar RETENÇÃO (faixa absoluta v2.0) ----
  const linhasRet = retencao.flatMap((m) => m.linhas);
  const retidosTodos = linhasRet.filter((l) => l.desfecho === "retido");
  const clawbacks = retidosTodos.filter((l) => l.clawback);
  // clawback OFF (migração): retenção conta e vale mesmo com cancelamento ≤30d
  const retValidas = flags.clawback ? retidosTodos.length - clawbacks.length : retidosTodos.length;
  const vtvRetido = (flags.clawback ? retidosTodos.filter((l) => !l.clawback) : retidosTodos)
    .reduce((s, l) => s + l.valorMensal, 0);

  const bloqueado =
    metaVendas <= 0
      ? "Meta de vendas do mês não cadastrada — configure em Metas e comissão."
      : metaRefi <= 0
        ? "Meta de refidelização não configurada."
        : null;

  const atingVendas = metaVendas > 0 ? (vendasAjustadas / metaVendas) * 100 : 0;
  const atingRefi = metaRefi > 0 ? (refiPlanos / metaRefi) * 100 : 0;

  const proximoPct = (nivel: number, meta: number) => {
    // menor volume que entra no próximo nível (piso da faixa seguinte, em unidades)
    const pisos = [60, 80.01, 100.01, 120.01]; // entrada de N1..N4
    if (nivel >= 4) return null;
    return Math.max(0, Math.ceil((pisos[nivel] / 100) * meta));
  };

  const pilares: Pilar[] = [
    (() => {
      const nivel = bloqueado ? 0 : nivelPorPct(atingVendas);
      const alvo = metaVendas > 0 ? proximoPct(nivel, metaVendas) : null;
      return {
        chave: "vendas" as const,
        rotulo: "Vendas",
        volume: vendasAjustadas,
        meta: metaVendas,
        atingimentoPct: atingVendas,
        nivel,
        faltamProximo: alvo !== null ? Math.max(0, alvo - vendasAjustadas) : null,
      };
    })(),
    (() => {
      const nivel = nivelPorPct(atingRefi);
      const alvo = proximoPct(nivel, metaRefi);
      return {
        chave: "refidelizacao" as const,
        rotulo: "Refidelização",
        volume: refiPlanos,
        meta: metaRefi,
        atingimentoPct: atingRefi,
        nivel,
        faltamProximo: alvo !== null ? Math.max(0, alvo - refiPlanos) : null,
      };
    })(),
    (() => {
      const nivel = nivelPorRetencao(retValidas);
      const alvo = nivel >= 4 ? null : EIXOS_RETENCAO[nivel];
      return {
        chave: "retencao" as const,
        rotulo: "Retenção",
        volume: retValidas,
        meta: null,
        atingimentoPct: null,
        nivel,
        faltamProximo: alvo !== null ? Math.max(0, alvo - retValidas) : null,
      };
    })(),
  ];

  const nivelFinal = bloqueado ? 0 : Math.min(...pilares.map((p) => p.nivel));
  const overridePct = PCT_POR_NIVEL[nivelFinal];
  const total = vtvVendas + vtvRefi + vtvRetido + vtvLigchip;
  const comissao = Math.round(total * overridePct) / 100;

  // pilar limitante: o de menor nível (desempate: menor atingimento relativo)
  const limitantes = pilares.filter((p) => p.nivel === Math.min(...pilares.map((x) => x.nivel)));
  const pilarLimitante = limitantes[0] ?? null;

  // oportunidade: SÓ quando um único pilar segura o nível — subir esse pilar
  // eleva o mês inteiro
  let oportunidade: OverrideGerencia["oportunidade"] = null;
  if (!bloqueado && nivelFinal < 4 && limitantes.length === 1 && pilarLimitante?.faltamProximo != null) {
    const novoNivel = Math.min(
      pilarLimitante.nivel + 1,
      ...pilares.filter((p) => p !== pilarLimitante).map((p) => p.nivel)
    );
    if (novoNivel > nivelFinal) {
      const novoPct = PCT_POR_NIVEL[novoNivel];
      oportunidade = {
        faltam: pilarLimitante.faltamProximo,
        unidade:
          pilarLimitante.chave === "vendas" ? "vendas" : pilarLimitante.chave === "refidelizacao" ? "planos" : "retenções",
        novoPct,
        ganho: Math.round(total * (novoPct - overridePct)) / 100,
      };
    }
  }

  return {
    competencia: mes,
    regra: VERSAO_REGRA,
    flags,
    bloqueado,
    pilares,
    pilarLimitante,
    nivelFinal,
    overridePct,
    base: { vtvVendas, vtvRefi, vtvRetido, vtvLigchip, total },
    comissao,
    oportunidade,
    riscoZerar: pilares.filter((p) => p.nivel === 0),
    debitoEarlyChurn,
    metaVendasComposicao,
    foraDaMeta,
  };
}
