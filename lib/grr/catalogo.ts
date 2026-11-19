/**
 * Catálogo do GRR Comercial (Etapa 1): os grupos de indicadores do resumo
 * executivo, a regra oficial que cada um usa e a etapa em que entra. Na
 * Etapa 2 o catálogo passa para o banco, com metas e faixas por indicador.
 */

export type GrupoGrr = "vendas" | "ativacoes" | "conversao" | "receita" | "produtividade" | "perdas" | "inadimplencia" | "churn";

export type DefinicaoGrupo = {
  chave: GrupoGrr;
  titulo: string;
  /** o que o grupo responde, em uma frase */
  descricao: string;
  /** de onde vem a conta (regra oficial) */
  regra: string;
  /** etapa do projeto em que o grupo entra no painel */
  etapa: 1 | 5;
};

export const GRUPOS_GRR: DefinicaoGrupo[] = [
  {
    chave: "vendas",
    titulo: "Vendas e metas",
    descricao: "Quanto foi vendido contra a meta, na semana e no mês.",
    regra: "Vendas pela regra 5.1, sem Prefeitura e rede neutra (régua do Relatório da diretoria). Meta do mês cadastrada em Metas e comissão; a meta da semana segue os dias de expediente.",
    etapa: 1,
  },
  {
    chave: "ativacoes",
    titulo: "Ativações",
    descricao: "O que virou instalação, o que espera assinatura e o que espera o técnico.",
    regra: "Pendências de assinatura (5.8) e de ativação (5.7 com as OS abertas do SGP), instalação em até 15 dias (5.9) e prazo da venda à ativação.",
    etapa: 1,
  },
  {
    chave: "conversao",
    titulo: "Conversão comercial",
    descricao: "Dos atendimentos que fecharam, quantos viraram venda.",
    regra: "Conversão real do CRM (5.14): convertidos ÷ tickets fechados no período, sem os motivos fora da conversão.",
    etapa: 1,
  },
  {
    chave: "receita",
    titulo: "Ticket médio e receita",
    descricao: "Quanto de mensalidade nova entrou e o valor médio por contrato.",
    regra: "Receita contratada (5.2) e ticket médio (5.3) das vendas do período.",
    etapa: 1,
  },
  {
    chave: "produtividade",
    titulo: "Produtividade dos agentes",
    descricao: "Leads, vendas e conversão de cada agente, lado a lado.",
    regra: "As mesmas contas de vendas (5.1) e de conversão (5.14), por agente.",
    etapa: 1,
  },
  {
    chave: "perdas",
    titulo: "Motivos de perda e follow-up",
    descricao: "Por que as negociações não fecharam e o que ainda está em aberto.",
    regra: "Perdidos e motivos do CRM, sem os motivos fora da conversão; retornos pelo agendamento do ticket; primeira resposta pela regra 5.15.",
    etapa: 1,
  },
  {
    chave: "inadimplencia",
    titulo: "Inadimplência da primeira fatura",
    descricao: "Clientes de cada safra que não pagaram a primeira fatura.",
    regra: "Regra 5.11 (já existe e está testada). Entra na Etapa 5, depois da decisão sobre a régua gerencial.",
    etapa: 5,
  },
  {
    chave: "churn",
    titulo: "Churn precoce",
    descricao: "Cancelamentos em até 90 dias da ativação, por safra.",
    regra: "Regra 5.10 (já existe e está testada). Entra na Etapa 5.",
    etapa: 5,
  },
];

export const grupoPorChave = (chave: string): DefinicaoGrupo | null => GRUPOS_GRR.find((g) => g.chave === chave) ?? null;

/** as áreas previstas do módulo; só o Resumo executivo está ativo na Etapa 1 */
export const AREAS_GRR: { chave: string; rotulo: string; href: string | null; etapa: number }[] = [
  { chave: "resumo", rotulo: "Resumo executivo", href: "/grr", etapa: 1 },
  { chave: "reunioes", rotulo: "Reuniões", href: null, etapa: 4 },
  { chave: "acoes", rotulo: "Planos de ação", href: null, etapa: 3 },
  { chave: "rotinas", rotulo: "Rotinas das lideranças", href: null, etapa: 3 },
  { chave: "historico", rotulo: "Histórico e relatórios", href: null, etapa: 2 },
];
