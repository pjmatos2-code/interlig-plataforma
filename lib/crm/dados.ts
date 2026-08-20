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
  vendedora: string | null;
  pop: string | null;
  etapa: EtapaTicket;
  criado_em: string;
  atualizado_em: string;
  followup_em: string | null;
  desfecho: "convertido" | "nao_convertido" | null;
  fechado_por: "vendedora" | "auto_inatividade" | null;
  origem_criacao: "sz_auto" | "manual";
  diasNaEtapa: number;
  aviso: "fechar" | "avisar" | "ok";
  fechaEmDias: number;
};

export type DadosCrm = {
  kpis: {
    abertos: number;
    naoAtribuidos: number;
    conversao: ReturnType<typeof conversaoReal>;
    primeiraTratativaMin: number | null;
    cicloConvertidoDias: number | null;
    cicloNaoConvertidoDias: number | null;
    reconciliacao: ReturnType<typeof taxaReconciliacao>;
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
  vendedores: { nome: string } | null;
  pops: { nome: string } | null;
  motivos_nao_conversao: { nome: string } | null;
};

const CAMPOS = `id, cliente_nome, telefone, vendedor_id, pop_id, etapa, criado_em,
  primeira_tratativa_em, followup_em, fechado_em, desfecho, fechado_por, origem_criacao,
  motivo_id, contrato_id, reconciliado_em, atualizado_em,
  vendedores(nome), pops(nome), motivos_nao_conversao(nome)`;

/**
 * Painel do CRM (PRD 3.9). Kanban mostra os ABERTOS (estoque) + fechados do
 * período; indicadores 5.14–5.17 seguem os tickets FECHADOS no período.
 * A RLS decide o escopo (vendedora: só os seus; supervisor: o time).
 */
export async function carregarCrm(periodo: Periodo, usuario: Usuario): Promise<DadosCrm> {
  const supabase = criarClienteServidor();
  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);

  const [{ data: abertosBrutos }, { data: fechadosBrutos }] = await Promise.all([
    supabase.from("tickets").select(CAMPOS).neq("etapa", "fechado").limit(1000),
    supabase
      .from("tickets")
      .select(CAMPOS)
      .eq("etapa", "fechado")
      .gte("fechado_em", `${periodo.de}T00:00:00`)
      .lte("fechado_em", `${periodo.ate}T23:59:59.999`)
      .order("fechado_em", { ascending: false })
      .limit(1000),
  ]);

  const abertos = (abertosBrutos ?? []) as unknown as Bruto[];
  const fechados = (fechadosBrutos ?? []) as unknown as Bruto[];

  const paraCartao = (t: Bruto): CartaoTicket => {
    const referencia = t.etapa === "fechado" ? t.fechado_em! : t.atualizado_em;
    const est = estadoInatividade(t, agora, crmDiasInatividade());
    return {
      id: t.id,
      cliente_nome: t.cliente_nome,
      telefone: t.telefone,
      vendedora: t.vendedores?.nome ?? null,
      pop: t.pops?.nome ?? null,
      etapa: t.etapa as EtapaTicket,
      criado_em: t.criado_em,
      atualizado_em: t.atualizado_em,
      followup_em: t.followup_em,
      desfecho: t.desfecho,
      fechado_por: t.fechado_por,
      origem_criacao: t.origem_criacao,
      diasNaEtapa: Math.floor((Date.parse(agora) - Date.parse(referencia)) / 86_400_000),
      aviso: est.situacao,
      fechaEmDias: Math.ceil(est.fechaEmDias),
    };
  };

  const colunas: DadosCrm["colunas"] = {
    novo: [],
    em_atendimento: [],
    proposta: [],
    aguardando: [],
    fechado: fechados.map(paraCartao),
  };
  for (const t of abertos) {
    colunas[t.etapa as EtapaTicket]?.push(paraCartao(t));
  }
  for (const etapa of ["novo", "em_atendimento", "proposta", "aguardando"] as const) {
    colunas[etapa].sort((a, b) => (a.atualizado_em < b.atualizado_em ? -1 : 1));
  }

  // follow-ups de hoje ou atrasados (lembrete na home da vendedora, PRD 3.9)
  const followupsHoje = abertos
    .filter((t) => t.followup_em && t.followup_em.slice(0, 10) <= hoje)
    .map(paraCartao)
    .sort((a, b) => (a.followup_em! < b.followup_em! ? -1 : 1));

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
      conversao: conversaoReal(fechados),
      primeiraTratativaMin: tempoPrimeiraTratativa([...abertos, ...fechados]),
      cicloConvertidoDias: cicloNegociacao(fechados, "convertido"),
      cicloNaoConvertidoDias: cicloNegociacao(fechados, "nao_convertido"),
      reconciliacao: taxaReconciliacao(fechados),
    },
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
  reconciliado_em: string | null;
  eventos: { id: string; tipo: string; dados: Record<string, unknown>; criado_em: string; usuario: string | null }[];
};

export async function carregarTicket(id: string): Promise<DetalheTicket | null> {
  const supabase = criarClienteServidor();
  const [{ data: t }, { data: eventos }] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        `id, cliente_nome, telefone, cpf, etapa, origem_criacao, sz_conversa_id, vendedor_id,
         criado_em, primeira_tratativa_em, followup_em, fechado_em, desfecho, fechado_por,
         origem_cadastro, contrato_id, reconciliado_em,
         vendedores(nome), pops(nome), motivos_nao_conversao(nome), planos(nome)`
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("ticket_eventos")
      .select("id, tipo, dados, criado_em, usuarios(nome)")
      .eq("ticket_id", id)
      .order("criado_em", { ascending: false })
      .limit(100),
  ]);
  if (!t) return null;

  type Rel = { nome: string } | null;
  const registro = t as typeof t & {
    vendedores: Rel;
    pops: Rel;
    motivos_nao_conversao: Rel;
    planos: Rel;
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
    reconciliado_em: registro.reconciliado_em,
    eventos: (eventos ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      dados: (e.dados ?? {}) as Record<string, unknown>,
      criado_em: e.criado_em,
      usuario: (e.usuarios as unknown as Rel)?.nome ?? null,
    })),
  };
}
