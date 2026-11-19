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
    regra: "Duas contas, lado a lado. Conversão do CRM (5.14): convertidos ÷ tickets fechados no período. Conversão por safra, só do GRR: dos leads que chegaram no período e foram atendidos, quantos viraram venda; não conta venda lançada direto no SGP nem ticket repetido do mesmo lead. As duas deixam de fora os motivos fora da conversão.",
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
    regra: "As mesmas contas de vendas (5.1) e de conversão (do CRM e por safra), por agente.",
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

export type UnidadeIndicador = "numero" | "moeda" | "percentual";

export type DefinicaoIndicador = {
  /** a mesma chave do cartão do painel e da tabela grr.indicadores */
  chave: string;
  grupo: GrupoGrr;
  nome: string;
  unidade: UnidadeIndicador;
  polaridade: "maior_melhor" | "menor_melhor";
  /**
   * De onde vem a meta: "plataforma" = regra que já existe e não se configura
   * no GRR (meta de vendas cadastrada em Metas e comissão; limites do
   * Relatório da diretoria); "grr" = meta e faixa definidas na configuração.
   */
  metaOrigem: "plataforma" | "grr";
  /** a meta da empresa vale para unidade, equipe e agente? Taxas e médias, sim; volumes, não. */
  herdaMeta: boolean;
  /** para metaOrigem "plataforma": onde a regra é mantida */
  regraDaMeta?: string;
};

/** Indicadores do GRR Comercial. A conta de cada chave está em lib/grr/montar.ts, com as funções de lib/indicadores. */
export const INDICADORES_GRR: DefinicaoIndicador[] = [
  { chave: "vendas_semana", grupo: "vendas", nome: "Vendas da semana", unidade: "numero", polaridade: "maior_melhor", metaOrigem: "plataforma", herdaMeta: false, regraDaMeta: "Meta do mês cadastrada em Metas e comissão, pelos dias de expediente da semana." },
  { chave: "vendas_mes", grupo: "vendas", nome: "Vendas do mês", unidade: "numero", polaridade: "maior_melhor", metaOrigem: "plataforma", herdaMeta: false, regraDaMeta: "Meta do mês cadastrada em Metas e comissão." },
  { chave: "ativacoes_semana", grupo: "ativacoes", nome: "Ativações na semana", unidade: "numero", polaridade: "maior_melhor", metaOrigem: "grr", herdaMeta: false },
  { chave: "instalacoes_paradas", grupo: "ativacoes", nome: "Instalações paradas há mais de 7 dias", unidade: "numero", polaridade: "menor_melhor", metaOrigem: "plataforma", herdaMeta: false, regraDaMeta: "Limites do Relatório da diretoria: zero paradas; atenção até 5." },
  { chave: "assinatura_48h", grupo: "ativacoes", nome: "Sem assinar há 48h ou mais", unidade: "numero", polaridade: "menor_melhor", metaOrigem: "plataforma", herdaMeta: false, regraDaMeta: "Limites do Relatório da diretoria: zero acima de 48h; atenção até 3." },
  { chave: "conversao", grupo: "conversao", nome: "Conversão do CRM", unidade: "percentual", polaridade: "maior_melhor", metaOrigem: "grr", herdaMeta: true },
  { chave: "conversao_safra", grupo: "conversao", nome: "Conversão por safra de leads", unidade: "percentual", polaridade: "maior_melhor", metaOrigem: "grr", herdaMeta: true },
  { chave: "leads", grupo: "conversao", nome: "Leads recebidos", unidade: "numero", polaridade: "maior_melhor", metaOrigem: "grr", herdaMeta: false },
  { chave: "receita", grupo: "receita", nome: "Receita nova (mensalidades)", unidade: "moeda", polaridade: "maior_melhor", metaOrigem: "grr", herdaMeta: false },
  { chave: "ticket", grupo: "receita", nome: "Ticket médio", unidade: "moeda", polaridade: "maior_melhor", metaOrigem: "grr", herdaMeta: true },
  { chave: "agentes_com_venda", grupo: "produtividade", nome: "Agentes com venda na semana", unidade: "numero", polaridade: "maior_melhor", metaOrigem: "grr", herdaMeta: false },
  { chave: "perdidos", grupo: "perdas", nome: "Perdidos na semana", unidade: "numero", polaridade: "menor_melhor", metaOrigem: "grr", herdaMeta: false },
  { chave: "retornos", grupo: "perdas", nome: "Retornos vencidos", unidade: "numero", polaridade: "menor_melhor", metaOrigem: "grr", herdaMeta: false },
];

export const indicadorPorChave = (chave: string): DefinicaoIndicador | null => INDICADORES_GRR.find((i) => i.chave === chave) ?? null;

export const grupoPorChave = (chave: string): DefinicaoGrupo | null => GRUPOS_GRR.find((g) => g.chave === chave) ?? null;

/** as áreas previstas do módulo; as sem endereço mostram a etapa em que entram */
export const AREAS_GRR: { chave: string; rotulo: string; href: string | null; etapa: number }[] = [
  { chave: "resumo", rotulo: "Resumo executivo", href: "/grr", etapa: 1 },
  { chave: "reunioes", rotulo: "Reuniões", href: null, etapa: 4 },
  { chave: "acoes", rotulo: "Planos de ação", href: null, etapa: 3 },
  { chave: "rotinas", rotulo: "Rotinas das lideranças", href: null, etapa: 3 },
  { chave: "historico", rotulo: "Histórico", href: "/grr/historico", etapa: 2 },
];
