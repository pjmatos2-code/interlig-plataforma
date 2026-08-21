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
  vendas: number;
  receita: number;
  posicao: number;
};

export type Badges = {
  primeiraMeta: { nome: string; dia: string } | null;
  maiorTicket: { nome: string; valor: number } | null;
  melhorConversao: { nome: string; taxa: number } | null;
  recordePessoal: { nome: string; vendas: number; recordeAnterior: number }[];
};

export type DadosRanking = {
  hoje: string;
  podios: { dia: LinhaRanking[]; semana: LinhaRanking[]; mes: LinhaRanking[] };
  streaks: { vendedorId: string; nome: string; streak: number; metaDiaria: number }[];
  badges: Badges;
};

type ContratoR = ContratoIndicador & { vendedor_id: string | null };

function ranquear(
  vendedoras: { id: string; nome: string; pop: string }[],
  contratos: ContratoR[],
  de: string,
  ate: string
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
      vendas: proprias.length,
      receita: receitaContratada(proprias),
      posicao: 0,
    };
  });
  linhas.sort(
    (a, b) => b.vendas - a.vendas || b.receita - a.receita || a.nome.localeCompare(b.nome)
  );
  linhas.forEach((l, i) => (l.posicao = i + 1));
  return linhas;
}

export async function carregarRanking(popId: string | null): Promise<DadosRanking> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const inicioMes = primeiroDiaDoMes(hoje);
  const inicioSemana = inicioDaSemana(hoje);
  const inicioHistorico = mesAtras(hoje, 12);

  let consultaVend = admin
    .from("vendedores")
    .select("id, nome, pop_id, pops(nome)")
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

  // ---------- pódios ----------
  const rankingMes = ranquear(vendedoras, contratosEscopo, inicioMes, hoje);
  const podios = {
    dia: ranquear(vendedoras, contratosEscopo, hoje, hoje),
    semana: ranquear(vendedoras, contratosEscopo, inicioSemana, hoje),
    mes: rankingMes,
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

  return {
    hoje,
    podios,
    streaks,
    badges: { primeiraMeta, maiorTicket, melhorConversao, recordePessoal },
  };
}
