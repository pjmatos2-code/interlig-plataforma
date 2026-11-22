/**
 * GRR Técnico (Etapa 1, 21/11/2026): catálogo aprovado pela gestão em
 * 21/11/2026 (documento "GRR Técnico: indicadores, metas e faixas"). As metas
 * ficam em grr.metas com setor "tecnico"; a conta de cada chave está em
 * lib/grr/tecnico/regras.ts.
 */

export const SETOR_TECNICO = "tecnico";

export type GrupoTecnico = "instalacoes" | "prazos" | "qualidade" | "processo";

export const GRUPOS_TECNICO: { chave: GrupoTecnico; titulo: string; descricao: string }[] = [
  { chave: "instalacoes", titulo: "Instalações", descricao: "O que virou cliente ativo na semana: a estrela-guia do setor." },
  { chave: "prazos", titulo: "Prazos de atendimento", descricao: "Quanto do serviço foi feito dentro do prazo combinado." },
  { chave: "qualidade", titulo: "Qualidade", descricao: "Serviço bem feito não volta." },
  { chave: "processo", titulo: "Processo e disciplina", descricao: "O que trava a operação fora do campo, no fechamento da semana." },
];

export type IndicadorTecnico = {
  chave: string;
  grupo: GrupoTecnico;
  nome: string;
  unidade: "numero" | "percentual";
  polaridade: "maior_melhor" | "menor_melhor";
  /** a meta da empresa vale para as unidades? Taxas, sim; volumes e estoques, não. */
  herdaMeta: boolean;
  /** a meta cadastrada é do mês; a semana recebe a parte dos dias úteis (como as vendas do comercial) */
  metaMensal?: boolean;
  /** estoque medido no fechamento (segunda 07:00): semanas antigas sem foto não têm o número */
  estoque?: boolean;
  /** como se calcula, em uma frase (aparece no painel) */
  calculo: string;
};

export const INDICADORES_TECNICO: IndicadorTecnico[] = [
  {
    chave: "tec_instalacoes", grupo: "instalacoes", nome: "Instalações realizadas", unidade: "numero", polaridade: "maior_melhor", herdaMeta: false, metaMensal: true,
    calculo: "Contratos que passaram de inativo para ativo na semana. A meta cadastrada é do mês; a semana recebe a parte dos dias úteis.",
  },
  {
    chave: "tec_instalacao_48h", grupo: "prazos", nome: "Instalação em até 48 h", unidade: "percentual", polaridade: "maior_melhor", herdaMeta: true,
    calculo: "Das instalações ativadas na semana, quantas ficaram ativas até 48 h depois de a ocorrência ir para o gestor técnico.",
  },
  {
    chave: "tec_suporte_24h", grupo: "prazos", nome: "Suporte em até 24 h", unidade: "percentual", polaridade: "maior_melhor", herdaMeta: true,
    calculo: "Dos atendimentos de suporte feitos na semana, quantos tiveram o técnico no local (check-in) até 24 h depois da abertura da ocorrência. A baixa da OS no SGP não entra na conta.",
  },
  {
    chave: "tec_corporativo_4h", grupo: "prazos", nome: "Corporativo em até 4 h", unidade: "percentual", polaridade: "maior_melhor", herdaMeta: true,
    calculo: "Mesma conta do suporte (abertura até o técnico no local), para clientes CNPJ, plano ou POP corporativo, com prazo de 4 h.",
  },
  {
    chave: "tec_mudanca_24h", grupo: "prazos", nome: "Mudança de endereço em até 24 h do agendamento", unidade: "percentual", polaridade: "maior_melhor", herdaMeta: true,
    calculo: "Das mudanças de endereço feitas na semana, quantas tiveram o técnico no local (check-in) até 24 h depois da data agendada (sem agendamento, conta da abertura).",
  },
  {
    chave: "tec_retorno_7d", grupo: "qualidade", nome: "Retorno em 7 dias", unidade: "percentual", polaridade: "menor_melhor", herdaMeta: true,
    calculo: "Dos serviços feitos na semana anterior (instalação, mudança, suporte), quantos voltaram com nova OS de suporte do mesmo contrato em até 7 dias.",
  },
  {
    chave: "tec_agendamentos_vencidos", grupo: "processo", nome: "Agendamentos vencidos", unidade: "numero", polaridade: "menor_melhor", herdaMeta: false, estoque: true,
    calculo: "No fechamento: OS agendada para data que já passou, sem check-in do técnico (ocorrências dos últimos 30 dias).",
  },
  {
    chave: "tec_falta_validar", grupo: "processo", nome: "Falta validar há mais de 24 h", unidade: "numero", polaridade: "menor_melhor", herdaMeta: false, estoque: true,
    calculo: "No fechamento: serviço feito pelo técnico (OS encerrada, ou check-in e serviço prestado registrado) há mais de 24 h com a OS ou a ocorrência ainda aberta no SGP.",
  },
  {
    chave: "tec_os_para_baixar", grupo: "processo", nome: "OS de instalação para baixar", unidade: "numero", polaridade: "menor_melhor", herdaMeta: false, estoque: true,
    calculo: "No fechamento: contrato já em serviço com a OS de instalação ainda aberta no SGP.",
  },
];

export const indicadorTecnico = (chave: string): IndicadorTecnico | null => INDICADORES_TECNICO.find((i) => i.chave === chave) ?? null;

/** unidades do setor técnico, pelo nome do POP (o recorte usa o id do POP, como no comercial) */
export const UNIDADES_TECNICO = ["Altamira", "Vitória do Xingu", "Brasil Novo"] as const;
export type UnidadeTecnico = (typeof UNIDADES_TECNICO)[number];

/** "Altamira - Corporativo-PA", "Vitória do Xingu" … → unidade; null quando não reconhece */
export function unidadeDoPop(pop: string | null | undefined): UnidadeTecnico | null {
  const p = (pop ?? "").toLowerCase();
  if (p.startsWith("vit")) return "Vitória do Xingu";
  if (p.startsWith("brasil")) return "Brasil Novo";
  if (p.startsWith("altamira")) return "Altamira";
  return null;
}
