/**
 * Motor de comissionamento — PRD seção 6. Funções puras (rodam no servidor e
 * no simulador do navegador), testadas em comissao.test.ts.
 *
 * Regra parametrizável: degraus por % de atingimento da meta, gatilhos
 * extras e estorno por cancelamento precoce. Nunca fixar valores no código.
 */

export type DegrauComissao = {
  atingimento_min: number; // % (0–100+)
  atingimento_max: number | null; // null = sem teto
  tipo: "valor_por_venda" | "percentual_receita";
  valor: number; // R$ por venda OU % da receita
  bonus_fixo?: number;
};

export type GatilhoComissao =
  | { condicao: "ticket_medio_min"; valor: number; adicional: number }
  | { condicao: "plano_premium"; plano: string; adicional: number };

export type VendaComissao = {
  valor_mensalidade: number;
  plano: string | null;
  /** venda estornada: cancelada dentro da janela de estorno (casa com churn) */
  estornada: boolean;
  /**
   * Comissão liberada? A venda PONTUA a meta assim que cadastrada, mas a
   * comissão só é paga com Termo de Adesão + Contrato de Fidelidade assinados
   * e serviço ativo (critério do gestor). Ausente = liberada.
   */
  liberada?: boolean;
};

export type ResultadoComissao = {
  atingimentoPct: number;
  degrau: DegrauComissao | null;
  vendasComissionaveis: number;
  /** vendas válidas ainda sem comissão liberada (assinaturas/ativação pendentes) */
  vendasPendentes: number;
  estornos: number;
  valorBase: number;
  bonusFixo: number;
  gatilhos: { descricao: string; adicional: number }[];
  total: number;
  /** quanto a comissão vale se as pendentes forem liberadas */
  totalSeLiberar: number;
  /** estorno por quantidade: suspensos ≤90d sem pagar somam na meta do mês */
  debitoMeta: number;
  metaEfetiva: number;
};

/**
 * Seleciona o degrau pelo PISO: vale o maior atingimento_min alcançado.
 * Assim "0–79 / 80–99 / 100+" não tem vão em 99,9% — o teto declarado é
 * informativo; quem manda é o piso do degrau seguinte.
 */
export function encontrarDegrau(
  degraus: DegrauComissao[],
  atingimentoPct: number
): DegrauComissao | null {
  // arredonda antes de comparar: 100 vendas de 70 = 142,86% e a Instrução
  // classifica "100 ou mais" como Desafio (≥143%) — sem arredondar, exatamente
  // 100 vendas cairia no degrau anterior.
  const pct = Math.round(atingimentoPct);
  const alcancados = [...degraus]
    .sort((a, b) => a.atingimento_min - b.atingimento_min)
    .filter((d) => pct >= d.atingimento_min);
  return alcancados.length > 0 ? alcancados[alcancados.length - 1] : null;
}

function calcularNucleo(
  validas: VendaComissao[],
  comissionaveis: VendaComissao[],
  metaMensal: number,
  degraus: DegrauComissao[],
  gatilhos: GatilhoComissao[]
) {
  // a meta é PONTUADA por toda venda válida; a comissão sai só das liberadas
  const atingimentoPct = metaMensal <= 0 ? 0 : (validas.length / metaMensal) * 100;
  const degrau = encontrarDegrau(degraus, atingimentoPct);
  const receita = comissionaveis.reduce((s, v) => s + v.valor_mensalidade, 0);
  const ticketMedio = comissionaveis.length === 0 ? 0 : receita / comissionaveis.length;

  let valorBase = 0;
  if (degrau) {
    valorBase =
      degrau.tipo === "valor_por_venda"
        ? degrau.valor * comissionaveis.length
        : (degrau.valor / 100) * receita;
  }
  const bonusFixo = degrau?.bonus_fixo ?? 0;

  const gatilhosAplicados: ResultadoComissao["gatilhos"] = [];
  for (const g of gatilhos) {
    if (g.condicao === "ticket_medio_min") {
      if (comissionaveis.length > 0 && ticketMedio >= g.valor) {
        gatilhosAplicados.push({
          descricao: `Ticket médio ≥ R$ ${g.valor.toFixed(2)}`,
          adicional: g.adicional,
        });
      }
    } else if (g.condicao === "plano_premium") {
      const qtd = comissionaveis.filter((v) => v.plano === g.plano).length;
      if (qtd > 0) {
        gatilhosAplicados.push({ descricao: `${qtd}× plano ${g.plano}`, adicional: g.adicional * qtd });
      }
    }
  }

  const total =
    valorBase + bonusFixo + gatilhosAplicados.reduce((s, g) => s + g.adicional, 0);
  return { atingimentoPct, degrau, valorBase, bonusFixo, gatilhos: gatilhosAplicados, total };
}

