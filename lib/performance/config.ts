/**
 * Performance Comercial — configuração (24/10/2026).
 *
 * Padrões documentados aqui; o gestor altera em Performance → Configurações
 * (gravado em config_comercial, chave "performance", com trilha de
 * auditoria). O que vier salvo é MESCLADO sobre os padrões e saneado —
 * chave desconhecida é ignorada, número fora da faixa volta ao padrão.
 * Arquivo puro (sem server-only): testado em config.test.ts.
 */

export type Faixa = { piso: number; alvo: number };

export type PesosEsforco = {
  leads_atendidos: number;
  sla_primeira_resposta: number;
  followups_prazo: number;
  sem_atraso: number;
  conversas_trabalhadas: number;
  propostas: number;
  recuperacao: number;
  disciplina_crm: number;
};
export type PesosResultado = { meta_vendas: number; conversao: number; receita_nova: number };
export type PesosQualidade = { qualidade_vendas: number; qualidade_atendimento: number };
export type PesosIpc = { esforco: number; resultado: number; qualidade: number };

/** expediente por dia da semana ("0" = domingo … "6" = sábado), horário de Santarém */
export type Expediente = Record<string, [string, string][]>;

export type ConfigPerformance = {
  versao: number;
  modulo_ativo: boolean;
  pesos: { esforco: PesosEsforco; resultado: PesosResultado; qualidade: PesosQualidade; ipc: PesosIpc };
  /** regras distintas por função (setor do vendedor): sobrescrevem os pesos gerais */
  pesos_por_setor: Record<string, Partial<{ esforco: Partial<PesosEsforco>; resultado: Partial<PesosResultado>; qualidade: Partial<PesosQualidade>; ipc: Partial<PesosIpc> }>>;
  /** normalização 0–100: no piso vale 0, no alvo (ou acima) vale 100, linear no meio */
  faixas: {
    leads_atendidos: Faixa;
    sla_primeira_resposta: Faixa;
    followups_prazo: Faixa;
    conversas_trabalhadas: Faixa;
    propostas: Faixa;
    recuperacao: Faixa;
    disciplina_crm: Faixa;
    conversao: Faixa;
    /** fração dos leads abertos sem retorno que zera o item "sem atraso" */
    sem_atraso_limite: number;
  };
  sla: {
    /** 1ª resposta humana, em minutos de expediente */
    primeira_resposta_min: number;
    /** lead aberto sem ação humana há mais que isto (horas de expediente) = "sem retorno" */
    sem_retorno_horas: number;
  };
  expediente: Expediente;
  volume_minimo: { leads: number; conversas: number; fechados: number; vendas_maduras: number; analises_ia: number; propostas_equipe: number; followups: number; recuperacao: number };
  /** dias após a admissão em que o vendedor fica "em rampa" (fora da comparação) */
  rampa_dias: number;
  /** recém-contratado em rampa entra no ranking? */
  rampa_no_ranking: boolean;
  followup: {
    /** concluído até o fim do dia do prazo conta "no prazo" */
    tolerancia: "fim_do_dia" | "horario_exato";
    /** lembretes automáticos do robô (retorno "amanhã 09:00") entram na taxa de execução? */
    incluir_automaticos: boolean;
    /** ação humana até X minutos depois de agendar não conta como execução (é a mesma conversa) */
    carencia_min: number;
  };
  lead_quente: {
    usar_ia: boolean;
    usar_urgencia_alta: boolean;
    /** cliente quente esperando há mais que isto (min de expediente) = alerta crítico */
    minutos_sem_resposta: number;
  };
  qualidade: {
    maturidade_dias: number;
    cancel_antes_instalacao: { alvo: number; maximo: number };
    cancel_30: { alvo: number; maximo: number };
    churn_90: { alvo: number; maximo: number };
    inad_1a: { alvo: number; maximo: number };
  };
  alertas: {
    notificar_criticos: boolean;
    max_notificacoes_dia: number;
    followups_acumulados: number;
    /** conversão abaixo desta fração do alvo = atenção */
    conversao_abaixo: number;
    /** leads trabalhados/dia nos últimos 7 dias úteis abaixo desta fração da média de 30 = queda */
    queda_produtividade: number;
    disciplina_minima: number;
  };
  ia: {
    habilitada: boolean;
    provedor: "anthropic";
    /** vazio = usa o modelo configurado em Integrações (Anthropic) */
    modelo: string;
    limite_diario: number;
    custo_max_mensal_usd: number;
    retencao_texto_dias: number;
    min_msgs_cliente: number;
  };
  coleta: { habilitada: boolean; dias_retroativos: number };
};

