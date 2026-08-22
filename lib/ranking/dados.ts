import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  vendasDoPeriodo,
  receitaContratada,
  ticketMedio,
  metaDiariaIndividual,
  streakDiasUteis,
  type ContratoIndicador,
} from "@/lib/indicadores/regras";
import { conversaoReal, type TicketIndicador } from "@/lib/indicadores/crm";
import {
  hojeIso,
  primeiroDiaDoMes,
  ultimoDiaDoMes,
  inicioDaSemana,
  mesAtras,
  somarDias,
} from "@/lib/datas";

/**
 * Ranking gamificado (PRD 3.3). Usa o cliente admin porque o ranking compara
 * TODAS as vendedoras — dado que a RLS (corretamente) esconde da vendedora.
 * A exposição é controlada na página: vendedora vê posições e nomes, nunca os
 * números das colegas.
 */

export type LinhaRanking = {
  vendedorId: string;
  nome: string;
  pop: string;
  foto: string | null;
  vendas: number;
  receita: number;
  posicao: number;
  /** gamificação do totem: 100 pts por venda */
  pontos: number;
  /** posições ganhas (+) ou perdidas (-) vs o período anterior; null = novata no ranking */
  variacao: number | null;
};

export type Badges = {
  primeiraMeta: { nome: string; dia: string } | null;
  maiorTicket: { nome: string; valor: number } | null;
  melhorConversao: { nome: string; taxa: number } | null;
  recordePessoal: { nome: string; vendas: number; recordeAnterior: number }[];
};

export type TotaisPeriodo = {
  vendas: number;
  receita: number;
  /** % vs período anterior equivalente (null quando o anterior foi zero) */
  variacaoPct: number | null;
  ativas: number;
  totalVendedoras: number;
};

export type DesafioDia = {
  alvo: number;
  progresso: number;
  recompensaPts: number;
};

export type DadosRanking = {
  hoje: string;
  podios: { dia: LinhaRanking[]; semana: LinhaRanking[]; mes: LinhaRanking[] };
  totais: { dia: TotaisPeriodo; semana: TotaisPeriodo; mes: TotaisPeriodo };
  streaks: { vendedorId: string; nome: string; foto: string | null; streak: number; metaDiaria: number }[];
  badges: Badges;
  desafioDia: DesafioDia | null;
};

type ContratoR = ContratoIndicador & { vendedor_id: string | null };

function ranquear(
  vendedoras: { id: string; nome: string; pop: string; foto: string | null }[],
  contratos: ContratoR[],
  de: string,
  ate: string,
  anterior?: { de: string; ate: string }
): LinhaRanking[] {
  const linhas = vendedoras.map((v) => {
    const proprias = vendasDoPeriodo(
      contratos.filter((c) => c.vendedor_id === v.id),
      de,
      ate
    );
    return {
      vendedorId: v.id,
      nome: v.nome,
      pop: v.pop,
      foto: v.foto,
      vendas: proprias.length,
      receita: receitaContratada(proprias),
      posicao: 0,
      pontos: proprias.length * 100,
      variacao: null as number | null,
    };
  });
  linhas.sort(
    (a, b) => b.vendas - a.vendas || b.receita - a.receita || a.nome.localeCompare(b.nome)
  );
  linhas.forEach((l, i) => (l.posicao = i + 1));

  if (anterior) {
    const antes = ranquear(vendedoras, contratos, anterior.de, anterior.ate);
    const posAntes = new Map(antes.filter((l) => l.vendas > 0).map((l) => [l.vendedorId, l.posicao]));
    for (const l of linhas) {
      const pa = posAntes.get(l.vendedorId);
      l.variacao = pa === undefined ? null : pa - l.posicao;
    }
  }
  return linhas;
}

function totaisDe(
  linhas: LinhaRanking[],
  contratos: ContratoR[],
  anterior: { de: string; ate: string },
  totalVendedoras: number
): TotaisPeriodo {
  const vendas = linhas.reduce((s, l) => s + l.vendas, 0);
  const receita = linhas.reduce((s, l) => s + l.receita, 0);
  const antes = vendasDoPeriodo(contratos, anterior.de, anterior.ate);
  const receitaAntes = receitaContratada(antes);
  return {
    vendas,
    receita,
    variacaoPct: receitaAntes > 0 ? ((receita - receitaAntes) / receitaAntes) * 100 : null,
    ativas: linhas.filter((l) => l.vendas > 0).length,
    totalVendedoras,
  };
}

