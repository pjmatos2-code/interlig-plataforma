/**
 * Base das unidades (Dashboard): evolução mensal de ativos, cancelamentos no
 * mês e suspensos, por unidade. Funções puras — a tela só desenha.
 *
 * Fonte: tabela `crescimento_base` (Relatórios > Contratos > Crescimento do
 * SGP, lida 1x/dia). `cancelados_mes` é o que o relatório cancelou em cada
 * mês; `cancelados_acum` é o total em status cancelado (informação à parte).
 *
 * Comparações usam só meses ENCERRADOS. O mês em andamento aparece separado,
 * marcado como parcial, e não entra em nenhuma variação.
 */

export type LinhaBase = {
  /** primeiro dia do mês, "aaaa-mm-dd" */
  mes: string;
  ativos: number;
  cancelados_mes: number;
  cancelados_acum: number;
  suspensos: number;
  atualizado_em?: string | null;
};

export type Variacao = {
  absoluta: number;
  /** fração (0,1 = 10%); null quando a base é zero e não há como calcular */
  percentual: number | null;
  direcao: "subiu" | "caiu" | "igual";
};

export type ChaveIndicador = "ativos" | "cancelamentos" | "suspensos";

export type SerieIndicador = {
  /** meses encerrados, do mais antigo ao mais recente ("aaaa-mm") */
  pontos: { mes: string; valor: number }[];
  /** último mês encerrado vs o anterior; null se só há um mês */
  vsAnterior: Variacao | null;
  /** último mês encerrado vs o primeiro da janela; null se só há um mês */
  janela: Variacao | null;
  /** mês em andamento, fora das comparações */
  parcial: { mes: string; valor: number } | null;
};

export type BaseDaUnidade = {
  indicadores: Record<ChaveIndicador, SerieIndicador>;
  /** total em status cancelado na leitura mais recente (não é série mensal) */
  emStatusCancelado: number | null;
  /** quando o SGP foi lido pela última vez para esta unidade */
  lidoEm: string | null;
};

export function variacao(atual: number, anterior: number): Variacao {
  const absoluta = atual - anterior;
  return {
    absoluta,
    percentual: anterior === 0 ? null : absoluta / anterior,
    direcao: absoluta > 0 ? "subiu" : absoluta < 0 ? "caiu" : "igual",
  };
}

const CAMPO: Record<ChaveIndicador, "ativos" | "cancelados_mes" | "suspensos"> = {
  ativos: "ativos",
  cancelamentos: "cancelados_mes",
  suspensos: "suspensos",
};

/**
 * @param linhas   linhas de UMA unidade, em qualquer ordem
 * @param mesAtual mês em andamento, "aaaa-mm" (fuso de Santarém)
 * @param meses    tamanho da janela de meses encerrados
 */
export function montarBaseDaUnidade(linhas: LinhaBase[], mesAtual: string, meses = 6): BaseDaUnidade {
  const ordenadas = [...linhas].sort((a, b) => a.mes.localeCompare(b.mes));
  const encerrados = ordenadas.filter((l) => l.mes.slice(0, 7) < mesAtual).slice(-meses);
  const emAndamento = ordenadas.find((l) => l.mes.slice(0, 7) === mesAtual) ?? null;
  const maisRecente = emAndamento ?? encerrados[encerrados.length - 1] ?? null;

  const serie = (chave: ChaveIndicador): SerieIndicador => {
    const campo = CAMPO[chave];
    const pontos = encerrados.map((l) => ({ mes: l.mes.slice(0, 7), valor: Number(l[campo] ?? 0) }));
    const ultimo = pontos[pontos.length - 1];
    const anterior = pontos[pontos.length - 2];
    return {
      pontos,
      vsAnterior: ultimo && anterior ? variacao(ultimo.valor, anterior.valor) : null,
      janela: ultimo && pontos.length > 1 ? variacao(ultimo.valor, pontos[0].valor) : null,
      parcial: emAndamento ? { mes: mesAtual, valor: Number(emAndamento[campo] ?? 0) } : null,
    };
  };

  return {
    indicadores: { ativos: serie("ativos"), cancelamentos: serie("cancelamentos"), suspensos: serie("suspensos") },
    emStatusCancelado: maisRecente ? Number(maisRecente.cancelados_acum ?? 0) : null,
    lidoEm: ordenadas.map((l) => l.atualizado_em ?? "").sort().at(-1) || null,
  };
}

/** limites "redondos" do eixo: [piso, teto] que contêm todos os valores */
export function limitesDoEixo(valores: number[], desdeZero: boolean): [number, number] {
  if (valores.length === 0) return [0, 1];
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const amplitude = Math.max(max - (desdeZero ? 0 : min), 1);
  // passo 1, 2 ou 5 × 10ⁿ, perto de 1/4 da amplitude
  const bruto = amplitude / 4;
  const pot = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  const n = bruto / pot;
  const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pot;
  const piso = desdeZero ? 0 : Math.max(0, Math.floor((min - passo * 0.5) / passo) * passo);
  const teto = Math.ceil((max + passo * 0.5) / passo) * passo;
  return [piso, Math.max(teto, piso + passo)];
}
