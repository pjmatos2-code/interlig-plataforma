/**
 * Rotinas das lideranças (GRR): o roteiro semanal de cada líder, conferido
 * pela própria plataforma a partir dos dados (ninguém marca nada).
 *
 * Coordenação, toda semana:
 *  1. todo dia, os leads do dia atendidos no mesmo dia;
 *  2. nenhum follow-up vencido (medido só na semana atual: o sistema não
 *     guarda o estoque de dias passados);
 *  3. até sexta, diagnóstico para cada indicador da equipe em atenção ou crítico;
 *  4. sábado, reunião de equipe feita e encerrada, com compromissos;
 *  5. planos de ação atualizados na semana e nenhum atrasado.
 * Diretoria, toda semana:
 *  6. segunda, reunião de resultados feita e encerrada, com decisões na ata;
 *  7. planos aguardando aprovação decididos em até 2 dias;
 *  8. planos aguardando validação conferidos em até 2 dias.
 */

/**
 * A rotina vale a partir da semana de 23/11/2026, a primeira semana inteira
 * com diagnósticos, planos e reuniões no GRR. Antes dela, só o atendimento
 * dos leads é avaliado (os outros itens dependem de ferramentas que não
 * existiam).
 */
export const INICIO_ROTINAS = "2026-11-23";
const ANTES = "A rotina vale a partir da semana de 23/11/2026.";

export type StatusRotina = "cumprido" | "parcial" | "nao_cumprido" | "no_prazo" | "nao_se_aplica" | "nao_medido";
export type ItemRotina = { chave: string; titulo: string; quando: string; status: StatusRotina; detalhe: string };
export type RotinaLider = { liderId: string; nome: string; papel: "coordenacao" | "diretoria"; itens: ItemRotina[]; cumpridos: number; avaliados: number };

export const ROTULO_STATUS_ROTINA: Record<StatusRotina, string> = {
  cumprido: "Cumprido",
  parcial: "Parcial",
  nao_cumprido: "Não cumprido",
  no_prazo: "No prazo",
  nao_se_aplica: "Não se aplica",
  nao_medido: "Não medido",
};

const DOIS_DIAS = 2 * 24 * 3600_000;
const diaSantarem = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);
const somar = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const n = (v: number) => v.toLocaleString("pt-BR");

export type SemanaRotina = { inicio: string; fim: string };
/** fim do dia em Santarém, em ISO (UTC) */
export const fimDoDia = (dia: string) => new Date(Date.parse(`${dia}T23:59:59.999-03:00`)).toISOString();

export function resumir(itens: ItemRotina[]): { cumpridos: number; avaliados: number } {
  const avaliados = itens.filter((i) => i.status === "cumprido" || i.status === "parcial" || i.status === "nao_cumprido");
  return { cumpridos: avaliados.filter((i) => i.status === "cumprido").length, avaliados: avaliados.length };
}

// ---------------------------------------------------------------------------
// coordenação
// ---------------------------------------------------------------------------

export type EntradaCoordenacao = {
  semana: SemanaRotina;
  /** agora (ISO) */
  agora: string;
  /** leads da equipe que chegaram na semana (sem venda lançada direto no SGP e sem os fora da conversão) */
  leads: { criado_em: string; primeira_tratativa_em: string | null }[];
  /** follow-ups vencidos agora (null fora da semana atual) */
  followupsVencidosAgora: number | null;
  /** indicadores da equipe em atenção ou crítico na semana (null: sem como medir) */
  desvios: { chave: string; rotulo: string }[] | null;
  /** diagnósticos da semana para a equipe ou agentes dela */
  diagnosticos: { indicador: string; criado_em: string }[];
  /** reunião de equipe do período */
  reuniao: { situacao: "aberta" | "encerrada"; data: string; compromissos: number } | null;
  /** planos aprovados da equipe que estavam em execução na semana */
  planos: { descricao: string; prazo: string | null; situacaoNoFim: string; atualizadoNaSemana: boolean }[];
};

export function avaliarCoordenacao(e: EntradaCoordenacao): ItemRotina[] {
  const itens = avaliarCoordenacaoNaRegra(e);
  if (e.semana.inicio >= INICIO_ROTINAS) return itens;
  return itens.map((i) => (i.chave === "leads_mesmo_dia" || i.chave === "followups" ? i : { ...i, status: "nao_se_aplica" as const, detalhe: ANTES }));
}

