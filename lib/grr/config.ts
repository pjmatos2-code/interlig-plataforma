import { num, pct, reais, reais2 } from "@/lib/relatorio-semanal/formato";
import type { Status } from "@/lib/relatorio-semanal/tipos";
import { indicadorPorChave, type DefinicaoIndicador } from "./catalogo";
import type { NivelEscopo } from "./escopo";
import type { CartaoGrr } from "./montar";

/**
 * Configuração do GRR (Etapa 2): o que a administração define para cada
 * indicador — se aparece, quem é o dono e a meta com a faixa de atenção.
 * Funções puras; a leitura do banco está em lib/grr/config-dados.ts.
 */

export type ConfigIndicador = { chave: string; ativo: boolean; dono: string | null };

export type MetaGrr = {
  id: string;
  indicador: string;
  escopo_tipo: NivelEscopo;
  escopo_ref: string | null;
  /** primeiro dia em que a linha vale (uma segunda-feira) */
  vigente_desde: string;
  /** null nos dois = meta encerrada a partir desta data, neste recorte */
  meta: number | null;
  limite_atencao: number | null;
  observacao: string | null;
  criado_em: string;
  criado_por: string | null;
};

export type ConfigGrr = {
  /** false enquanto as tabelas do GRR não existem no banco: o painel segue só com as regras da plataforma */
  disponivel: boolean;
  indicadores: ConfigIndicador[];
  metas: MetaGrr[];
};

export const SEM_CONFIG: ConfigGrr = { disponivel: false, indicadores: [], metas: [] };

/** o recorte da tela, como é guardado nas metas e nas fotos: tipo e id (unidade, coordenador ou agente) */
export type ChaveEscopo = { tipo: NivelEscopo; ref: string | null };

function linhaDoRecorte(metas: MetaGrr[], indicador: string, chave: ChaveEscopo, dia: string): MetaGrr | null {
  return (
    metas
      .filter((m) => m.indicador === indicador && m.escopo_tipo === chave.tipo && (m.escopo_ref ?? null) === (chave.ref ?? null) && m.vigente_desde <= dia)
      .sort((a, b) => (a.vigente_desde !== b.vigente_desde ? (a.vigente_desde < b.vigente_desde ? 1 : -1) : a.criado_em < b.criado_em ? 1 : -1))[0] ?? null
  );
}

/**
 * A meta que vale para o indicador num dia e num recorte: a linha mais
 * recente que já começou. Sem meta no próprio recorte (ou com ela
 * encerrada), taxas e médias herdam a meta da empresa; volumes, não.
 */
export function metaVigente(metas: MetaGrr[], def: Pick<DefinicaoIndicador, "chave" | "herdaMeta">, chave: ChaveEscopo, dia: string): MetaGrr | null {
  const doRecorte = linhaDoRecorte(metas, def.chave, chave, dia);
  if (doRecorte && doRecorte.meta != null && doRecorte.limite_atencao != null) return doRecorte;
  if (chave.tipo !== "empresa" && def.herdaMeta) {
    const daEmpresa = linhaDoRecorte(metas, def.chave, { tipo: "empresa", ref: null }, dia);
    if (daEmpresa && daEmpresa.meta != null && daEmpresa.limite_atencao != null) return daEmpresa;
  }
  return null;
}

/** farol pela faixa: maior é melhor → ok a partir da meta, atenção a partir do limite; menor é melhor → o inverso */
export function statusPorFaixa(valor: number | null, meta: number, limiteAtencao: number, polaridade: DefinicaoIndicador["polaridade"]): Status {
  if (valor == null) return "sem_meta";
  if (polaridade === "maior_melhor") return valor >= meta ? "ok" : valor >= limiteAtencao ? "atencao" : "critico";
  return valor <= meta ? "ok" : valor <= limiteAtencao ? "atencao" : "critico";
}

export function formatarValorDoIndicador(valor: number, unidade: DefinicaoIndicador["unidade"]): string {
  if (unidade === "percentual") return pct(valor);
  if (unidade === "moeda") return Number.isInteger(valor) ? reais(valor) : reais2(valor);
  return Number.isInteger(valor) ? num(valor) : valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** confere meta e faixa antes de gravar; devolve a mensagem do erro ou null */
export function validarMeta(def: Pick<DefinicaoIndicador, "unidade" | "polaridade">, meta: number, limiteAtencao: number): string | null {
  if (!Number.isFinite(meta) || !Number.isFinite(limiteAtencao)) return "Informe a meta e o limite de atenção em números.";
  if (meta < 0 || limiteAtencao < 0) return "Meta e limite não podem ser negativos.";
  if (def.unidade === "percentual" && (meta > 1 || limiteAtencao > 1)) return "Percentual vai de 0 a 100.";
  if (def.polaridade === "maior_melhor" && limiteAtencao > meta) return "Neste indicador maior é melhor: o limite de atenção fica abaixo da meta (ou igual a ela).";
  if (def.polaridade === "menor_melhor" && limiteAtencao < meta) return "Neste indicador menor é melhor: o limite de atenção fica acima da meta (ou igual a ela).";
  return null;
}

/**
 * Aplica a configuração aos cartões: tira os indicadores desligados, põe o
 * dono e, nos indicadores com meta do GRR, a meta e o farol. Indicador com
 * regra da plataforma (vendas, assinatura, instalação) fica como veio.
 */
export function aplicarConfig(cartoes: CartaoGrr[], config: ConfigGrr, chave: ChaveEscopo, dia: string): CartaoGrr[] {
  if (!config.disponivel) return cartoes;
  const porChave = new Map(config.indicadores.map((i) => [i.chave, i]));
  return cartoes
    .filter((c) => porChave.get(c.chave)?.ativo !== false)
    .map((c) => {
      const dono = porChave.get(c.chave)?.dono?.trim() || null;
      const def = indicadorPorChave(c.chave);
      const meta = def && def.metaOrigem === "grr" ? metaVigente(config.metas, def, chave, dia) : null;
      if (!def || !meta) return { ...c, dono };
      return { ...c, dono, meta: `meta ${formatarValorDoIndicador(meta.meta!, def.unidade)}`, metaNumero: meta.meta, status: statusPorFaixa(c.numero, meta.meta!, meta.limite_atencao!, def.polaridade) };
    });
}

/** "1.234,5" ou "35" → número; vazio ou inválido → null */
export function numeroBr(texto: string | null | undefined): number | null {
  const limpo = String(texto ?? "").trim().replace(/\s|R\$|%/g, "");
  if (!limpo) return null;
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) ? n : null;
}
