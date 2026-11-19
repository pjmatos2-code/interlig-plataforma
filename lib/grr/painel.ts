import { GRUPOS_GRR, indicadorPorChave, type GrupoGrr } from "./catalogo";
import type { CartaoGrr, DadosGrr } from "./montar";

/**
 * Contas de apresentação do painel do GRR (Resumo executivo e Modo
 * Apresentação). Não calculam indicador: só leem os cartões que o GRR já
 * montou com as regras oficiais e decidem como mostrar meta, atingimento,
 * situação e alertas.
 */

export type CartaoPainel = CartaoGrr & {
  metaNumero: number | null;
  /** realizado ÷ meta; só existe quando maior é melhor e há meta positiva */
  atingimento: number | null;
  menorEMelhor: boolean;
};

/** os quatro destaques da primeira linha, nesta ordem */
export const CHAVES_DESTAQUE = ["vendas_semana", "ativacoes_semana", "conversao", "receita"] as const;

/** meta do cartão em número; fotos antigas não guardavam, então vendas cai na meta da semana/mês */
export function metaNumericaDoCartao(c: CartaoGrr, dados: Pick<DadosGrr, "vendas">): number | null {
  if (c.metaNumero !== undefined) return c.metaNumero;
  if (c.chave === "vendas_semana") return dados.vendas.metaSemana != null ? Math.round(dados.vendas.metaSemana) : null;
  if (c.chave === "vendas_mes") return dados.vendas.metaMes;
  return null;
}

export function paraPainel(c: CartaoGrr, dados: Pick<DadosGrr, "vendas">): CartaoPainel {
  const def = indicadorPorChave(c.chave);
  const menorEMelhor = def?.polaridade === "menor_melhor";
  const metaNumero = metaNumericaDoCartao(c, dados);
  // atingimento só quando o percentual diz a verdade: maior é melhor, meta positiva e realizado conhecido
  const atingimento = !menorEMelhor && metaNumero != null && metaNumero > 0 && c.numero != null ? c.numero / metaNumero : null;
  return { ...c, metaNumero, atingimento, menorEMelhor };
}

export function destaquesDoResumo(dados: DadosGrr): CartaoPainel[] {
  return CHAVES_DESTAQUE.map((k) => dados.cartoes.find((c) => c.chave === k))
    .filter((c): c is CartaoGrr => !!c)
    .map((c) => paraPainel(c, dados));
}

export type Situacao = { ok: number; atencao: number; critico: number; semMeta: number; total: number };

/** quantos indicadores estão em cada faixa; sem meta fica à parte, nunca conta como bom */
export function situacaoDosIndicadores(cartoes: CartaoGrr[]): Situacao {
  const s: Situacao = { ok: 0, atencao: 0, critico: 0, semMeta: 0, total: cartoes.length };
  for (const c of cartoes) {
    if (c.status === "ok") s.ok++;
    else if (c.status === "atencao") s.atencao++;
    else if (c.status === "critico") s.critico++;
    else s.semMeta++;
  }
  return s;
}

export type GrupoDaTabela = { grupo: GrupoGrr; titulo: string; etapa: number; regra: string; linhas: CartaoPainel[] };

/** os sete grupos do GRR Comercial, cada um com as suas métricas (sem juntar métricas num número só) */
export function tabelaDeIndicadores(dados: DadosGrr): GrupoDaTabela[] {
  return GRUPOS_GRR.map((g) => ({
    grupo: g.chave,
    titulo: g.titulo,
    etapa: g.etapa,
    regra: g.regra,
    linhas: dados.cartoes.filter((c) => c.grupo === g.chave).map((c) => paraPainel(c, dados)),
  }));
}

export type Alerta = { nivel: "critico" | "atencao"; titulo: string; texto: string; grupo: GrupoGrr };

/** alertas reais do período: indicadores críticos primeiro, depois os em atenção */
export function alertasDoResumo(dados: DadosGrr, limite = 5): Alerta[] {
  const ordem = { critico: 0, atencao: 1 } as const;
  return dados.cartoes
    .filter((c): c is CartaoGrr & { status: "critico" | "atencao" } => c.status === "critico" || c.status === "atencao")
    .sort((a, b) => ordem[a.status] - ordem[b.status])
    .slice(0, limite)
    .map((c) => ({
      nivel: c.status,
      titulo: `${c.rotulo}: ${c.valor}${c.meta ? ` (${c.meta})` : ""}`,
      texto: c.contexto ?? "",
      grupo: c.grupo,
    }));
}

/** "76%" com no máximo uma casa quando passa de 999% fica sem casa */
export function textoAtingimento(a: number | null): string {
  if (a == null) return "—";
  return `${Math.round(a * 100).toLocaleString("pt-BR")}%`;
}

export type PontoGrafico = { inicio: string; rotulo: string; rotuloCurto: string; vendas: number; ativacoes: number; conversao: number | null; analisada: boolean; emAndamento: boolean; meta: number | null };

/** pontos do gráfico de evolução: a meta só na semana analisada (as outras podem ser de outro mês) */
export function pontosDoGrafico(dados: Pick<DadosGrr, "evolucao" | "semana" | "trechos" | "vendas">): PontoGrafico[] {
  return dados.evolucao.map((p) => {
    const analisada = p.inicio === dados.semana.inicio;
    return {
      inicio: p.inicio,
      rotulo: p.rotulo,
      rotuloCurto: `${p.inicio.slice(8, 10)}/${p.inicio.slice(5, 7)}`,
      vendas: p.vendas,
      ativacoes: p.ativacoes,
      conversao: p.conversao,
      analisada,
      emAndamento: analisada && dados.trechos.emAndamento,
      meta: analisada && dados.vendas.metaSemana != null ? Math.round(dados.vendas.metaSemana) : null,
    };
  });
}