function avaliarCoordenacaoNaRegra(e: EntradaCoordenacao): ItemRotina[] {
  const hoje = diaSantarem(e.agora);
  const emAndamento = e.semana.fim >= hoje;
  const itens: ItemRotina[] = [];

  // 1. leads do dia atendidos no mesmo dia (o dia de hoje ainda não fechou)
  const porDia = new Map<string, { total: number; semAtender: number }>();
  for (const l of e.leads) {
    const dia = diaSantarem(l.criado_em);
    if (dia < e.semana.inicio || dia > e.semana.fim || dia >= hoje) continue;
    const x = porDia.get(dia) ?? { total: 0, semAtender: 0 };
    x.total++;
    if (!l.primeira_tratativa_em || diaSantarem(l.primeira_tratativa_em) !== dia) x.semAtender++;
    porDia.set(dia, x);
  }
  const falhas = [...porDia.entries()].filter(([, x]) => x.semAtender > 0).sort(([a], [b]) => a.localeCompare(b));
  const totalLeads = [...porDia.values()].reduce((t, x) => t + x.total, 0);
  const semAtender = falhas.reduce((t, [, x]) => t + x.semAtender, 0);
  itens.push({
    chave: "leads_mesmo_dia",
    titulo: "Leads atendidos no mesmo dia",
    quando: "todo dia",
    status: totalLeads === 0 ? (emAndamento ? "no_prazo" : "nao_se_aplica") : falhas.length === 0 ? "cumprido" : semAtender / totalLeads <= 0.1 ? "parcial" : "nao_cumprido",
    detalhe:
      totalLeads === 0
        ? "Nenhum dia fechado com lead na semana."
        : falhas.length === 0
          ? `${n(totalLeads)} leads, todos com primeiro atendimento no dia em que chegaram.`
          : `${n(semAtender)} de ${n(totalLeads)} leads sem atendimento no mesmo dia: ${falhas.map(([d, x]) => `${dm(d)} (${x.semAtender})`).join(", ")}.`,
  });

  // 2. follow-ups vencidos (só agora)
  itens.push(
    e.followupsVencidosAgora == null
      ? { chave: "followups", titulo: "Nenhum follow-up vencido", quando: "todo dia", status: "nao_medido", detalhe: "Medido só na semana atual: o estoque de follow-ups de dias passados não fica guardado." }
      : {
          chave: "followups",
          titulo: "Nenhum follow-up vencido",
          quando: "todo dia",
          status: e.followupsVencidosAgora === 0 ? "cumprido" : "nao_cumprido",
          detalhe: e.followupsVencidosAgora === 0 ? "Nenhum retorno vencido agora." : `${n(e.followupsVencidosAgora)} retornos vencidos agora.`,
        }
  );

  // 3. diagnósticos até sexta
  const sexta = somar(e.semana.inicio, 4);
  const prazoDiag = fimDoDia(sexta);
  if (e.desvios == null) {
    itens.push({ chave: "diagnosticos", titulo: "Diagnóstico dos desvios", quando: `até sexta (${dm(sexta)})`, status: "nao_medido", detalhe: "Semana sem números guardados para a equipe." });
  } else if (e.desvios.length === 0) {
    itens.push({ chave: "diagnosticos", titulo: "Diagnóstico dos desvios", quando: `até sexta (${dm(sexta)})`, status: "nao_se_aplica", detalhe: "Nenhum indicador da equipe em atenção ou crítico." });
  } else {
    const noPrazo: string[] = [];
    const atrasados: string[] = [];
    const faltam: string[] = [];
    for (const d of e.desvios) {
      const feitos = e.diagnosticos.filter((x) => x.indicador === d.chave).map((x) => x.criado_em).sort();
      if (!feitos.length) faltam.push(d.rotulo);
      else if (feitos[0] <= prazoDiag) noPrazo.push(d.rotulo);
      else atrasados.push(d.rotulo);
    }
    const passou = e.agora > prazoDiag;
    itens.push({
      chave: "diagnosticos",
      titulo: "Diagnóstico dos desvios",
      quando: `até sexta (${dm(sexta)})`,
      status: faltam.length === 0 && atrasados.length === 0 ? "cumprido" : !passou ? "no_prazo" : faltam.length === 0 ? "parcial" : "nao_cumprido",
      detalhe: [
        `${n(e.desvios.length)} em desvio`,
        noPrazo.length ? `no prazo: ${noPrazo.join(", ")}` : "",
        atrasados.length ? `depois do prazo: ${atrasados.join(", ")}` : "",
        faltam.length ? `sem diagnóstico: ${faltam.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  // 4. reunião de equipe no sábado
  const sabado = somar(e.semana.inicio, 5);
  const r = e.reuniao;
  itens.push({
    chave: "reuniao_equipe",
    titulo: "Reunião de equipe encerrada, com compromissos",
    quando: `sábado (${dm(sabado)})`,
    status: r && r.situacao === "encerrada" && r.compromissos > 0 ? "cumprido" : r ? (e.agora <= fimDoDia(e.semana.fim) ? "no_prazo" : "parcial") : hoje <= sabado ? "no_prazo" : "nao_cumprido",
    detalhe: !r
      ? hoje <= sabado
        ? "Ainda não criada."
        : "Nenhuma reunião de equipe registrada na semana."
      : `Reunião de ${dm(r.data)}${r.data !== sabado ? " (fora do sábado)" : ""}: ${r.situacao === "encerrada" ? "encerrada" : "ainda aberta"}, ${n(r.compromissos)} compromissos.`,
  });

  // 5. planos em dia
  if (!e.planos.length) {
    itens.push({ chave: "planos", titulo: "Planos atualizados e nenhum atrasado", quando: "durante a semana", status: "nao_se_aplica", detalhe: "Nenhum plano aprovado em execução." });
  } else {
    const fimRef = emAndamento ? hoje : e.semana.fim;
    const atrasados = e.planos.filter((p) => (p.situacaoNoFim === "pendente" || p.situacaoNoFim === "em_andamento") && !!p.prazo && p.prazo < fimRef);
    const parados = e.planos.filter((p) => !p.atualizadoNaSemana && (p.situacaoNoFim === "pendente" || p.situacaoNoFim === "em_andamento"));
    itens.push({
      chave: "planos",
      titulo: "Planos atualizados e nenhum atrasado",
      quando: "durante a semana",
      status: atrasados.length ? "nao_cumprido" : parados.length ? (emAndamento ? "no_prazo" : "parcial") : "cumprido",
      detalhe: [
        `${n(e.planos.length)} em execução`,
        atrasados.length ? `atrasados: ${atrasados.map((p) => p.descricao).join("; ")}` : "nenhum atrasado",
        parados.length ? `sem atualização na semana: ${n(parados.length)}` : "todos atualizados",
      ].join(" · "),
    });
  }
  return itens;
}

// ---------------------------------------------------------------------------
// diretoria
// ---------------------------------------------------------------------------

export type Pendencia = { descricao: string; desde: string; resolvidoEm: string | null };
export type EntradaDiretoria = {
  semana: SemanaRotina;
  agora: string;
  reuniao: { situacao: "aberta" | "encerrada"; data: string; decisoes: number } | null;
  /** planos e compromissos gerenciais que passaram a aguardar a diretoria na semana */
  aprovacoes: Pendencia[];
  /** planos que passaram a aguardar validação na semana */
  validacoes: Pendencia[];
};

function avaliarPendencias(chave: string, titulo: string, lista: Pendencia[], agora: string): ItemRotina {
  if (!lista.length) return { chave, titulo, quando: "em até 2 dias", status: "nao_se_aplica", detalhe: "Nada chegou para a diretoria na semana." };
  const prazo = (p: Pendencia) => Date.parse(p.desde) + DOIS_DIAS;
  const emDia = lista.filter((p) => p.resolvidoEm && Date.parse(p.resolvidoEm) <= prazo(p));
  const atrasadas = lista.filter((p) => p.resolvidoEm && Date.parse(p.resolvidoEm) > prazo(p));
  const vencidas = lista.filter((p) => !p.resolvidoEm && Date.parse(agora) > prazo(p));
  const correndo = lista.filter((p) => !p.resolvidoEm && Date.parse(agora) <= prazo(p));
  return {
    chave,
    titulo,
    quando: "em até 2 dias",
    status: vencidas.length ? "nao_cumprido" : atrasadas.length ? "parcial" : correndo.length ? "no_prazo" : "cumprido",
    detalhe: [
      `${n(lista.length)} na semana`,
      emDia.length ? `${n(emDia.length)} no prazo` : "",
      atrasadas.length ? `${n(atrasadas.length)} depois de 2 dias` : "",
      vencidas.length ? `${n(vencidas.length)} esperando há mais de 2 dias: ${vencidas.map((p) => p.descricao).join("; ")}` : "",
      correndo.length ? `${n(correndo.length)} ainda no prazo` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function avaliarDiretoria(e: EntradaDiretoria): ItemRotina[] {
  const itens = avaliarDiretoriaNaRegra(e);
  return e.semana.inicio >= INICIO_ROTINAS ? itens : itens.map((i) => ({ ...i, status: "nao_se_aplica" as const, detalhe: ANTES }));
}

function avaliarDiretoriaNaRegra(e: EntradaDiretoria): ItemRotina[] {
  const segunda = e.semana.inicio;
  const r = e.reuniao;
  const reuniao: ItemRotina = {
    chave: "reuniao_resultados",
    titulo: "Reunião de resultados encerrada, com decisões na ata",
    quando: `segunda (${dm(segunda)})`,
    status: r && r.situacao === "encerrada" && r.decisoes > 0 ? "cumprido" : r ? (e.agora <= fimDoDia(e.semana.fim) ? "no_prazo" : "parcial") : e.agora <= fimDoDia(segunda) ? "no_prazo" : "nao_cumprido",
    detalhe: !r
      ? "Nenhuma reunião de resultados registrada no GRR na semana."
      : `Reunião de ${dm(r.data)}${r.data !== segunda ? " (fora da segunda)" : ""}: ${r.situacao === "encerrada" ? "encerrada" : "ainda aberta"}, ${n(r.decisoes)} decisões na ata.`,
  };
  return [
    reuniao,
    avaliarPendencias("aprovacoes", "Planos decididos em até 2 dias", e.aprovacoes, e.agora),
    avaliarPendencias("validacoes", "Validações conferidas em até 2 dias", e.validacoes, e.agora),
  ];
}

/** situação de um plano num instante, pelo histórico (sem evento: pendente) */
export function situacaoEm(eventos: { tipo: string; dados: Record<string, unknown> | null; criado_em: string }[], instante: string): string {
  let s = "pendente";
  for (const ev of [...eventos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
    if (ev.criado_em > instante) break;
    if (ev.tipo === "situacao" && typeof ev.dados?.depois === "string") s = ev.dados.depois;
  }
  return s;
}