export async function carregarRanking(popId: string | null): Promise<DadosRanking> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const inicioMes = primeiroDiaDoMes(hoje);
  const inicioSemana = inicioDaSemana(hoje);
  const inicioHistorico = mesAtras(hoje, 12);

  let consultaVend = admin
    .from("vendedores")
    .select("id, nome, pop_id, foto_url, pops(nome)")
    .eq("ativo", true);
  if (popId) consultaVend = consultaVend.eq("pop_id", popId);

  const [
    { data: vendedorasBrutas },
    { data: contratosBrutos },
    { data: metas },
    { data: cal },
    { data: ticketsMes },
  ] = await Promise.all([
    consultaVend,
    admin
      .from("contratos")
      .select(
        "data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, vendedor_id"
      )
      .gte("data_venda", inicioHistorico)
      .limit(10000),
    admin
      .from("metas")
      .select("referencia_id, quantidade_vendas")
      .eq("escopo", "vendedora")
      .eq("mes_ano", inicioMes),
    admin
      .from("calendario")
      .select("data, dia_util")
      .gte("data", inicioMes)
      .lte("data", ultimoDiaDoMes(hoje)),
    admin
      .from("tickets")
      .select("vendedor_id, etapa, desfecho, criado_em, primeira_tratativa_em, fechado_em, contrato_id, reconciliado_em, atualizado_em")
      .eq("etapa", "fechado")
      .gte("fechado_em", `${inicioMes}T00:00:00`)
      .limit(3000),
  ]);

  const vendedoras = (vendedorasBrutas ?? []).map((v) => ({
    id: v.id as string,
    nome: v.nome as string,
    pop: ((v.pops as unknown as { nome: string } | null)?.nome ?? "—") as string,
    foto: (v as { foto_url?: string | null }).foto_url ?? null,
  }));
  const contratos = (contratosBrutos ?? []) as ContratoR[];
  const idsEscopo = new Set(vendedoras.map((v) => v.id));
  const contratosEscopo = contratos.filter(
    (c) => c.vendedor_id !== null && idsEscopo.has(c.vendedor_id)
  );

  const metaPorVendedora = new Map(
    (metas ?? []).map((m) => [m.referencia_id as string, m.quantidade_vendas as number])
  );
  const diasUteisMes = (cal ?? []).filter((d) => d.dia_util).map((d) => d.data as string);
  const diasUteisDecorridos = diasUteisMes.filter((d) => d <= hoje);

  // ---------- pódios (variação vs período anterior equivalente) ----------
  const ontem = somarDias(hoje, -1);
  const antDia = { de: ontem, ate: ontem };
  const antSemana = { de: somarDias(inicioSemana, -7), ate: somarDias(inicioSemana, -1) };
  const mesAnterior = mesAtras(inicioMes, 1);
  const antMes = { de: mesAnterior, ate: ultimoDiaDoMes(mesAnterior) };
  const rankingMes = ranquear(vendedoras, contratosEscopo, inicioMes, hoje, antMes);
  const podios = {
    dia: ranquear(vendedoras, contratosEscopo, hoje, hoje, antDia),
    semana: ranquear(vendedoras, contratosEscopo, inicioSemana, hoje, antSemana),
    mes: rankingMes,
  };
  const totais = {
    dia: totaisDe(podios.dia, contratosEscopo, antDia, vendedoras.length),
    semana: totaisDe(podios.semana, contratosEscopo, antSemana, vendedoras.length),
    mes: totaisDe(podios.mes, contratosEscopo, antMes, vendedoras.length),
  };

  // ---------- streaks (5.13) ----------
  const streaks = vendedoras
    .map((v) => {
      const meta = metaPorVendedora.get(v.id) ?? 0;
      const metaDiaria = metaDiariaIndividual(meta, diasUteisMes.length);
      const porDia = new Map<string, number>();
      for (const c of vendasDoPeriodo(
        contratosEscopo.filter((c) => c.vendedor_id === v.id),
        inicioMes,
        hoje
      )) {
        porDia.set(c.data_venda, (porDia.get(c.data_venda) ?? 0) + 1);
      }
      return {
        vendedorId: v.id,
        nome: v.nome,
        foto: v.foto,
        metaDiaria,
        streak: streakDiasUteis(porDia, diasUteisDecorridos, metaDiaria, hoje),
      };
    })
    .sort((a, b) => b.streak - a.streak);

  // ---------- badges ----------
  // primeira a bater a meta do mês
  let primeiraMeta: Badges["primeiraMeta"] = null;
  for (const v of vendedoras) {
    const meta = metaPorVendedora.get(v.id);
    if (!meta) continue;
    const proprias = vendasDoPeriodo(
      contratosEscopo.filter((c) => c.vendedor_id === v.id),
      inicioMes,
      hoje
    ).sort((a, b) => (a.data_venda < b.data_venda ? -1 : 1));
    if (proprias.length < meta) continue;
    const diaQueBateu = proprias[meta - 1].data_venda;
    if (!primeiraMeta || diaQueBateu < primeiraMeta.dia) {
      primeiraMeta = { nome: v.nome, dia: diaQueBateu };
    }
  }

  // maior ticket médio do mês (mínimo 5 vendas)
  let maiorTicket: Badges["maiorTicket"] = null;
  for (const v of vendedoras) {
    const proprias = vendasDoPeriodo(
      contratosEscopo.filter((c) => c.vendedor_id === v.id),
      inicioMes,
      hoje
    );
    if (proprias.length < 5) continue;
    const tm = ticketMedio(proprias);
    if (!maiorTicket || tm > maiorTicket.valor) maiorTicket = { nome: v.nome, valor: tm };
  }

  // melhor conversão real do mês (5.14, mínimo 5 fechados)
  let melhorConversao: Badges["melhorConversao"] = null;
  const ticketsPorVendedora = new Map<string, TicketIndicador[]>();
  for (const t of (ticketsMes ?? []) as (TicketIndicador & { vendedor_id: string | null })[]) {
    if (!t.vendedor_id || !idsEscopo.has(t.vendedor_id)) continue;
    if (!ticketsPorVendedora.has(t.vendedor_id)) ticketsPorVendedora.set(t.vendedor_id, []);
    ticketsPorVendedora.get(t.vendedor_id)!.push(t);
  }
  for (const v of vendedoras) {
    const r = conversaoReal(ticketsPorVendedora.get(v.id) ?? []);
    if (r.fechados < 5 || r.taxa === null) continue;
    if (!melhorConversao || r.taxa > melhorConversao.taxa)
      melhorConversao = { nome: v.nome, taxa: r.taxa };
  }

  // recorde pessoal: mês corrente já superou o melhor mês dos últimos 12
  const recordePessoal: Badges["recordePessoal"] = [];
  for (const v of vendedoras) {
    const proprias = contratosEscopo.filter((c) => c.vendedor_id === v.id);
    const atual = vendasDoPeriodo(proprias, inicioMes, hoje).length;
    let recordeAnterior = 0;
    for (let i = 1; i <= 12; i++) {
      const mes = mesAtras(inicioMes, i);
      const doMes = vendasDoPeriodo(proprias, mes, ultimoDiaDoMes(mes)).length;
      recordeAnterior = Math.max(recordeAnterior, doMes);
    }
    if (recordeAnterior > 0 && atual > recordeAnterior) {
      recordePessoal.push({ nome: v.nome, vendas: atual, recordeAnterior });
    }
  }
  recordePessoal.sort((a, b) => b.vendas - a.vendas);

  // ---------- desafio do dia (meta diária derivada da meta global) ----------
  const { data: metaGlobal } = await admin
    .from("metas")
    .select("quantidade_vendas")
    .eq("escopo", "global")
    .eq("mes_ano", inicioMes)
    .maybeSingle();
  let desafioDia: DesafioDia | null = null;
  if (metaGlobal && diasUteisMes.length > 0) {
    const alvo = Math.max(1, Math.round(metaGlobal.quantidade_vendas / diasUteisMes.length));
    const vendasHoje = vendasDoPeriodo(contratosEscopo, hoje, hoje).length;
    desafioDia = { alvo, progresso: vendasHoje, recompensaPts: alvo * 50 };
  }

  return {
    hoje,
    podios,
    totais,
    streaks,
    badges: { primeiraMeta, maiorTicket, melhorConversao, recordePessoal },
    desafioDia,
  };
}
