import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { comissoesDoMes, type ContratoApurado } from "@/lib/comissao/dados";
import { debitoPorCoorte, type ItemDebito } from "@/lib/comissao/debito";
import type { DegrauComissao } from "@/lib/indicadores/comissao";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";

/**
 * Painel de comissões do comercial (01/10/2026). Tudo sai de comissoesDoMes —
 * o mesmo motor do fechamento e da "Minha comissão" —, só que aberto: cada
 * número vem com a conta e os contratos que o formam, e o mês fechado é
 * comparado com o valor congelado que o financeiro paga.
 */

export type AgentePainel = {
  vendedorId: string;
  nome: string;
  foto: string | null;
  pop: string | null;
  setor: string | null;
  /** liderança comissiona sobre ativações do time/POP, não sobre vendas próprias */
  base: "proprias" | "equipe" | "pop";
  meta: number;
  reposicao: number;
  reposicaoManual: boolean;
  metaFinal: number;
  vendidas: number;
  naoContam: number;
  estornadas: number;
  validas: number;
  ativas: number;
  aprovadas: number;
  aprovadasGestao: number;
  pendAssinatura: number;
  pendAtivacao: number;
  /** cliente desistiu antes de instalar: conta na meta, nunca comissiona, não vai para aprovação */
  desistencias: number;
  /** atingimento em % (escala 0–100+) — válidas ÷ meta final */
  atingimento: number;
  degraus: DegrauComissao[];
  degrau: DegrauComissao | null;
  proximo: { faltam: number; degrau: DegrauComissao } | null;
  receitaAprovada: number;
  /** VTV das vendas válidas (o que pontua a meta), aprovadas ou não */
  vtvVendido: number;
  comissao: number;
  comissaoSeLiberar: number;
  bonusEGatilhos: number;
  /** as partes batem com o resultado do motor (válidas, aprovadas, valor) */
  conferido: boolean;
  fechado: { valor: number; aprovadas: number; metaFinal: number } | null;
  contratos: ContratoApurado[];
  inadimplentes: ItemDebito[];
};

export type PainelComissoes = {
  mes: string;
  emAndamento: boolean;
  fechamento: { em: string; por: string | null; total: number; pago: boolean } | null;
  ultimaSync: string | null;
  debito: { coorte: string; janela: { de: string; ate: string } | null; aplicado: boolean; observacao: string | null };
  agentes: AgentePainel[];
  /** tinham meta no mês mas estão inativas — ficam fora da apuração */
  inativasComMeta: string[];
  semMetaOuRegra: string[];
};

/** menor quantidade de válidas que alcança o degrau (o motor arredonda o %) */
function vendasParaDegrau(min: number, metaFinal: number): number {
  let n = Math.max(0, Math.floor((min / 100) * metaFinal) - 1);
  while (Math.round((n / metaFinal) * 100) < min) n++;
  return n;
}

