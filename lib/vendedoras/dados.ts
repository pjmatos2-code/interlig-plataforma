import type { SetorAgente } from "@/lib/tipos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  vendasDoPeriodo,
  receitaContratada,
  ticketMedio,
  percentualMeta,
  pace,
  projecaoFechamento,
  farolProjecao,
  mediaUltimosNDiasUteis,
  metaDiariaIndividual,
  tendencia,
  type ContratoIndicador,
} from "@/lib/indicadores/regras";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes, somarDias, mesAtras, type Periodo } from "@/lib/datas";
import type { CategoriaOrigem, Usuario } from "@/lib/tipos";

type ContratoVend = ContratoIndicador & {
  vendedor_id: string | null;
  pop_id: string | null;
};

export type LinhaVendedora = {
  setor: SetorAgente;
  id: string;
  nome: string;
  pop: string;
  vendas: number;
  receita: number;
  ticketMedio: number;
  metaMensal: number | null;
  percentualMeta: number | null;
  pace: number | null;
  farol: "verde" | "amarelo" | "vermelho" | null;
  tendencia: "sobe" | "desce" | "estavel";
};

/** Contexto de dias úteis do mês corrente, compartilhado pelos cálculos. */
async function diasUteisDoMes(supabase: ReturnType<typeof criarClienteServidor>) {
  const hoje = hojeIso();
  const inicioMes = primeiroDiaDoMes(hoje);
  const { data } = await supabase
    .from("calendario")
    .select("data, dia_util")
    .gte("data", inicioMes)
    .lte("data", ultimoDiaDoMes(hoje))
    .order("data");
  const uteis = (data ?? []).filter((d) => d.dia_util).map((d) => d.data as string);
  return {
    hoje,
    inicioMes,
    uteis,
    decorridos: uteis.filter((d) => d <= hoje),
    restantesInclusiveHoje: uteis.filter((d) => d >= hoje).length,
    aposHoje: uteis.filter((d) => d > hoje).length,
  };
}

/**
 * Painel por Vendedora (PRD 3.2): uma linha por vendedora com vendas, receita,
 * ticket, % da meta, pace e tendência. A RLS já limita contratos ao escopo;
 * a lista de vendedoras é filtrada pela POP do supervisor.
 */
