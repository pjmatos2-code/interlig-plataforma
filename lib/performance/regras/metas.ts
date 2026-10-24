/**
 * Metas comerciais da Performance (PRD 16, 24/10/2026) — puro, testado em
 * metas.test.ts. A meta MENSAL de vendas continua na tabela metas (a mesma
 * do dashboard e da comissão); aqui ficam os tipos extras, a janela de cada
 * periodicidade e a projeção de fechamento — que é sempre ESTIMATIVA.
 */
export type TipoMeta =
  | "vendas"
  | "ativacoes"
  | "conversao"
  | "leads_trabalhados"
  | "followups"
  | "tempo_resposta"
  | "receita_nova"
  | "ticket_medio"
  | "qualidade_atendimento"
  | "esforco"
  | "ipc";

export type UnidadeMeta = "qtd" | "pct" | "min" | "brl" | "pontos";

export type InfoTipoMeta = {
  rotulo: string;
  unidade: UnidadeMeta;
  /** soma entre vendedores e cresce com o tempo (projetável) */
  aditiva: boolean;
  menorEhMelhor?: boolean;
  ajuda: string;
};

export const TIPOS_META: Record<TipoMeta, InfoTipoMeta> = {
  vendas: { rotulo: "Vendas", unidade: "qtd", aditiva: true, ajuda: "vendas contáveis pela data da venda (mesma regra do dashboard)" },
  ativacoes: { rotulo: "Ativações", unidade: "qtd", aditiva: true, ajuda: "contratos ativados no período" },
  conversao: { rotulo: "Conversão", unidade: "pct", aditiva: false, ajuda: "leads convertidos ÷ leads fechados no período, em %" },
  leads_trabalhados: { rotulo: "Leads trabalhados", unidade: "qtd", aditiva: true, ajuda: "leads distintos com ação humana no período" },
  followups: { rotulo: "Follow-ups realizados", unidade: "qtd", aditiva: true, ajuda: "retornos concluídos no período" },
  tempo_resposta: { rotulo: "Tempo de 1ª resposta", unidade: "min", aditiva: false, menorEhMelhor: true, ajuda: "mediana no expediente, em minutos — menor é melhor" },
  receita_nova: { rotulo: "Receita recorrente nova", unidade: "brl", aditiva: true, ajuda: "soma das mensalidades vendidas, em R$" },
  ticket_medio: { rotulo: "Ticket médio", unidade: "brl", aditiva: false, ajuda: "receita nova ÷ vendas, em R$" },
  qualidade_atendimento: { rotulo: "Qualidade do atendimento", unidade: "pontos", aditiva: false, ajuda: "nota média das conversas analisadas (0–100)" },
  esforco: { rotulo: "Score de esforço", unidade: "pontos", aditiva: false, ajuda: "0–100" },
  ipc: { rotulo: "IPC", unidade: "pontos", aditiva: false, ajuda: "0–100" },
};

export const ROTULO_ESCOPO_META = { global: "Todos", unidade: "Unidade", equipe: "Equipe", funcao: "Função", vendedor: "Vendedor" } as const;
export const ROTULO_PERIODICIDADE = { dia: "Diária", semana: "Semanal", mes: "Mensal" } as const;
export type EscopoMeta = keyof typeof ROTULO_ESCOPO_META;
export type Periodicidade = keyof typeof ROTULO_PERIODICIDADE;

const soma = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const menor = (a: string, b: string) => (a < b ? a : b);
const maior = (a: string, b: string) => (a > b ? a : b);

/** segunda-feira da semana do dia */
export function inicioDaSemana(dia: string): string {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return soma(dia, -((dow + 6) % 7));
}

