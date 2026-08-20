/**
 * Regras de cálculo dos indicadores — implementação EXATA da seção 5 do PRD.
 * Funções puras: recebem dados, devolvem números. Cada uma tem teste em
 * regras.test.ts. Nenhuma tela calcula indicador por conta própria.
 */

export type ContratoIndicador = {
  data_venda: string;
  data_assinatura: string | null;
  data_ativacao: string | null;
  data_cancelamento: string | null;
  motivo_cancelamento: string | null;
  status: string;
  valor_mensalidade: number;
};

const MOTIVOS_EXCLUIDOS_5_1 = ["erro de cadastro", "duplicidade"];

/** Alerta de ativação pendente (PRD 3.1: "> X dias"; padrão adotado: 7). */
export const ALERTA_ATIVACAO_DIAS = 7;
/** Alerta de assinatura pendente: 48h (PRD 3.1 e 5.8). */
export const ALERTA_ASSINATURA_DIAS = 2;

/**
 * 5.1 — a venda "conta"? Exclui cancelados ANTES da ativação quando o motivo
 * for erro de cadastro/duplicidade. Qualquer outro cancelamento conta como
 * venda (a qualidade aparece no churn, não some da venda).
 */
export function ehVendaContavel(c: ContratoIndicador): boolean {
  if (c.status !== "cancelado") return true;
  if (c.data_ativacao !== null) return true;
  const motivo = (c.motivo_cancelamento ?? "").trim().toLowerCase();
  return !MOTIVOS_EXCLUIDOS_5_1.includes(motivo);
}

/** 5.1 — contratos com data_venda no período, já filtrados pela regra acima. */
export function vendasDoPeriodo<T extends ContratoIndicador>(
  contratos: T[],
  de: string,
  ate: string
): T[] {
  return contratos.filter(
    (c) => c.data_venda >= de && c.data_venda <= ate && ehVendaContavel(c)
  );
}

/** 5.2 — soma das mensalidades vendidas no período (sem taxa de instalação). */
export function receitaContratada(vendas: ContratoIndicador[]): number {
  return vendas.reduce((soma, c) => soma + c.valor_mensalidade, 0);
}

/** 5.3 — receita contratada ÷ vendas do período. */
export function ticketMedio(vendas: ContratoIndicador[]): number {
  return vendas.length === 0 ? 0 : receitaContratada(vendas) / vendas.length;
}

/** 5.4 — vendas do mês até hoje ÷ meta mensal (fração 0–1+). */
export function percentualMeta(vendasMes: number, metaMensal: number): number {
  return metaMensal <= 0 ? 0 : vendasMes / metaMensal;
}

/**
 * 5.5 — pace: (meta − vendas acumuladas) ÷ dias úteis restantes (inclusive
 * hoje). Meta batida ou sem dias restantes → 0.
 */
export function pace(
  metaMensal: number,
  vendasAcumuladas: number,
  diasUteisRestantes: number
): number {
  const falta = metaMensal - vendasAcumuladas;
  if (falta <= 0 || diasUteisRestantes <= 0) return 0;
  return falta / diasUteisRestantes;
}

/**
 * 5.6 — projeção de fechamento: ritmo ponderado 70% × média diária dos últimos
 * 7 dias úteis + 30% × média diária do mês; projeção = acumulado + ritmo ×
 * dias úteis restantes.
 */
export function projecaoFechamento(entrada: {
  acumuladoMes: number;
  mediaUltimos7DiasUteis: number;
  mediaDiariaMes: number;
  diasUteisRestantes: number;
}): number {
  const ritmo =
    0.7 * entrada.mediaUltimos7DiasUteis + 0.3 * entrada.mediaDiariaMes;
  return entrada.acumuladoMes + ritmo * Math.max(0, entrada.diasUteisRestantes);
}

/** Farol da projeção (PRD 3.7): verde ≥ 100%, amarelo 85–99%, vermelho < 85%. */
export function farolProjecao(projecao: number, meta: number): "verde" | "amarelo" | "vermelho" {
  if (meta <= 0) return "vermelho";
  const p = projecao / meta;
  if (p >= 1) return "verde";
  if (p >= 0.85) return "amarelo";
  return "vermelho";
}