export async function listaVendedoras(
  periodo: Periodo,
  usuario: Usuario,
  popFiltro: string | null,
  setorFiltro: SetorAgente | null = null
): Promise<LinhaVendedora[]> {
  const supabase = criarClienteServidor();
  const cal = await diasUteisDoMes(supabase);

  // Coordenador: lista só as agentes dele (coordenador_id). Gestor: todas, com
  // filtro opcional de POP. Os contratos já vêm escopados pela RLS (por agente
  // para o coordenador — migração 0025); o filtro de POP é só do gestor.
  const ehCoord = usuario.perfil === "supervisor";
  let consultaVend = supabase
    .from("vendedores")
    .select("id, nome, pop_id, setor, pops(nome)")
    .eq("ativo", true)
    .order("nome");
  // sem filtro, o painel mostra TODOS os setores — inclusive refidelização,
  // que tem métrica própria (planos, não vendas)
  if (setorFiltro) consultaVend = consultaVend.eq("setor", setorFiltro);
  if (ehCoord) consultaVend = consultaVend.eq("coordenador_id", usuario.id);
  else if (popFiltro) consultaVend = consultaVend.eq("pop_id", popFiltro);

  const menorData = [periodo.de, cal.inicioMes, somarDias(cal.hoje, -13)].sort()[0];

  let consultaContratos = supabase
    .from("contratos")
    .select(
      "data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, valor_mensalidade, vendedor_id, pop_id"
    )
    .gte("data_venda", menorData)
    .limit(5000);
  if (!ehCoord && popFiltro) consultaContratos = consultaContratos.eq("pop_id", popFiltro);

  const [{ data: vendedoras }, { data: contratosBrutos }, { data: metas }] = await Promise.all([
    consultaVend,
    consultaContratos,
    supabase
      .from("metas")
      .select("referencia_id, quantidade_vendas")
      .eq("escopo", "vendedora")
      .eq("mes_ano", cal.inicioMes),
  ]);

  const contratos = (contratosBrutos ?? []) as ContratoVend[];

  // Atendimento não vende: o "resultado" delas são os planos refidelizados.
  // Sem isso elas apareceriam zeradas ao lado das vendedoras, o que é pior do
  // que não aparecer.
  const temAtendimento = (vendedoras ?? []).some((v) => v.setor === "atendimento");
  const refidPorAgente = new Map<
    string,
    { planos: number; vtv: number; meta: number; porDia: Map<string, number> }
  >();
  if (temAtendimento) {
    const { refidelizacaoDoMes, META_REFIDELIZACAO } = await import("@/lib/refidelizacao/dados");
    const { data: logins } = await supabase
      .from("vendedores")
      .select("id, sgp_login")
      .eq("setor", "atendimento");
    const porLogin = new Map(
      (logins ?? [])
        .filter((v) => v.sgp_login)
        .map((v) => [String(v.sgp_login).toLowerCase(), v.id as string])
    );
    const r = await refidelizacaoDoMes(cal.inicioMes, [...porLogin.keys()]);
    for (const a of r.agentes) {
      const id = porLogin.get(a.agente);
      if (!id) continue;
      // série diária: alimenta projeção e tendência do mesmo jeito que as vendas
      const porDia = new Map<string, number>();
      for (const l of a.linhas) {
        if (!l.conta) continue;
        porDia.set(l.data, (porDia.get(l.data) ?? 0) + 1);
      }
      refidPorAgente.set(id, {
        planos: a.validos,
        vtv: a.vtv,
        meta: META_REFIDELIZACAO,
        porDia,
      });
    }
  }

  const metaPorVendedora = new Map(
    (metas ?? []).map((m) => [m.referencia_id as string, m.quantidade_vendas as number])
  );

  const seteAtras = somarDias(cal.hoje, -6);
  const quatorzeAtras = somarDias(cal.hoje, -13);

  const linhas = (vendedoras ?? []).map((v) => {
    const refid = refidPorAgente.get(v.id);
    if (refid) {
      const popRelR = v.pops as unknown as { nome: string } | null;
      const noIntervalo = (de: string, ate: string) =>
        [...refid.porDia.entries()]
          .filter(([d]) => d >= de && d <= ate)
          .reduce((t, [, n]) => t + n, 0);

      const projR = projecaoFechamento({
        acumuladoMes: refid.planos,
        mediaUltimos7DiasUteis: mediaUltimosNDiasUteis(refid.porDia, cal.decorridos, 7),
        mediaDiariaMes: cal.decorridos.length ? refid.planos / cal.decorridos.length : 0,
        diasUteisRestantes: cal.aposHoje,
      });

      return {
        id: v.id,
        setor: v.setor as SetorAgente,
        nome: v.nome,
        pop: popRelR?.nome ?? "—",
        vendas: refid.planos,
        receita: refid.vtv,
        ticketMedio: refid.planos > 0 ? refid.vtv / refid.planos : 0,
        metaMensal: refid.meta,
        percentualMeta: percentualMeta(refid.planos, refid.meta),
        pace: pace(refid.meta, refid.planos, cal.restantesInclusiveHoje),
        farol: farolProjecao(projR, refid.meta),
        tendencia: tendencia(
          noIntervalo(seteAtras, cal.hoje),
          noIntervalo(quatorzeAtras, somarDias(seteAtras, -1))
        ),
      };
    }
    const proprios = contratos.filter((c) => c.vendedor_id === v.id);
    const vendasP = vendasDoPeriodo(proprios, periodo.de, periodo.ate);
    const vendasMes = vendasDoPeriodo(proprios, cal.inicioMes, cal.hoje).length;
    const ult7 = vendasDoPeriodo(proprios, seteAtras, cal.hoje).length;
    const ant7 = vendasDoPeriodo(proprios, quatorzeAtras, somarDias(seteAtras, -1)).length;

    const meta = metaPorVendedora.get(v.id) ?? null;
    let farol: LinhaVendedora["farol"] = null;
    if (meta) {
      const porDia = new Map<string, number>();
      for (const c of vendasDoPeriodo(proprios, cal.inicioMes, cal.hoje)) {
        porDia.set(c.data_venda, (porDia.get(c.data_venda) ?? 0) + 1);
      }
      const proj = projecaoFechamento({
        acumuladoMes: vendasMes,
        mediaUltimos7DiasUteis: mediaUltimosNDiasUteis(porDia, cal.decorridos, 7),
        mediaDiariaMes: cal.decorridos.length ? vendasMes / cal.decorridos.length : 0,
        diasUteisRestantes: cal.aposHoje,
      });
      farol = farolProjecao(proj, meta);
    }

    const popRel = v.pops as unknown as { nome: string } | null;
    return {
      id: v.id,
      setor: v.setor as SetorAgente,
      nome: v.nome,
      pop: popRel?.nome ?? "—",
      vendas: vendasP.length,
      receita: receitaContratada(vendasP),
      ticketMedio: ticketMedio(vendasP),
      metaMensal: meta,
      percentualMeta: meta ? percentualMeta(vendasMes, meta) : null,
      pace: meta ? pace(meta, vendasMes, cal.restantesInclusiveHoje) : null,
      farol,
      tendencia: tendencia(ult7, ant7),
    };
  });

  // ordem por resultado (critério oficial do ranking): vendas ↓, ticket médio ↓
  return linhas.sort(
    (a, b) => b.vendas - a.vendas || b.ticketMedio - a.ticketMedio || a.nome.localeCompare(b.nome)
  );
}

