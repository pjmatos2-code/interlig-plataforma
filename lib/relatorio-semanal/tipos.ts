/**
 * Relatório Comercial Semanal da diretoria — o formato dos dados guardados.
 *
 * `DadosRelatorio` são só números, lidos do banco pela mesma conta das telas.
 * `TextosRelatorio` são os textos que o Claude escreve a partir desses
 * números. Os dois ficam congelados no relatório gerado: o relatório de uma
 * semana não muda depois de pronto.
 */

export type Status = "ok" | "atencao" | "critico" | "sem_meta";

export type ItemPlacar = {
  chave: string;
  grupo: "comercial" | "outras";
  status: Status;
  indicador: string;
  subtitulo: string;
  realizado: string;
  realizadoDetalhe: string;
  meta: string;
  metaDetalhe: string;
  dono: string;
};

export type VendaDia = { data: string; rotulo: string; vendas: number; expediente: boolean };

export type LinhaVendedor = {
  nome: string;
  praca: string | null;
  setor: string | null;
  vendasSemana: number;
  ticketSemana: number | null;
  semConsultaSemana: number;
  vendasMes: number;
  metaMes: number | null;
};

export type LinhaDistribuicao = { nome: string; semana: number; mes: number };

export type PendenteAssinatura = { contrato: string; vendedor: string | null; idadeDias: number };

export type FaixaDebito = { faixa: string; clientes: number; valor: number };

export type Leitura = {
  semana: { inicio: string; fim: string };
  mes: { mes: string; de: string; ate: string; nome: string; fechado: boolean };
  mesAnterior: { mes: string; nome: string };
  /** quando o banco foi lido (fotos do dia: base, esteira, fila) */
  lidoEm: string;
};

export type DadosRelatorio = {
  versao: 1;
  leitura: Leitura;
  vendas: {
    semana: number;
    semanaAnterior: number;
    porDia: VendaDia[];
    /** meta do mês ÷ dias de expediente do mês; null sem meta */
    metaDiaria: number | null;
    receitaSemana: number;
    ticketSemana: number | null;
    ticketSemanaAnterior: number | null;
    mes: number;
    receitaMes: number;
    ticketMes: number | null;
    metaMes: number | null;
    /** até o fim da semana, para mês aberto */
    diasExpedienteMes: number;
    diasExpedienteDecorridos: number;
    mesAnterior: number;
    receitaMesAnterior: number;
    porVendedor: LinhaVendedor[];
    semVendedorSemana: number;
    semVendedorMes: number;
    /** contratos da semana sem vendedor (para conferir) */
    semVendedorContratos: string[];
    /**
     * Prefeitura e rede neutra: o Dashboard conta, mas não são vendas do time
     * comercial (decisão do Paulo, 24/10/2026) — ficam fora e aparecem aqui
     */
    fora: { semana: { contrato: string; tipo: string; valor: number }[]; mes: number; receitaMes: number; mesPorTipo: Record<string, number> };
    porPraca: LinhaDistribuicao[];
    mix: LinhaDistribuicao[];
    origem: LinhaDistribuicao[];
  };
  consulta: {
    vendasSemana: number;
    semConsultaSemana: number;
    semConsultaMes: number;
  };
  assinatura: {
    /** vendas da semana ainda sem assinatura */
    pendentesSemana: PendenteAssinatura[];
    acima48hSemana: number;
    /** vendas de antes da semana ainda sem assinatura */
    antigasSemAssinar: number;
  };
  esteira: {
    ativacoesSemana: number;
    cancelamentosSemana: number;
    /** média de dias da venda à ativação das ativadas na semana */
    diasVendaAtivacao: number | null;
    aguardandoSemana: number;
    paradasMais7Dias: number;
    antigasAguardando: number;
  };
  base: {
    ativos: number;
    /** suspensos por débito: saem dos ativos e voltam ao pagar */
    suspensos: number;
    porPraca: { nome: string; ativos: number; suspensos: number }[];
    /** a foto do último mês fechado (crescimento do SGP) */
    fechamento: { mes: string; ativos: number; suspensos: number } | null;
    meta: number;
    prazo: string;
    diasRestantes: number;
    faltam: number;
    /** ativos na leitura do relatório anterior (null no primeiro) */
    ativosAnterior: number | null;
    porPracaAnterior: { nome: string; ativos: number }[] | null;
  };
  debito: {
    clientes: number;
    emRisco: number;
    emAberto: number;
    boletos: number;
    contatados7d: number;
    faixas: FaixaDebito[];
    anterior: { clientes: number; emRisco: number; faixas: FaixaDebito[] } | null;
  };
  refidelizacao: { nome: string; semana: number; mes: number; receitaSemana: number; receitaMes: number }[];
  /** inconsistências encontradas nos dados (viram "Para conferir") */
  conferir: string[];
  placar: ItemPlacar[];
};

export type ItemInsight = { destaque: string; texto: string };

export type BlocoCobranca = {
  cobrarDe: string;
  oQueCobrar: string[];
  perguntaChave: string;
  cadencia: string;
  sinalDeMelhora: string;
};

export type TextosRelatorio = {
  veredito: string;
  insights: { neutra: ItemInsight[]; advogado: ItemInsight[]; estrategica: ItemInsight[] };
  cobranca: { base: BlocoCobranca; esteira: BlocoCobranca; retencao: BlocoCobranca };
  perguntasSemana: { pergunta: string; contexto: string }[];
  sugestoesChecklist: string[];
  email: { melhor: string; pior: string; base: string; criticos: string; decidir: string };
};

/** o que se digita na reunião (salvo no relatório) */
export type Reuniao = Record<string, string>;
