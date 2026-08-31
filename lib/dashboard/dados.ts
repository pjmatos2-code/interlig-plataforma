import { criarClienteServidor } from "@/lib/supabase/server";
import {
  vendasDoPeriodo,
  receitaContratada,
  ticketMedio,
  percentualMeta,
  pace,
  projecaoFechamento,
  farolProjecao,
  ativacoesPendentes,
  pendentesAssinatura,
  mediaUltimosNDiasUteis,
  type ContratoIndicador,
} from "@/lib/indicadores/regras";
import {
  hojeIso,
  primeiroDiaDoMes,
  ultimoDiaDoMes,
  somarDias,
  type Periodo,
} from "@/lib/datas";
import type { CategoriaOrigem } from "@/lib/tipos";

export type ContratoDashboard = ContratoIndicador & {
  pop_id: string | null;
  plano_id: string | null;
  origem_cadastro: CategoriaOrigem | null;
};

export type DadosDashboard = {
  hoje: string;
  // KPIs (regras 5.1–5.8)
  vendasPeriodo: number;
  vendasPeriodoAnterior: number;
  receitaPeriodo: number;
  ticketMedioPeriodo: number;
  metaMensal: number | null;
  vendasMes: number;
  percentualMeta: number;
  paceNecessario: number;
  projecao: number;
  farol: "verde" | "amarelo" | "vermelho";
  ativacoesPendentes: { total: number; emAlerta: number; foraDoPeriodo: number };
  pendentesAssinatura: { total: number; emAlerta: number; foraDoPeriodo: number };
  // gráficos
  vendasDiarias: { dia: string; vendas: number }[];
  metaDiaria: number | null;
  vendasPorPop: { pop: string; vendas: number; receita: number }[];
  mixPlanos: { plano: string; vendas: number; receita: number }[];
  origemDistribuicao: { origem: CategoriaOrigem; vendas: number }[];
  origemSemanal: { semana: string; [origem: string]: number | string }[];
  projecaoSerie: {
    dia: string;
    realizado: number | null;
    projetado: number | null;
    meta: number | null;
  }[];
  pops: { id: string; nome: string }[];
};

/**
 * Carrega e calcula tudo que o Dashboard Geral (PRD 3.1) mostra.
 * As consultas passam pela RLS: gestor recebe tudo, supervisor só a POP dele.
 * O volume é pequeno (centenas de contratos) — agregação em memória com as
 * funções testadas de lib/indicadores. Quando o sync real crescer a base,
 * a troca é por views materializadas (PRD 7.2) sem mudar as regras.
 */