export type VendaListada = {
  id: string;
  cliente: string;
  /** ids do SGP para abrir o cliente/contrato direto no painel */
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  cpf: string | null;
  plano: string;
  valor: number;
  status: string;
  origem: CategoriaOrigem | null;
  data_venda: string;
  data_ativacao: string | null;
  /** trava absoluta: sem Termo + Fidelidade nem a gestão libera */
  assinaturaPendente: boolean;
  /** já liberada à mão pela gestão para a competência da venda */
  liberada: boolean;
  /** cliente desistiu antes de ativar — fora das pendências */
  desistiu: boolean;
};

export type DetalheVendedora = {
  id: string;
  nome: string;
  pop: string;
  kpis: {
    vendasMes: number;
    receitaMes: number;
    ticketMedio: number;
    metaMensal: number | null;
    metaDiaria: number | null;
    percentualMeta: number | null;
    pace: number | null;
    projecao: number | null;
    farol: "verde" | "amarelo" | "vermelho" | null;
    /** true = os KPIs referem-se ao período filtrado, não ao mês corrente */
    doPeriodo: boolean;
    /** mês da meta usada na comparação (quando o período cabe num único mês) */
    mesReferencia: string | null;
  };
  vendas: VendaListada[];
  funil: { etapa: string; quantidade: number }[];
  historico: { mes: string; realizado: number; meta: number | null }[];
};

/**
 * Drill-down da vendedora (PRD 3.2): vendas listadas, funil individual
 * (MVP: vendida → assinada → instalada, PRD 3.4) e histórico de 6 meses.
 */