export const VERSAO_REGRAS = "pc-1.0";

export const CONFIG_PADRAO: ConfigPerformance = {
  versao: 1,
  modulo_ativo: true,
  pesos: {
    esforco: {
      leads_atendidos: 10,
      sla_primeira_resposta: 10,
      followups_prazo: 20,
      sem_atraso: 15,
      conversas_trabalhadas: 10,
      propostas: 15,
      recuperacao: 10,
      disciplina_crm: 10,
    },
    resultado: { meta_vendas: 60, conversao: 40, receita_nova: 0 },
    qualidade: { qualidade_vendas: 70, qualidade_atendimento: 30 },
    ipc: { esforco: 35, resultado: 40, qualidade: 25 },
  },
  pesos_por_setor: {},
  faixas: {
    leads_atendidos: { piso: 0.5, alvo: 0.95 },
    sla_primeira_resposta: { piso: 0.5, alvo: 0.9 },
    followups_prazo: { piso: 0.3, alvo: 0.9 },
    conversas_trabalhadas: { piso: 0.6, alvo: 0.95 },
    propostas: { piso: 0, alvo: 0.5 },
    recuperacao: { piso: 0, alvo: 0.1 },
    disciplina_crm: { piso: 0.5, alvo: 0.95 },
    conversao: { piso: 0.1, alvo: 0.45 },
    sem_atraso_limite: 0.2,
  },
  sla: { primeira_resposta_min: 15, sem_retorno_horas: 24 },
  expediente: {
    "0": [],
    "1": [["08:00", "18:00"]],
    "2": [["08:00", "18:00"]],
    "3": [["08:00", "18:00"]],
    "4": [["08:00", "18:00"]],
    "5": [["08:00", "18:00"]],
    "6": [["08:00", "12:00"]],
  },
  volume_minimo: { leads: 5, conversas: 5, fechados: 5, vendas_maduras: 8, analises_ia: 5, propostas_equipe: 10, followups: 3, recuperacao: 3 },
  rampa_dias: 30,
  rampa_no_ranking: false,
  followup: { tolerancia: "fim_do_dia", incluir_automaticos: false, carencia_min: 5 },
  lead_quente: { usar_ia: true, usar_urgencia_alta: true, minutos_sem_resposta: 30 },
  qualidade: {
    maturidade_dias: 30,
    cancel_antes_instalacao: { alvo: 0.05, maximo: 0.25 },
    cancel_30: { alvo: 0.03, maximo: 0.15 },
    churn_90: { alvo: 0.03, maximo: 0.15 },
    inad_1a: { alvo: 0.05, maximo: 0.25 },
  },
  alertas: {
    notificar_criticos: true,
    max_notificacoes_dia: 20,
    followups_acumulados: 5,
    conversao_abaixo: 0.7,
    queda_produtividade: 0.6,
    disciplina_minima: 0.6,
  },
  ia: {
    habilitada: false,
    provedor: "anthropic",
    modelo: "",
    limite_diario: 150,
    custo_max_mensal_usd: 20,
    retencao_texto_dias: 180,
    min_msgs_cliente: 2,
  },
  coleta: { habilitada: true, dias_retroativos: 2 },
};

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Mescla o que foi salvo sobre o padrão, campo a campo, respeitando o tipo
 * do padrão. Números negativos ou não finitos são descartados; frações
 * (faixas, limites) ficam em [0, 1]; pesos em [0, 100]. Expediente só aceita
 * "HH:MM" com início < fim.
 */
