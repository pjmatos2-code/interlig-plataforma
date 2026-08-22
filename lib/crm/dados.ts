import { criarClienteServidor } from "@/lib/supabase/server";
import {
  conversaoReal,
  tempoPrimeiraTratativa,
  cicloNegociacao,
  taxaReconciliacao,
  estadoInatividade,
  CRM_PADROES,
  type TicketIndicador,
} from "@/lib/indicadores/crm";
import type { CategoriaOrigem, EtapaTicket, Usuario } from "@/lib/tipos";
import type { Periodo } from "@/lib/datas";

export type CartaoTicket = {
  id: string;
  cliente_nome: string;
  telefone: string | null;
  cpf: string | null;
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  vendedor_id: string | null;
  plano: string | null;
  vendedora: string | null;
  pop: string | null;
  etapa: EtapaTicket;
  criado_em: string;
  atualizado_em: string;
  followup_em: string | null;
  desfecho: "convertido" | "nao_convertido" | null;
  fechado_por: "vendedora" | "auto_inatividade" | null;
  origem_criacao: "sz_auto" | "manual";
  valor: number | null;
  diasNaEtapa: number;
  aviso: "fechar" | "avisar" | "ok";
  fechaEmDias: number;
};

export type FiltrosCrm = {
  busca?: string;
  popId?: string | null;
  vendedorId?: string | null;
  origem?: "sz_auto" | "manual" | null;
  meus?: boolean;
  semVendedor?: boolean;
  semContato24h?: boolean;
  emRisco?: boolean;
  altoValor?: boolean;
};

export type EtapaFunil = {
  etapa: EtapaTicket;
  rotulo: string;
  quantidade: number;
  valor: number;
  /** % de conversão para a próxima etapa (null na última) */
  conversaoPct: number | null;
};

export type DadosCrm = {
  kpis: {
    abertos: number;
    naoAtribuidos: number;
    conversao: ReturnType<typeof conversaoReal>;
    conversaoDeltaPp: number | null;
    pipeline: { valor: number; quantidade: number };
    emRisco: { total: number; semVendedor: number; semContato24h: number };
    primeiraTratativaMin: number | null;
    cicloConvertidoDias: number | null;
    cicloNaoConvertidoDias: number | null;
    reconciliacao: ReturnType<typeof taxaReconciliacao>;
  };
  funilEtapas: EtapaFunil[];
  atencao: {
    semContato48h: number;
    retornosVencidos: number;
    semVendedor: number;
    fechadasHoje: number;
  };
  retornosHoje: CartaoTicket[];
  retornosVencidos: CartaoTicket[];
  fechadosMes: {
    quantidade: number;
    valor: number;
    ultimas: { id: string; cliente: string; valor: number }[];
  };
  perdidosPeriodo: number;
  rodape: {
    receitaSemana: number;
    receitaSemanaDeltaPct: number | null;
    vendedorasComVenda: number;
    vendedorasTotal: number;
    maiorTicketMedio: { nome: string; valor: number } | null;
  };
  followupsHoje: CartaoTicket[];
  colunas: Record<EtapaTicket, CartaoTicket[]>;
  motivosPerda: { motivo: string; quantidade: number }[];
  funil: { etapa: string; quantidade: number }[];
  conversaoPorVendedora: { nome: string; fechados: number; convertidos: number }[];
};

type Bruto = TicketIndicador & {
  id: string;
  cliente_nome: string;
  telefone: string | null;
  vendedor_id: string | null;
  pop_id: string | null;
  followup_em: string | null;
  fechado_por: "vendedora" | "auto_inatividade" | null;
  origem_criacao: "sz_auto" | "manual";
  motivo_id: string | null;
  valor_estimado: number | null;
  etapa_encerramento: string | null;
  cpf: string | null;
  contratos: { sgp_contrato_id: string | null; clientes: { sgp_cliente_id: string | null } | null } | null;
  planos: { nome: string } | null;
  vendedores: { nome: string } | null;
  pops: { nome: string } | null;
  motivos_nao_conversao: { nome: string } | null;
};

const CAMPOS = `id, cliente_nome, telefone, cpf, vendedor_id, pop_id, etapa, criado_em,
  primeira_tratativa_em, followup_em, fechado_em, desfecho, fechado_por, origem_criacao,
  motivo_id, contrato_id, reconciliado_em, atualizado_em, valor_estimado, etapa_encerramento,
  contratos(sgp_contrato_id, clientes(sgp_cliente_id)),
  vendedores(nome), pops(nome), planos(nome), motivos_nao_conversao(nome)`;