export async function detalheVendedora(
  vendedorId: string,
  periodo: Periodo
): Promise<DetalheVendedora | null> {
  const supabase = criarClienteServidor();
  const cal = await diasUteisDoMes(supabase);
  const seisMesesAtras = mesAtras(cal.inicioMes, 5);

  const [{ data: vend }, { data: contratosBrutos }, { data: metas }] = await Promise.all([
    supabase
      .from("vendedores")
      .select("id, nome, pops(nome)")
      .eq("id", vendedorId)
      .maybeSingle(),
    supabase
      .from("contratos")
      .select(
        "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, valor_mensalidade, origem_cadastro, termo_adesao_assinado, fidelidade_assinada, assinatura_dispensada, clientes(nome, sgp_cliente_id, cpf), planos(nome, exige_assinatura)"
      )
      .eq("vendedor_id", vendedorId)
      .gte("data_venda", [periodo.de, seisMesesAtras].sort()[0])
      .order("data_venda", { ascending: false })
      .limit(2000),
    supabase
      .from("metas")
      .select("mes_ano, quantidade_vendas")
      .eq("escopo", "vendedora")
      .eq("referencia_id", vendedorId)
      .gte("mes_ano", seisMesesAtras),
  ]);

  if (!vend) return null;

  type Bruto = ContratoIndicador & {
    id: string;
    sgp_contrato_id: string | null;
    origem_cadastro: CategoriaOrigem | null;
    clientes: { nome: string; sgp_cliente_id: string | null; cpf: string | null } | null;
    planos: { nome: string } | null;
  };
  const contratos = (contratosBrutos ?? []) as unknown as Bruto[];

  // ---------- KPIs do mês ----------
  const vendasMes = vendasDoPeriodo(contratos, cal.inicioMes, cal.hoje);
  const meta =
    (metas ?? []).find((m) => m.mes_ano === cal.inicioMes)?.quantidade_vendas ?? null;
  let projecao: number | null = null;
  let farol: DetalheVendedora["kpis"]["farol"] = null;
  if (meta) {
    const porDia = new Map<string, number>();
    for (const c of vendasMes) porDia.set(c.data_venda, (porDia.get(c.data_venda) ?? 0) + 1);
    projecao = projecaoFechamento({
      acumuladoMes: vendasMes.length,
      mediaUltimos7DiasUteis: mediaUltimosNDiasUteis(porDia, cal.decorridos, 7),
      mediaDiariaMes: cal.decorridos.length ? vendasMes.length / cal.decorridos.length : 0,
      diasUteisRestantes: cal.aposHoje,
    });
    farol = farolProjecao(projecao, meta);
  }

  // ---------- vendas listadas + funil do período filtrado ----------
  const vendasP = vendasDoPeriodo(contratos, periodo.de, periodo.ate);

  // KPIs seguem o PERÍODO quando ele não é o mês corrente (ex.: busca por maio).
  // A meta comparada é a do mês do período, desde que o intervalo caiba nele.
  const mesDoPeriodo = primeiroDiaDoMes(periodo.de);
  const periodoEhMesCorrente = mesDoPeriodo === cal.inicioMes;
  const cabeEmUmMes = primeiroDiaDoMes(periodo.ate) === mesDoPeriodo;
  const metaDoPeriodo = cabeEmUmMes
    ? ((metas ?? []).find((m) => m.mes_ano === mesDoPeriodo)?.quantidade_vendas ?? null)
    : null;
  const vendasKpi = periodoEhMesCorrente ? vendasMes : vendasP;
  const metaKpi = periodoEhMesCorrente ? meta : metaDoPeriodo;
  const funil = [
    { etapa: "Vendidas", quantidade: vendasP.length },
    { etapa: "Assinadas", quantidade: vendasP.filter((c) => c.data_assinatura !== null).length },
    { etapa: "Instaladas", quantidade: vendasP.filter((c) => c.data_ativacao !== null).length },
  ];

  // ---------- histórico de 6 meses ----------
  const historico: DetalheVendedora["historico"] = [];
  for (let i = 5; i >= 0; i--) {
    const mes = mesAtras(cal.inicioMes, i);
    historico.push({
      mes,
      realizado: vendasDoPeriodo(contratos, mes, ultimoDiaDoMes(mes)).length,
      meta: (metas ?? []).find((m) => m.mes_ano === mes)?.quantidade_vendas ?? null,
    });
  }

  const popRel = vend.pops as unknown as { nome: string } | null;
  return {
    id: vend.id,
    nome: vend.nome,
    pop: popRel?.nome ?? "—",
    kpis: {
      vendasMes: vendasKpi.length,
      receitaMes: receitaContratada(vendasKpi),
      ticketMedio: ticketMedio(vendasKpi),
      metaMensal: metaKpi,
      // pace/projeção/farol só fazem sentido no mês corrente (mês em andamento)
      metaDiaria: periodoEhMesCorrente && meta ? metaDiariaIndividual(meta, cal.uteis.length) : null,
      percentualMeta: metaKpi ? percentualMeta(vendasKpi.length, metaKpi) : null,
      pace: periodoEhMesCorrente && meta ? pace(meta, vendasMes.length, cal.restantesInclusiveHoje) : null,
      projecao: periodoEhMesCorrente ? projecao : null,
      farol: periodoEhMesCorrente ? farol : null,
      doPeriodo: !periodoEhMesCorrente,
      mesReferencia: cabeEmUmMes ? mesDoPeriodo : null,
    },
    vendas: await (async () => {
      const { temPendenciaDeAssinatura } = await import("@/lib/comissao/liberacao");
      const ids = vendasP.map((c) => c.id);
      const { data: libs } = ids.length
        ? await criarClienteAdmin()
            .from("comissao_liberacoes")
            .select("contrato_id, competencia")
            .in("contrato_id", ids)
            .is("revogado_em", null)
        : { data: [] as { contrato_id: string; competencia: string }[] };
      const liberadaEm = new Set((libs ?? []).map((l) => `${l.contrato_id}:${String(l.competencia).slice(0, 7)}`));
      return vendasP.map((c) => ({
      id: c.id,
      cliente: c.clientes?.nome ?? "—",
      sgpContratoId: c.sgp_contrato_id,
      sgpClienteId: c.clientes?.sgp_cliente_id ?? null,
      cpf: c.clientes?.cpf ?? null,
      plano: c.planos?.nome ?? "—",
      valor: c.valor_mensalidade,
      status: c.status,
      origem: c.origem_cadastro,
      data_venda: c.data_venda,
      data_ativacao: c.data_ativacao,
      assinaturaPendente: temPendenciaDeAssinatura(c as never),
      liberada: liberadaEm.has(`${c.id}:${String(c.data_venda).slice(0, 7)}`),
      desistiu: Boolean((c as { desistencia_em?: string | null }).desistencia_em),
    }));
    })(),
    funil,
    historico,
  };
}