export function calcularComissao(entrada: {
  vendas: VendaComissao[];
  metaMensal: number;
  degraus: DegrauComissao[];
  gatilhos: GatilhoComissao[];
  /**
   * Estorno por QUANTIDADE (regra do gestor): clientes das vendas dos 90
   * dias anteriores que ficaram suspensos sem pagar os primeiros boletos.
   * O débito SOMA na meta do mês — a vendedora precisa vender essa
   * quantidade a mais; nunca se desconta o valor da comissão já paga.
   */
  debitoMeta?: number;
}): ResultadoComissao {
  const validas = entrada.vendas.filter((v) => !v.estornada);
  const estornos = entrada.vendas.length - validas.length;
  const liberadas = validas.filter((v) => v.liberada !== false);
  const debito = Math.max(0, entrada.debitoMeta ?? 0);
  const metaEfetiva = entrada.metaMensal + debito;

  const nucleo = calcularNucleo(validas, liberadas, metaEfetiva, entrada.degraus, entrada.gatilhos);
  // cenário "tudo liberado": mostra quanto está preso nas pendências
  const cenarioCheio = calcularNucleo(validas, validas, metaEfetiva, entrada.degraus, entrada.gatilhos);

  return {
    ...nucleo,
    vendasComissionaveis: liberadas.length,
    vendasPendentes: validas.length - liberadas.length,
    estornos,
    totalSeLiberar: cenarioCheio.total,
    debitoMeta: debito,
    metaEfetiva,
  };
}

/**
 * Simulador (PRD 3.7/6): "quanto ganho se vender mais N?" — as vendas extras
 * entram pelo ticket médio atual (ou pela mensalidade média da regra de
 * negócio da tela), sem plano premium.
 */
export function simularMaisVendas(
  base: { vendas: VendaComissao[]; metaMensal: number; degraus: DegrauComissao[]; gatilhos: GatilhoComissao[]; debitoMeta?: number },
  maisN: number
): { atual: ResultadoComissao; simulado: ResultadoComissao; delta: number } {
  const atual = calcularComissao(base);
  const validas = base.vendas.filter((v) => !v.estornada);
  const ticketMedio =
    validas.length === 0
      ? 100
      : validas.reduce((s, v) => s + v.valor_mensalidade, 0) / validas.length;
  const extras: VendaComissao[] = Array.from({ length: maisN }, () => ({
    valor_mensalidade: ticketMedio,
    plano: null,
    estornada: false,
  }));
  const simulado = calcularComissao({ ...base, vendas: [...base.vendas, ...extras] });
  return { atual, simulado, delta: simulado.total - atual.total };
}

/**
 * Próximo degrau: quantas vendas faltam para alcançá-lo e quanto a comissão
 * passa a valer lá (simulando as vendas que faltam).
 */
export function proximoDegrau(base: {
  vendas: VendaComissao[];
  metaMensal: number;
  degraus: DegrauComissao[];
  gatilhos: GatilhoComissao[];
  debitoMeta?: number;
}): { faltamVendas: number; degrau: DegrauComissao; totalLa: number } | null {
  const metaEfetiva = base.metaMensal + Math.max(0, base.debitoMeta ?? 0);
  if (metaEfetiva <= 0) return null;
  const validas = base.vendas.filter((v) => !v.estornada).length;
  const atingimento = (validas / metaEfetiva) * 100;
  const acima = [...base.degraus]
    .sort((a, b) => a.atingimento_min - b.atingimento_min)
    .find((d) => d.atingimento_min > atingimento);
  if (!acima) return null;
  const vendasNecessarias = Math.ceil((acima.atingimento_min / 100) * metaEfetiva);
  const faltam = Math.max(1, vendasNecessarias - validas);
  const { simulado } = simularMaisVendas(base, faltam);
  return { faltamVendas: faltam, degrau: acima, totalLa: simulado.total };
}