export async function carregarDashboard(
  periodo: Periodo,
  popId: string | null
): Promise<DadosDashboard> {
  const supabase = criarClienteServidor();
  const hoje = hojeIso();
  const inicioMes = primeiroDiaDoMes(hoje);
  const fimMes = ultimoDiaDoMes(hoje);

  // intervalo que cobre período, comparativo e mês corrente
  const menorData = [periodo.deAnterior, periodo.de, inicioMes].sort()[0];

  let consulta = supabase
    .from("contratos")
    .select(
      "data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, valor_mensalidade, pop_id, plano_id, origem_cadastro"
    )
    .gte("data_venda", menorData)
    .limit(5000);
  if (popId) consulta = consulta.eq("pop_id", popId);

  // pendências (5.7/5.8): busca o estoque inteiro e separa depois entre o que
  // foi vendido dentro do período filtrado e o passivo antigo (foraDoPeriodo)
  let consultaPendencias = supabase
    .from("contratos")
    .select(
      "id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, valor_mensalidade"
    )
    .or("data_assinatura.is.null,data_ativacao.is.null")
    .neq("status", "cancelado")
    .limit(5000);
  if (popId) consultaPendencias = consultaPendencias.eq("pop_id", popId);

  // D9: aguardando instalação = OS de instalação ABERTA no SGP (mesma régua
  // da Esteira — a aproximação D3 zera o critério antigo por data_ativacao)
  let consultaOsAbertas = supabase
    .from("os_instalacao")
    .select("contrato_id, contratos!inner(id, data_venda, pop_id, status)")
    .eq("situacao", "aberta")
    .limit(1000);
  if (popId) consultaOsAbertas = consultaOsAbertas.eq("contratos.pop_id", popId);

  const [
    { data: contratosBrutos },
    { data: contratosPendentes },
    { data: osAbertasBrutas },
    { data: diasCalendario },
    { data: popsData },
    { data: planosData },
    { data: metasData },
    { data: vendedoresAtivos },
  ] = await Promise.all([
    consulta,
    consultaPendencias,
    consultaOsAbertas,
    supabase
      .from("calendario")
      .select("data, dia_util")
      .gte("data", inicioMes)
      .lte("data", fimMes)
      .order("data"),
    supabase.from("pops").select("id, nome").order("nome"),
    supabase.from("planos").select("id, nome, valor_referencia").order("valor_referencia"),
    supabase
      .from("metas")
      .select("escopo, referencia_id, quantidade_vendas")
      .eq("mes_ano", inicioMes),
    supabase.from("vendedores").select("id, pop_id").eq("ativo", true),
  ]);

  const contratos = (contratosBrutos ?? []) as ContratoDashboard[];
  const pops = popsData ?? [];
  const nomePop = new Map(pops.map((p) => [p.id, p.nome]));
  const nomePlano = new Map((planosData ?? []).map((p) => [p.id, p.nome]));

  // ---------- meta do escopo ----------
  // com filtro de POP (ou supervisor): meta da POP; sem filtro: meta global.
  // Sem meta explícita, a meta é a SOMA das metas das vendedoras ativas
  // (interno 70×2 + externo 25×5 — pedido do gestor, 22/08).
  const metas = metasData ?? [];
  const popDoVendedor = new Map((vendedoresAtivos ?? []).map((v) => [v.id, v.pop_id]));
  const somaVendedoras = (filtroPop: string | null) =>
    metas
      .filter(
        (m) =>
          m.escopo === "vendedora" &&
          popDoVendedor.has(m.referencia_id as string) &&
          (filtroPop === null || popDoVendedor.get(m.referencia_id as string) === filtroPop)
      )
      .reduce((soma, m) => soma + m.quantidade_vendas, 0);
  let metaMensal: number | null = null;
  if (popId) {
    metaMensal =
      metas.find((m) => m.escopo === "pop" && m.referencia_id === popId)
        ?.quantidade_vendas ?? (somaVendedoras(popId) || null);
  } else {
    metaMensal =
      metas.find((m) => m.escopo === "global")?.quantidade_vendas ??
      (somaVendedoras(null) || null);
  }

  // ---------- 5.1–5.3: período e comparativo ----------
  const vendasP = vendasDoPeriodo(contratos, periodo.de, periodo.ate);
  const vendasAnt = vendasDoPeriodo(contratos, periodo.deAnterior, periodo.ateAnterior);
  const receitaP = receitaContratada(vendasP);

  // ---------- 5.4–5.6: mês corrente ----------
  const vendasM = vendasDoPeriodo(contratos, inicioMes, hoje);
  const diasUteisMes = (diasCalendario ?? []).filter((d) => d.dia_util).map((d) => d.data);
  const diasUteisDecorridos = diasUteisMes.filter((d) => d <= hoje);
  const diasUteisRestantes = diasUteisMes.filter((d) => d >= hoje).length; // inclusive hoje (5.5)

  const vendasPorDiaMes = new Map<string, number>();
  for (const c of vendasM) {
    vendasPorDiaMes.set(c.data_venda, (vendasPorDiaMes.get(c.data_venda) ?? 0) + 1);
  }

  const media7 = mediaUltimosNDiasUteis(vendasPorDiaMes, diasUteisDecorridos, 7);
  const mediaMes =
    diasUteisDecorridos.length === 0 ? 0 : vendasM.length / diasUteisDecorridos.length;
  const projecao = projecaoFechamento({
    acumuladoMes: vendasM.length,
    mediaUltimos7DiasUteis: media7,
    mediaDiariaMes: mediaMes,
    // dias úteis DEPOIS de hoje: o realizado de hoje já está no acumulado
    diasUteisRestantes: diasUteisMes.filter((d) => d > hoje).length,
  });

  // ---------- 5.7 / 5.8 (5.7 revisado pela D9) ----------
  const pendencias = (contratosPendentes ?? []) as ContratoIndicador[];
  // o card acompanha o filtro: conta o que foi VENDIDO no período selecionado
  const noPeriodo = (dataVenda: string) => dataVenda >= periodo.de && dataVenda <= periodo.ate;
  const assinTodas = pendentesAssinatura(pendencias, hoje);
  const assin = assinTodas.filter((p) =>
    noPeriodo((p.contrato as { data_venda: string }).data_venda)
  );

  // aguardando instalação: OS abertas ∪ assinados sem ativação (D9)
  type OsAberta = { contrato_id: string; contratos: { id: string; data_venda: string; status: string } };
  const osAbertas = ((osAbertasBrutas ?? []) as unknown as OsAberta[]).filter(
    (o) => o.contratos && o.contratos.status !== "cancelado"
  );
  const diasDesde = (de: string) =>
    Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
  const idsComOs = new Set(osAbertas.map((o) => o.contratos.id));
  const ativLegado = ativacoesPendentes(pendencias, hoje);
  const ativTodas = [
    ...osAbertas.map((o) => ({
      alerta: diasDesde(o.contratos.data_venda) > 7,
      dataVenda: o.contratos.data_venda,
    })),
    ...ativLegado
      .filter((p) => !idsComOs.has((p.contrato as { id?: string }).id ?? ""))
      .map((p) => ({
        alerta: p.alerta,
        dataVenda: (p.contrato as { data_venda: string }).data_venda,
      })),
  ];
  const ativ = ativTodas.filter((p) => noPeriodo(p.dataVenda));

  // ---------- gráficos ----------
  const vendasDiarias: { dia: string; vendas: number }[] = [];
  const porDiaPeriodo = new Map<string, number>();
  for (const c of vendasP) {
    porDiaPeriodo.set(c.data_venda, (porDiaPeriodo.get(c.data_venda) ?? 0) + 1);
  }
  for (let d = periodo.de; d <= periodo.ate; d = somarDias(d, 1)) {
    vendasDiarias.push({ dia: d, vendas: porDiaPeriodo.get(d) ?? 0 });
  }

  const porPop = new Map<string, { vendas: number; receita: number }>();
  const porPlano = new Map<string, { vendas: number; receita: number }>();
  const porOrigem = new Map<string, number>();
  const porSemanaOrigem = new Map<string, Map<string, number>>();

  for (const c of vendasP) {
    const kp = c.pop_id ? nomePop.get(c.pop_id) ?? "Sem POP" : "Não atribuída";
    const vp = porPop.get(kp) ?? { vendas: 0, receita: 0 };
    vp.vendas += 1;
    vp.receita += c.valor_mensalidade;
    porPop.set(kp, vp);

    const kpl = c.plano_id ? nomePlano.get(c.plano_id) ?? "Sem plano" : "Sem plano";
    const vpl = porPlano.get(kpl) ?? { vendas: 0, receita: 0 };
    vpl.vendas += 1;
    vpl.receita += c.valor_mensalidade;
    porPlano.set(kpl, vpl);

    const ko = c.origem_cadastro ?? "outro";
    porOrigem.set(ko, (porOrigem.get(ko) ?? 0) + 1);

    const seg = new Date(`${c.data_venda}T00:00:00Z`);
    const dow = seg.getUTCDay();
    const inicioSem = somarDias(c.data_venda, dow === 0 ? -6 : 1 - dow);
    if (!porSemanaOrigem.has(inicioSem)) porSemanaOrigem.set(inicioSem, new Map());
    const m = porSemanaOrigem.get(inicioSem)!;
    m.set(ko, (m.get(ko) ?? 0) + 1);
  }

  // mix de planos na ordem de valor (rampa ordinal do gráfico segue essa ordem)
  const ordemPlanos = (planosData ?? []).map((p) => p.nome);
  const mixPlanos = ordemPlanos
    .filter((nome) => porPlano.has(nome))
    .map((nome) => ({ plano: nome, ...porPlano.get(nome)! }));

  const origemSemanal = [...porSemanaOrigem.keys()].sort().map((semana) => {
    const m = porSemanaOrigem.get(semana)!;
    return {
      semana,
      venda_externa: m.get("venda_externa") ?? 0,
      trafego_pago: m.get("trafego_pago") ?? 0,
      presencial: m.get("presencial") ?? 0,
      indicacao: m.get("indicacao") ?? 0,
      outro: m.get("outro") ?? 0,
    };
  });

  // ---------- série da projeção (mês corrente) ----------
  const projecaoSerie: DadosDashboard["projecaoSerie"] = [];
  let acumulado = 0;
  const ritmo = 0.7 * media7 + 0.3 * mediaMes;
  let projAcum = vendasM.length;
  for (const d of diasCalendario ?? []) {
    const dia = d.data as string;
    if (dia <= hoje) {
      acumulado += vendasPorDiaMes.get(dia) ?? 0;
      projecaoSerie.push({
        dia,
        realizado: acumulado,
        projetado: dia === hoje ? acumulado : null,
        meta: metaMensal,
      });
    } else {
      if (d.dia_util) projAcum += ritmo;
      projecaoSerie.push({ dia, realizado: null, projetado: projAcum, meta: metaMensal });
    }
  }

  return {
    hoje,
    vendasPeriodo: vendasP.length,
    vendasPeriodoAnterior: vendasAnt.length,
    receitaPeriodo: receitaP,
    ticketMedioPeriodo: ticketMedio(vendasP),
    metaMensal,
    vendasMes: vendasM.length,
    percentualMeta: metaMensal ? percentualMeta(vendasM.length, metaMensal) : 0,
    paceNecessario: metaMensal ? pace(metaMensal, vendasM.length, diasUteisRestantes) : 0,
    projecao,
    farol: metaMensal ? farolProjecao(projecao, metaMensal) : "vermelho",
    ativacoesPendentes: {
      total: ativ.length,
      emAlerta: ativ.filter((p) => p.alerta).length,
      foraDoPeriodo: ativTodas.length - ativ.length,
    },
    pendentesAssinatura: {
      total: assin.length,
      emAlerta: assin.filter((p) => p.alerta).length,
      foraDoPeriodo: assinTodas.length - assin.length,
    },
    vendasDiarias,
    metaDiaria: metaMensal && diasUteisMes.length > 0 ? metaMensal / diasUteisMes.length : null,
    vendasPorPop: [...porPop.entries()]
      .map(([pop, v]) => ({ pop, ...v }))
      .sort((a, b) => b.vendas - a.vendas),
    mixPlanos,
    origemDistribuicao: (
      ["venda_externa", "trafego_pago", "presencial", "indicacao", "outro"] as CategoriaOrigem[]
    )
      .map((origem) => ({ origem, vendas: porOrigem.get(origem) ?? 0 }))
      .filter((o) => o.vendas > 0),
    origemSemanal,
    projecaoSerie,
    pops,
  };
}