export type Pendencia = { contrato: ContratoIndicador; idadeDias: number; alerta: boolean };

/** 5.7 — assinados e sem ativação; idade = hoje − data de assinatura. */
export function ativacoesPendentes(
  contratos: ContratoIndicador[],
  hoje: string
): Pendencia[] {
  return contratos
    .filter(
      (c) =>
        c.data_assinatura !== null &&
        c.data_ativacao === null &&
        c.status !== "cancelado"
    )
    .map((c) => {
      const idadeDias = Math.round(
        (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${c.data_assinatura}T00:00:00Z`)) /
          86_400_000
      );
      return { contrato: c, idadeDias, alerta: idadeDias > ALERTA_ATIVACAO_DIAS };
    });
}

/** 5.8 — vendidos sem assinatura registrada; alerta ≥ 48h. */
export function pendentesAssinatura(
  contratos: ContratoIndicador[],
  hoje: string
): Pendencia[] {
  return contratos
    .filter((c) => c.data_assinatura === null && c.status !== "cancelado")
    .map((c) => {
      const idadeDias = Math.round(
        (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${c.data_venda}T00:00:00Z`)) /
          86_400_000
      );
      return { contrato: c, idadeDias, alerta: idadeDias >= ALERTA_ASSINATURA_DIAS };
    });
}

/**
 * Média diária dos últimos N dias úteis (para a 5.6). Recebe o mapa
 * dia → vendas e a lista de dias úteis já decorridos, em ordem.
 */
export function mediaUltimosNDiasUteis(
  vendasPorDia: Map<string, number>,
  diasUteisDecorridos: string[],
  n: number
): number {
  const ultimos = diasUteisDecorridos.slice(-n);
  if (ultimos.length === 0) return 0;
  const total = ultimos.reduce((soma, dia) => soma + (vendasPorDia.get(dia) ?? 0), 0);
  return total / ultimos.length;
}

/**
 * Meta diária individual (base da 5.13 e da meta derivada do PRD 3.7):
 * meta mensal ÷ dias úteis do mês. A meta semanal é a diária × dias úteis
 * da semana em questão.
 */
export function metaDiariaIndividual(metaMensal: number, diasUteisMes: number): number {
  return diasUteisMes <= 0 ? 0 : metaMensal / diasUteisMes;
}

/**
 * Tendência da vendedora (PRD 3.2): compara os últimos 7 dias com os 7 dias
 * imediatamente anteriores. Empate (ou 0 × 0) → estável.
 */
export function tendencia(
  vendasUltimos7: number,
  vendas7Anteriores: number
): "sobe" | "desce" | "estavel" {
  if (vendasUltimos7 > vendas7Anteriores) return "sobe";
  if (vendasUltimos7 < vendas7Anteriores) return "desce";
  return "estavel";
}

const dias = (deIso: string, ateIso: string) =>
  Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / 86_400_000);

/**
 * 5.9 — taxa de instalação efetiva: vendas do período ativadas em ≤ N dias ÷
 * vendas do período, contando SÓ vendas com a janela fechada (15+ dias de
 * idade). Vendas recentes demais ficam fora da base — não dá para saber ainda.
 */
export function taxaInstalacaoEfetiva(
  vendas: ContratoIndicador[],
  hoje: string,
  janelaDias = 15
): { taxa: number | null; base: number; instaladas: number } {
  const janelaFechada = vendas.filter((c) => dias(c.data_venda, hoje) >= janelaDias);
  const instaladas = janelaFechada.filter(
    (c) => c.data_ativacao !== null && dias(c.data_venda, c.data_ativacao) <= janelaDias
  ).length;
  return {
    taxa: janelaFechada.length === 0 ? null : instaladas / janelaFechada.length,
    base: janelaFechada.length,
    instaladas,
  };
}

/**
 * Tempo médio venda → ativação, em dias (PRD 3.5). Considera apenas
 * contratos já ativados; null quando não há nenhum.
 */
export function tempoMedioVendaAtivacao(contratos: ContratoIndicador[]): number | null {
  const ativados = contratos.filter((c) => c.data_ativacao !== null);
  if (ativados.length === 0) return null;
  const soma = ativados.reduce((acc, c) => acc + dias(c.data_venda, c.data_ativacao!), 0);
  return soma / ativados.length;
}