export function mesclarConfig(salvo: unknown, padrao: ConfigPerformance = CONFIG_PADRAO): ConfigPerformance {
  const saida = structuredClone(padrao) as unknown as Record<string, unknown>;
  if (!ehObj(salvo)) return saida as unknown as ConfigPerformance;

  const mesclar = (alvo: Record<string, unknown>, origem: Record<string, unknown>, caminho: string) => {
    for (const [k, vPadrao] of Object.entries(alvo)) {
      if (!(k in origem)) continue;
      const v = origem[k];
      const aqui = caminho ? `${caminho}.${k}` : k;
      if (aqui === "expediente" || aqui === "pesos_por_setor") continue; // tratados à parte
      if (typeof vPadrao === "number") {
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
        if (aqui.startsWith("pesos.")) alvo[k] = Math.min(100, v);
        else if (aqui.startsWith("faixas.") || /\.(alvo|maximo|piso)$/.test(aqui) || aqui.startsWith("alertas.conversao_abaixo") || aqui.startsWith("alertas.queda_produtividade") || aqui.startsWith("alertas.disciplina_minima"))
          alvo[k] = Math.min(1, v);
        else alvo[k] = v;
      } else if (typeof vPadrao === "boolean") {
        if (typeof v === "boolean") alvo[k] = v;
      } else if (typeof vPadrao === "string") {
        if (typeof v === "string" && v.length <= 120) {
          if (aqui === "followup.tolerancia" && v !== "fim_do_dia" && v !== "horario_exato") continue;
          if (aqui === "ia.provedor" && v !== "anthropic") continue;
          alvo[k] = v;
        }
      } else if (ehObj(vPadrao) && ehObj(v)) {
        mesclar(vPadrao, v, aqui);
      }
    }
  };
  mesclar(saida, salvo, "");

  // faixas: piso tem de ficar abaixo do alvo
  const faixas = saida.faixas as Record<string, unknown>;
  for (const [k, f] of Object.entries(faixas)) {
    if (ehObj(f) && typeof f.piso === "number" && typeof f.alvo === "number" && f.piso >= f.alvo) {
      faixas[k] = structuredClone((padrao.faixas as unknown as Record<string, unknown>)[k]);
    }
  }

  // expediente: substitui o dia inteiro quando válido
  if (ehObj(salvo.expediente)) {
    const exp = saida.expediente as Expediente;
    for (const dia of ["0", "1", "2", "3", "4", "5", "6"]) {
      const v = (salvo.expediente as Record<string, unknown>)[dia];
      if (!Array.isArray(v)) continue;
      const turnos = v.filter(
        (t): t is [string, string] =>
          Array.isArray(t) && t.length === 2 && HORA.test(String(t[0])) && HORA.test(String(t[1])) && String(t[0]) < String(t[1])
      );
      if (turnos.length === v.length) exp[dia] = turnos.slice(0, 3);
    }
  }

  // pesos por setor: só chaves de peso conhecidas, números válidos
  if (ehObj(salvo.pesos_por_setor)) {
    const porSetor: ConfigPerformance["pesos_por_setor"] = {};
    for (const [setor, grupos] of Object.entries(salvo.pesos_por_setor)) {
      if (!/^[a-z_]{2,40}$/.test(setor) || !ehObj(grupos)) continue;
      const limpo: Record<string, Record<string, number>> = {};
      for (const g of ["esforco", "resultado", "qualidade", "ipc"] as const) {
        const origem = grupos[g];
        if (!ehObj(origem)) continue;
        const chaves = Object.keys(padrao.pesos[g]);
        const itens = Object.entries(origem).filter(
          ([k, v]) => chaves.includes(k) && typeof v === "number" && Number.isFinite(v) && v >= 0
        );
        if (itens.length) limpo[g] = Object.fromEntries(itens.map(([k, v]) => [k, Math.min(100, v as number)]));
      }
      if (Object.keys(limpo).length) porSetor[setor] = limpo;
    }
    saida.pesos_por_setor = porSetor;
  }

  return saida as unknown as ConfigPerformance;
}

/** pesos efetivos de um setor (função): gerais + sobrescrita do setor */
export function pesosDoSetor(cfg: ConfigPerformance, setor: string | null | undefined): ConfigPerformance["pesos"] {
  const extra = setor ? cfg.pesos_por_setor[setor] : undefined;
  return {
    esforco: { ...cfg.pesos.esforco, ...(extra?.esforco ?? {}) },
    resultado: { ...cfg.pesos.resultado, ...(extra?.resultado ?? {}) },
    qualidade: { ...cfg.pesos.qualidade, ...(extra?.qualidade ?? {}) },
    ipc: { ...cfg.pesos.ipc, ...(extra?.ipc ?? {}) },
  };
}