/**
 * Painel do CRM (PRD 3.9). Kanban mostra os ABERTOS (estoque) + fechados do
 * período; indicadores 5.14–5.17 seguem os tickets FECHADOS no período.
 * A RLS decide o escopo (vendedora: só os seus; supervisor: o time).
 */
export async function carregarCrm(
  periodo: Periodo,
  usuario: Usuario,
  filtros: FiltrosCrm = {}
): Promise<DadosCrm> {
  const supabase = criarClienteServidor();
  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  const [
    { data: abertosBrutos },
    { data: fechadosBrutos },
    { data: fechadosAntBrutos },
    { data: fechadosMesBrutos },
  ] = await Promise.all([
    supabase.from("tickets").select(CAMPOS).neq("etapa", "fechado").limit(1000),
    supabase
      .from("tickets")
      .select(CAMPOS)
      .eq("etapa", "fechado")
      .gte("fechado_em", `${periodo.de}T00:00:00`)
      .lte("fechado_em", `${periodo.ate}T23:59:59.999`)
      .order("fechado_em", { ascending: false })
      .limit(1000),
    supabase
      .from("tickets")
      .select("desfecho")
      .eq("etapa", "fechado")
      .gte("fechado_em", `${periodo.deAnterior}T00:00:00`)
      .lte("fechado_em", `${periodo.ateAnterior}T23:59:59.999`)
      .limit(1000),
    supabase
      .from("tickets")
      .select("id, cliente_nome, valor_estimado, fechado_em")
      .eq("etapa", "fechado")
      .eq("desfecho", "convertido")
      .gte("fechado_em", `${inicioMes}T00:00:00`)
      .order("fechado_em", { ascending: false })
      .limit(1000),
  ]);

  const todosAbertos = (abertosBrutos ?? []) as unknown as Bruto[];
  const todosFechados = (fechadosBrutos ?? []) as unknown as Bruto[];

  // ---------- filtros do painel (aplicados aos abertos e às perdidas) ----------
  const agora48h = Date.parse(agora) - 48 * 3_600_000;
  const agora24h = Date.parse(agora) - 24 * 3_600_000;
  const casaFiltro = (t: Bruto): boolean => {
    if (filtros.busca) {
      const b = filtros.busca.toLowerCase();
      const tel = (t.telefone ?? "").replace(/\D/g, "");
      if (!t.cliente_nome.toLowerCase().includes(b) && !tel.includes(b.replace(/\D/g, "") || "\u0000"))
        return false;
    }
    if (filtros.popId && t.pop_id !== filtros.popId) return false;
    if (filtros.vendedorId && t.vendedor_id !== filtros.vendedorId) return false;
    if (filtros.origem && t.origem_criacao !== filtros.origem) return false;
    if (filtros.meus && usuario.vendedor_id && t.vendedor_id !== usuario.vendedor_id) return false;
    if (filtros.semVendedor && t.vendedor_id !== null) return false;
    if (filtros.semContato24h && Date.parse(t.atualizado_em) > agora24h) return false;
    if (filtros.emRisco && t.vendedor_id !== null && Date.parse(t.atualizado_em) > agora24h)
      return false;
    if (filtros.altoValor && (t.valor_estimado ?? 0) < 130) return false;
    return true;
  };
  const abertos = todosAbertos.filter(casaFiltro);
  // nos fechados valem os filtros de DIMENSÃO (busca/POP/vendedora/origem/meus);
  // chips de estado (sem contato, risco…) só se aplicam a tickets abertos
  const casaDimensao = (t: Bruto): boolean => {
    if (filtros.busca) {
      const b = filtros.busca.toLowerCase();
      const tel = (t.telefone ?? "").replace(/\D/g, "");
      if (!t.cliente_nome.toLowerCase().includes(b) && !tel.includes(b.replace(/\D/g, "") || "\u0000"))
        return false;
    }
    if (filtros.popId && t.pop_id !== filtros.popId) return false;
    if (filtros.vendedorId && t.vendedor_id !== filtros.vendedorId) return false;
    if (filtros.origem && t.origem_criacao !== filtros.origem) return false;
    if (filtros.meus && usuario.vendedor_id && t.vendedor_id !== usuario.vendedor_id) return false;
    if (filtros.altoValor && (t.valor_estimado ?? 0) < 130) return false;
    return true;
  };
  const fechados = todosFechados.filter(casaDimensao);

  const paraCartao = (t: Bruto): CartaoTicket => {
    const referencia = t.etapa === "fechado" ? t.fechado_em! : t.atualizado_em;
    const est = estadoInatividade(t, agora, crmDiasInatividade());
    return {
      id: t.id,
      cliente_nome: t.cliente_nome,
      telefone: t.telefone,
      cpf: t.cpf,
      sgpContratoId: t.contratos?.sgp_contrato_id ?? null,
      sgpClienteId: t.contratos?.clientes?.sgp_cliente_id ?? null,
      vendedor_id: t.vendedor_id,
      plano: t.planos?.nome ?? null,
      vendedora: t.vendedores?.nome ?? null,
      pop: t.pops?.nome ?? null,
      etapa: t.etapa as EtapaTicket,
      criado_em: t.criado_em,
      atualizado_em: t.atualizado_em,
      followup_em: t.followup_em,
      desfecho: t.desfecho,
      fechado_por: t.fechado_por,
      origem_criacao: t.origem_criacao,
      valor: t.valor_estimado,
      diasNaEtapa: Math.floor((Date.parse(agora) - Date.parse(referencia)) / 86_400_000),
      aviso: est.situacao,
      fechaEmDias: Math.ceil(est.fechaEmDias),
    };
  };

  // padrão RD Station: a perdida fica na coluna do funil onde parou (com o
  // selo "Perdida"); só a vendida vai para a coluna Fechado.
  const colunas: DadosCrm["colunas"] = {
    novo: [],
    em_atendimento: [],
    proposta: [],
    aguardando: [],
    fechado: [],
  };
  for (const t of abertos) {
    colunas[t.etapa as EtapaTicket]?.push(paraCartao(t));
  }
  for (const etapa of ["novo", "em_atendimento", "proposta", "aguardando"] as const) {
    colunas[etapa].sort((a, b) => (a.atualizado_em < b.atualizado_em ? -1 : 1));
  }
  for (const t of fechados) {
    const destino =
      t.desfecho === "nao_convertido" && t.etapa_encerramento && t.etapa_encerramento !== "fechado"
        ? (t.etapa_encerramento as EtapaTicket)
        : "fechado";
    colunas[destino]?.push(paraCartao(t)); // perdidas entram após as abertas da coluna
  }

  // follow-ups de hoje ou atrasados (lembrete na home da vendedora, PRD 3.9)
  const followupsHoje = abertos
    .filter((t) => t.followup_em && t.followup_em.slice(0, 10) <= hoje)
    .map(paraCartao)
    .sort((a, b) => (a.followup_em! < b.followup_em! ? -1 : 1));

  // ---------- blocos do painel (modelo aprovado 22/08) ----------
  const pipeline = {
    valor: abertos.reduce((s2, t) => s2 + (t.valor_estimado ?? 0), 0),
    quantidade: abertos.length,
  };
  const semVendedorLista = abertos.filter((t) => t.vendedor_id === null);
  const semContato24hLista = abertos.filter((t) => Date.parse(t.atualizado_em) <= agora24h);
  const emRisco = {
    semVendedor: semVendedorLista.length,
    semContato24h: semContato24hLista.length,
    total: new Set([...semVendedorLista, ...semContato24hLista].map((t) => t.id)).size,
  };

  // conversão do período anterior (delta em pontos percentuais)
  const fechadosAnt = (fechadosAntBrutos ?? []) as { desfecho: string | null }[];
  const convAnt =
    fechadosAnt.length === 0
      ? null
      : fechadosAnt.filter((t) => t.desfecho === "convertido").length / fechadosAnt.length;
  const conversaoAtual = conversaoReal(fechados);
  const conversaoDeltaPp =
    convAnt === null || conversaoAtual.taxa === null
      ? null
      : (conversaoAtual.taxa - convAnt) * 100;

  // funil com % de passagem entre etapas (acumulado à frente ÷ acumulado atual)
  const convertidosPeriodo = fechados.filter((t) => t.desfecho === "convertido");
  const ORDEM: { etapa: EtapaTicket; rotulo: string }[] = [
    { etapa: "novo", rotulo: "Sem contato" },
    { etapa: "em_atendimento", rotulo: "Contato inicial" },
    { etapa: "proposta", rotulo: "Interessado" },
    { etapa: "aguardando", rotulo: "Criação do contrato" },
    { etapa: "fechado", rotulo: "Contrato assinado" },
  ];
  const qtdPorEtapa = (etapa: EtapaTicket) =>
    etapa === "fechado"
      ? convertidosPeriodo.length
      : abertos.filter((t) => t.etapa === etapa).length;
  const valorPorEtapa = (etapa: EtapaTicket) =>
    etapa === "fechado"
      ? convertidosPeriodo.reduce((s2, t) => s2 + (t.valor_estimado ?? 0), 0)
      : abertos
          .filter((t) => t.etapa === etapa)
          .reduce((s2, t) => s2 + (t.valor_estimado ?? 0), 0);
  const acumulado = ORDEM.map((_, i) =>
    ORDEM.slice(i).reduce((s2, o) => s2 + qtdPorEtapa(o.etapa), 0)
  );
  const funilEtapas: EtapaFunil[] = ORDEM.map((o, i) => ({
    etapa: o.etapa,
    rotulo: o.rotulo,
    quantidade: qtdPorEtapa(o.etapa),
    valor: valorPorEtapa(o.etapa),
    conversaoPct:
      i === ORDEM.length - 1 || acumulado[i] === 0
        ? null
        : Math.round((acumulado[i + 1] / acumulado[i]) * 100),
  }));

  // atenção necessária + retornos
  const retornosHoje = abertos
    .filter((t) => t.followup_em && t.followup_em.slice(0, 10) === hoje)
    .map(paraCartao)
    .sort((a, b) => (a.followup_em! < b.followup_em! ? -1 : 1));
  const retornosVencidos = abertos
    .filter((t) => t.followup_em && t.followup_em.slice(0, 10) < hoje)
    .map(paraCartao)
    .sort((a, b) => (a.followup_em! < b.followup_em! ? -1 : 1));
  const atencao = {
    semContato48h: abertos.filter((t) => Date.parse(t.atualizado_em) <= agora48h).length,
    retornosVencidos: retornosVencidos.length,
    semVendedor: emRisco.semVendedor,
    fechadasHoje: fechados.filter(
      (t) => t.desfecho === "convertido" && (t.fechado_em ?? "").slice(0, 10) === hoje
    ).length,
  };

  // fechados no mês corrente (independe do filtro de período)
  const fm = (fechadosMesBrutos ?? []) as { id: string; cliente_nome: string; valor_estimado: number | null }[];
  const fechadosMes = {
    quantidade: fm.length,
    valor: fm.reduce((s2, t) => s2 + (t.valor_estimado ?? 0), 0),
    ultimas: fm.slice(0, 3).map((t) => ({
      id: t.id,
      cliente: t.cliente_nome.split(/\s+/)[0] ?? t.cliente_nome,
      valor: t.valor_estimado ?? 0,
    })),
  };

  // rodapé: números reais de venda (contratos), no escopo da RLS
  const inicioSemanaIso = (() => {
    const d = new Date(`${hoje}T00:00:00Z`);
    const dia = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - ((dia + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const semanaAntIso = (() => {
    const d = new Date(`${inicioSemanaIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const [{ data: vendasSemana }, { data: vendasSemanaAnt }, { data: vendasMesContratos }, { data: vendedorasAtivas }] =
    await Promise.all([
      supabase
        .from("contratos")
        .select("valor_mensalidade")
        .gte("data_venda", inicioSemanaIso)
        .neq("status", "cancelado")
        .limit(2000),
      supabase
        .from("contratos")
        .select("valor_mensalidade")
        .gte("data_venda", semanaAntIso)
        .lt("data_venda", inicioSemanaIso)
        .neq("status", "cancelado")
        .limit(2000),
      supabase
        .from("contratos")
        .select("vendedor_id, valor_mensalidade, vendedores(nome)")
        .gte("data_venda", inicioMes)
        .neq("status", "cancelado")
        .not("vendedor_id", "is", null)
        .limit(2000),
      supabase.from("vendedores").select("id").eq("ativo", true),
    ]);
  const receitaSemana = (vendasSemana ?? []).reduce((s2, c) => s2 + Number(c.valor_mensalidade ?? 0), 0);
  const receitaAnt = (vendasSemanaAnt ?? []).reduce((s2, c) => s2 + Number(c.valor_mensalidade ?? 0), 0);
  const porVend = new Map<string, { nome: string; total: number; qtd: number }>();
  for (const c of (vendasMesContratos ?? []) as unknown as { vendedor_id: string; valor_mensalidade: number; vendedores: { nome: string } | null }[]) {
    const g = porVend.get(c.vendedor_id) ?? { nome: c.vendedores?.nome ?? "—", total: 0, qtd: 0 };
    g.total += Number(c.valor_mensalidade ?? 0);
    g.qtd += 1;
    porVend.set(c.vendedor_id, g);
  }
  let maiorTicketMedio: DadosCrm["rodape"]["maiorTicketMedio"] = null;
  for (const g of porVend.values()) {
    if (g.qtd < 5) continue;
    const tm = g.total / g.qtd;
    if (!maiorTicketMedio || tm > maiorTicketMedio.valor) maiorTicketMedio = { nome: g.nome, valor: tm };
  }
  const rodape = {
    receitaSemana,
    receitaSemanaDeltaPct: receitaAnt > 0 ? ((receitaSemana - receitaAnt) / receitaAnt) * 100 : null,
    vendedorasComVenda: porVend.size,
    vendedorasTotal: (vendedorasAtivas ?? []).length,
    maiorTicketMedio,
  };
  const perdidosPeriodo = fechados.filter((t) => t.desfecho === "nao_convertido").length;

  // motivos de perda no período (alimenta 3.4)
  const porMotivo = new Map<string, number>();
  for (const t of fechados) {
    if (t.desfecho !== "nao_convertido") continue;
    const nome = t.motivos_nao_conversao?.nome ?? "Sem motivo";
    porMotivo.set(nome, (porMotivo.get(nome) ?? 0) + 1);
  }

  // conversão real por vendedora (5.14)
  const porVendedora = new Map<string, { fechados: number; convertidos: number }>();
  for (const t of fechados) {
    const nome = t.vendedores?.nome ?? "Não atribuído";
    const atual = porVendedora.get(nome) ?? { fechados: 0, convertidos: 0 };
    atual.fechados += 1;
    if (t.desfecho === "convertido") atual.convertidos += 1;
    porVendedora.set(nome, atual);
  }

  // funil do período (3.4): criados no período → proposta → convertidos
  const criadosNoPeriodo = [...abertos, ...fechados].filter(
    (t) => t.criado_em.slice(0, 10) >= periodo.de && t.criado_em.slice(0, 10) <= periodo.ate
  );
  const passouProposta = criadosNoPeriodo.filter(
    (t) =>
      t.etapa === "proposta" ||
      t.etapa === "aguardando" ||
      (t.etapa === "fechado" && t.desfecho === "convertido")
  ).length;

  return {
    kpis: {
      abertos: abertos.length,
      naoAtribuidos: abertos.filter((t) => t.vendedor_id === null).length,
      conversao: conversaoAtual,
      conversaoDeltaPp,
      pipeline,
      emRisco,
      primeiraTratativaMin: tempoPrimeiraTratativa([...abertos, ...fechados]),
      cicloConvertidoDias: cicloNegociacao(fechados, "convertido"),
      cicloNaoConvertidoDias: cicloNegociacao(fechados, "nao_convertido"),
      reconciliacao: taxaReconciliacao(fechados),
    },
    funilEtapas,
    atencao,
    retornosHoje,
    retornosVencidos,
    fechadosMes,
    perdidosPeriodo,
    rodape,
    followupsHoje,
    colunas,
    motivosPerda: [...porMotivo.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    funil: [
      { etapa: "Atendimentos (tickets)", quantidade: criadosNoPeriodo.length },
      { etapa: "Proposta enviada", quantidade: passouProposta },
      {
        etapa: "Convertidos",
        quantidade: criadosNoPeriodo.filter((t) => t.desfecho === "convertido").length,
      },
    ],
    conversaoPorVendedora: [...porVendedora.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.convertidos / Math.max(1, b.fechados) - a.convertidos / Math.max(1, a.fechados)),
  };
}

export function crmDiasInatividade() {
  return Number(process.env.CRM_DIAS_INATIVIDADE ?? CRM_PADROES.diasInatividade);
}

// ---------------------------------------------------------------------------
// Detalhe do ticket
// ---------------------------------------------------------------------------
export type DetalheTicket = {
  id: string;
  cliente_nome: string;
  telefone: string | null;
  cpf: string | null;
  etapa: EtapaTicket;
  origem_criacao: "sz_auto" | "manual";
  sz_conversa_id: string | null;
  vendedor_id: string | null;
  vendedora: string | null;
  pop: string | null;
  criado_em: string;
  primeira_tratativa_em: string | null;
  followup_em: string | null;
  fechado_em: string | null;
  desfecho: "convertido" | "nao_convertido" | null;
  fechado_por: "vendedora" | "auto_inatividade" | null;
  motivo: string | null;
  plano: string | null;
  origem_cadastro: CategoriaOrigem | null;
  contrato_id: string | null;
  contrato_sgp_id: string | null;
  cliente_sgp_id: string | null;
  reconciliado_em: string | null;
  valor_estimado: number | null;
  propostas: {
    id: string;
    plano: string | null;
    velocidade: string | null;
    descricao: string | null;
    valor: number;
    observacao: string | null;
    criado_em: string;
    usuario: string | null;
  }[];
  eventos: { id: string; tipo: string; dados: Record<string, unknown>; criado_em: string; usuario: string | null }[];
};

export async function carregarTicket(id: string): Promise<DetalheTicket | null> {
  const supabase = criarClienteServidor();
  const [{ data: t }, { data: eventos }, { data: propostas }] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        `id, cliente_nome, telefone, cpf, etapa, origem_criacao, sz_conversa_id, vendedor_id,
         criado_em, primeira_tratativa_em, followup_em, fechado_em, desfecho, fechado_por,
         origem_cadastro, contrato_id, reconciliado_em, valor_estimado,
         vendedores(nome), pops(nome), motivos_nao_conversao(nome), planos(nome),
         contratos(sgp_contrato_id, clientes(sgp_cliente_id))`
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("ticket_eventos")
      .select("id, tipo, dados, criado_em, usuarios(nome)")
      .eq("ticket_id", id)
      .order("criado_em", { ascending: false })
      .limit(100),
    supabase
      .from("ticket_propostas")
      .select("id, descricao, valor, observacao, criado_em, planos(nome, velocidade), usuarios(nome)")
      .eq("ticket_id", id)
      .order("criado_em", { ascending: false }),
  ]);
  if (!t) return null;

  type Rel = { nome: string } | null;
  const registro = t as typeof t & {
    vendedores: Rel;
    pops: Rel;
    motivos_nao_conversao: Rel;
    planos: Rel;
    contratos: { sgp_contrato_id: string | null; clientes: { sgp_cliente_id: string | null } | null } | null;
  };

  return {
    id: registro.id,
    cliente_nome: registro.cliente_nome,
    telefone: registro.telefone,
    cpf: registro.cpf,
    etapa: registro.etapa as EtapaTicket,
    origem_criacao: registro.origem_criacao,
    sz_conversa_id: registro.sz_conversa_id,
    vendedor_id: registro.vendedor_id,
    vendedora: registro.vendedores?.nome ?? null,
    pop: registro.pops?.nome ?? null,
    criado_em: registro.criado_em,
    primeira_tratativa_em: registro.primeira_tratativa_em,
    followup_em: registro.followup_em,
    fechado_em: registro.fechado_em,
    desfecho: registro.desfecho,
    fechado_por: registro.fechado_por,
    motivo: registro.motivos_nao_conversao?.nome ?? null,
    plano: registro.planos?.nome ?? null,
    origem_cadastro: registro.origem_cadastro,
    contrato_id: registro.contrato_id,
    contrato_sgp_id: registro.contratos?.sgp_contrato_id ?? null,
    cliente_sgp_id: registro.contratos?.clientes?.sgp_cliente_id ?? null,
    reconciliado_em: registro.reconciliado_em,
    valor_estimado: (registro as { valor_estimado: number | null }).valor_estimado ?? null,
    propostas: (propostas ?? []).map((p) => {
      const pp = p as typeof p & { planos: { nome: string; velocidade: string | null } | null; usuarios: Rel };
      return {
        id: pp.id,
        plano: pp.planos?.nome ?? null,
        velocidade: pp.planos?.velocidade ?? null,
        descricao: pp.descricao,
        valor: Number(pp.valor),
        observacao: pp.observacao,
        criado_em: pp.criado_em,
        usuario: pp.usuarios?.nome ?? null,
      };
    }),
    eventos: (eventos ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      dados: (e.dados ?? {}) as Record<string, unknown>,
      criado_em: e.criado_em,
      usuario: (e.usuarios as unknown as Rel)?.nome ?? null,
    })),
  };
}