export async function carregarPainelComissoes(
  mesIso?: string,
  opcoes: {
    /**
     * Painel da PRÓPRIA agente ("Meu painel"): lê pelo client de serviço (a
     * agente não enxerga títulos/coorte pela RLS) e devolve SÓ ela.
     */
    vendedorId?: string;
    /** Financeiro: lê pelo client de serviço (a RLS zeraria os contratos) */
    ignorarRls?: boolean;
  } = {}
): Promise<PainelComissoes> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const mes = primeiroDiaDoMes(mesIso ?? hoje);

  const [comissoes, debito, { data: fechadas }, { data: metas }, { data: vends }, { data: sync }] =
    await Promise.all([
      comissoesDoMes(mes, opcoes.vendedorId || opcoes.ignorarRls ? { ignorarRls: true } : undefined),
      debitoPorCoorte(mes),
      admin
        .from("comissoes_fechadas")
        .select("vendedor_id, valor_total, snapshot, fechado_em, pago_em, usuarios!comissoes_fechadas_fechado_por_fkey(nome)")
        .eq("mes_ano", mes),
      admin.from("metas").select("referencia_id").eq("escopo", "vendedora").eq("mes_ano", mes),
      admin.from("vendedores").select("id, nome, ativo, setor"),
      admin
        .from("sync_runs")
        .select("finalizado_em")
        .eq("entidade", "contratos")
        .not("finalizado_em", "is", null)
        .order("finalizado_em", { ascending: false })
        .limit(1),
    ]);

  const fechadaPor = new Map((fechadas ?? []).map((f) => [f.vendedor_id as string, f]));

  const agentes: AgentePainel[] = [];
  const semMetaOuRegra: string[] = [];
  for (const c of comissoes) {
    if (opcoes.vendedorId && c.vendedorId !== opcoes.vendedorId) continue;
    const r = c.resultado;
    if (!r || !c.regra || !c.metaMensal || !c.detalhe) {
      semMetaOuRegra.push(c.nome);
      continue;
    }
    const ct = c.detalhe.contratos;
    const conta = (s: ContratoApurado["situacao"]) => ct.filter((x) => x.situacao === s).length;
    const pendente = (s: ContratoApurado["situacao"]) => ct.filter((x) => x.situacao === s && !x.desistencia).length;
    const naoContam = conta("nao_conta");
    const estornadas = conta("estornada");
    const vendidas = ct.length - naoContam;
    const validasLista = ct.filter((x) => x.situacao !== "nao_conta" && x.situacao !== "estornada");
    const aprovadasLista = validasLista.filter((x) => x.situacao === "aprovada" || x.situacao === "aprovada_gestao");
    const degraus = [...c.regra.degraus].sort((a, b) => a.atingimento_min - b.atingimento_min);
    const metaFinal = r.metaEfetiva;
    const acima = degraus.find((d) => Math.round(r.atingimentoPct) < d.atingimento_min) ?? null;
    const snap = fechadaPor.get(c.vendedorId);
    const snapRes = (snap?.snapshot as { resultado?: { vendasComissionaveis?: number; metaEfetiva?: number } } | null)
      ?.resultado;
    const bonusEGatilhos = r.bonusFixo + r.gatilhos.reduce((s, g) => s + g.adicional, 0);

    agentes.push({
      vendedorId: c.vendedorId,
      nome: c.nome,
      foto: c.foto ?? null,
      pop: c.pop ?? null,
      setor: c.setor ?? null,
      base: c.detalhe.base,
      meta: c.metaMensal,
      reposicao: r.debitoMeta,
      reposicaoManual: debito.manuais.has(c.vendedorId),
      metaFinal,
      vendidas,
      naoContam,
      estornadas,
      validas: validasLista.length,
      ativas: validasLista.filter((x) => x.status === "ativo").length,
      aprovadas: aprovadasLista.length,
      aprovadasGestao: conta("aprovada_gestao"),
      pendAssinatura: pendente("pendente_assinatura"),
      pendAtivacao: pendente("pendente_ativacao"),
      desistencias: ct.filter(
        (x) => x.desistencia && (x.situacao === "pendente_assinatura" || x.situacao === "pendente_ativacao")
      ).length,
      atingimento: r.atingimentoPct,
      degraus,
      degrau: r.degrau,
      proximo: acima ? { faltam: Math.max(1, vendasParaDegrau(acima.atingimento_min, metaFinal) - validasLista.length), degrau: acima } : null,
      receitaAprovada: aprovadasLista.reduce((s, x) => s + x.valor, 0),
      vtvVendido: validasLista.reduce((s, x) => s + x.valor, 0),
      comissao: r.total,
      comissaoSeLiberar: r.totalSeLiberar,
      bonusEGatilhos,
      conferido:
        validasLista.length === r.vendasComissionaveis + r.vendasPendentes &&
        aprovadasLista.length === r.vendasComissionaveis &&
        estornadas === r.estornos,
      fechado: snap
        ? {
            valor: Number(snap.valor_total),
            aprovadas: Number(snapRes?.vendasComissionaveis ?? 0),
            metaFinal: Number(snapRes?.metaEfetiva ?? 0),
          }
        : null,
      contratos: ct,
      inadimplentes: debito.itensPorVendedora.get(c.vendedorId) ?? [],
    });
  }
  // liderança no fim: o foco do painel é quem vende
  agentes.sort((a, b) => (a.base === "proprias" ? 0 : 1) - (b.base === "proprias" ? 0 : 1) || b.comissao - a.comissao);

  if (opcoes.vendedorId) {
    // fora do time inteiro: nada de nomes de colegas nem totais do fechamento
    const minha = (fechadas ?? []).find((f) => f.vendedor_id === opcoes.vendedorId);
    return {
      mes,
      emAndamento: ultimoDiaDoMes(mes) >= hoje,
      fechamento: minha
        ? { em: minha.fechado_em as string, por: null, total: Number(minha.valor_total), pago: Boolean(minha.pago_em) }
        : null,
      ultimaSync: (sync?.[0]?.finalizado_em as string | undefined) ?? null,
      debito: { coorte: debito.coorte, janela: debito.janela, aplicado: debito.aplicado, observacao: debito.observacao },
      agentes,
      inativasComMeta: [],
      semMetaOuRegra: [],
    };
  }

  const ativos = new Set(comissoes.map((c) => c.vendedorId));
  const inativasComMeta = (metas ?? [])
    .map((m) => (vends ?? []).find((v) => v.id === m.referencia_id))
    .filter((v): v is NonNullable<typeof v> => !!v && !v.ativo && !ativos.has(v.id as string))
    .filter((v) => ["comercial_interno", "comercial_externo", "corporativo"].includes(v.setor as string))
    .map((v) => v.nome as string);

  const primeira = (fechadas ?? [])[0];
  return {
    mes,
    emAndamento: ultimoDiaDoMes(mes) >= hoje,
    fechamento: primeira
      ? {
          em: primeira.fechado_em as string,
          por: (primeira.usuarios as unknown as { nome: string } | null)?.nome ?? null,
          total: (fechadas ?? []).reduce((s, f) => s + Number(f.valor_total), 0),
          pago: (fechadas ?? []).some((f) => f.pago_em),
        }
      : null,
    ultimaSync: (sync?.[0]?.finalizado_em as string | undefined) ?? null,
    debito: { coorte: debito.coorte, janela: debito.janela, aplicado: debito.aplicado, observacao: debito.observacao },
    agentes,
    inativasComMeta,
    semMetaOuRegra,
  };
}