export function fimDoMes(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export type JanelaMeta = {
  situacao: "vigente" | "futura" | "encerrada";
  /** ciclo apurado, recortado pela vigência */
  de: string;
  /** último dia apurado (≤ referência) */
  ate: string;
  /** último dia do ciclo */
  fimCiclo: string;
};

/**
 * Ciclo da meta que contém o dia de referência (dia, semana seg–dom ou mês),
 * recortado pela vigência. Meta já encerrada mostra o último ciclo dela.
 */
export function janelaDaMeta(m: { periodicidade: Periodicidade; inicio: string; fim: string }, ref: string): JanelaMeta {
  const situacao = ref < m.inicio ? "futura" : ref > m.fim ? "encerrada" : "vigente";
  const dia = situacao === "futura" ? m.inicio : situacao === "encerrada" ? m.fim : ref;
  const [ini, fim] =
    m.periodicidade === "dia" ? [dia, dia] : m.periodicidade === "semana" ? [inicioDaSemana(dia), soma(inicioDaSemana(dia), 6)] : [`${dia.slice(0, 7)}-01`, fimDoMes(dia)];
  const de = maior(ini, m.inicio);
  const fimCiclo = menor(fim, m.fim);
  return { situacao, de, ate: situacao === "futura" ? de : menor(dia, fimCiclo), fimCiclo };
}

/** dias úteis (calendário da empresa) do intervalo, sem os dias indisponíveis do vendedor */
export function contarDiasUteis(de: string, ate: string, ehDiaUtil: (d: string) => boolean, indisponivel: (d: string) => boolean = () => false): number {
  let n = 0;
  for (let d = de; d <= ate; d = soma(d, 1)) if (ehDiaUtil(d) && !indisponivel(d)) n++;
  return n;
}

/** mínimo de dias úteis encerrados para projetar (antes disso o ritmo é ruído) */
export const DIAS_MINIMOS_PROJECAO = 3;

/**
 * Projeção linear de fechamento (ESTIMATIVA): ritmo dos dias úteis já
 * encerrados aplicado aos dias úteis disponíveis que faltam DEPOIS do dia de
 * referência. O dia em andamento entra no realizado, mas não no ritmo nem na
 * extrapolação — a estimativa fica conservadora de manhã.
 */
export function projetarFechamento(p: { realizado: number; realizadoEncerrado: number; diasEncerrados: number; diasRestantesDepois: number }): number | null {
  if (p.diasEncerrados < DIAS_MINIMOS_PROJECAO) return null;
  const ritmo = p.realizadoEncerrado / p.diasEncerrados;
  return Math.round((p.realizado + ritmo * p.diasRestantesDepois) * 10) / 10;
}

export type SituacaoMeta = "atingida" | "no_ritmo" | "abaixo_do_ritmo" | "nao_atingida" | "sem_projecao" | "abaixo" | "futura" | "sem_dados" | "parcial";

export const ROTULO_SITUACAO_META: Record<SituacaoMeta, string> = {
  atingida: "Atingida",
  no_ritmo: "No ritmo",
  abaixo_do_ritmo: "Abaixo do ritmo",
  nao_atingida: "Não atingida",
  sem_projecao: "Cedo para projetar",
  abaixo: "Abaixo da meta",
  futura: "Ainda não começou",
  sem_dados: "Sem dados",
  parcial: "Alvo maior que o seu escopo",
};

/**
 * Cumprimento e situação. Metas de taxa/nota (não aditivas) não têm projeção:
 * comparam o valor atual com a meta. "menor é melhor" (tempo de resposta)
 * inverte a comparação.
 */
export function avaliarMeta(p: {
  meta: number;
  realizado: number | null;
  projecao: number | null;
  aditiva: boolean;
  menorEhMelhor?: boolean;
  cicloEncerrado: boolean;
  futura?: boolean;
  diasRestantes: number;
}): { pct: number | null; situacao: SituacaoMeta; necessarioPorDia: number | null } {
  if (p.futura) return { pct: null, situacao: "futura", necessarioPorDia: null };
  if (p.realizado === null || p.meta <= 0) return { pct: null, situacao: "sem_dados", necessarioPorDia: null };
  const pct = p.menorEhMelhor ? (p.realizado > 0 ? p.meta / p.realizado : 1) : p.realizado / p.meta;
  const bate = p.menorEhMelhor ? p.realizado <= p.meta : p.realizado >= p.meta;
  if (bate) return { pct, situacao: "atingida", necessarioPorDia: null };
  if (!p.aditiva) return { pct, situacao: p.cicloEncerrado ? "nao_atingida" : "abaixo", necessarioPorDia: null };
  if (p.cicloEncerrado) return { pct, situacao: "nao_atingida", necessarioPorDia: null };
  const necessarioPorDia = p.diasRestantes > 0 ? Math.round(((p.meta - p.realizado) / p.diasRestantes) * 10) / 10 : null;
  if (p.projecao === null) return { pct, situacao: "sem_projecao", necessarioPorDia };
  return { pct, situacao: p.projecao >= p.meta ? "no_ritmo" : "abaixo_do_ritmo", necessarioPorDia };
}

/** vendedor alcançado pela meta (escopo + referência) */
export function membroDaMeta(m: { escopo: EscopoMeta; referencia: string | null }, v: { id: string; pop_id: string | null; coordenador_id: string | null; setor: string | null }): boolean {
  switch (m.escopo) {
    case "global":
      return true;
    case "unidade":
      return v.pop_id === m.referencia;
    case "equipe":
      return v.coordenador_id === m.referencia;
    case "funcao":
      return v.setor === m.referencia;
    case "vendedor":
      return v.id === m.referencia;
  }
}

/** valor digitado na tela ↔ valor comparável ao indicador (pct guarda 0–100) */
export function valorMetaParaComparar(tipo: TipoMeta, valor: number): number {
  return TIPOS_META[tipo].unidade === "pct" ? valor / 100 : valor;
}
