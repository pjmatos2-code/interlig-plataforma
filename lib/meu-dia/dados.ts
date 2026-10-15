import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";
import {
  classificarFollowup,
  contratoSemAssinatura,
  diaLocal,
  diasUteisRestantes,
  metaDoDia,
  pendenciasTicket,
  type PendenciaEsteira,
  type SubFila,
} from "@/lib/meu-dia/regras";
import { rodarJobMeuDia } from "@/lib/meu-dia/job";

/**
 * Meu Dia — Comercial Interno (14/10/2026). Blocos 1–3 e 6 calculados na
 * hora da consulta (o volume por vendedora é pequeno); 4 e 5 vêm do job
 * diário (00h05), com cálculo na hora se o job ainda não rodou hoje.
 */

const EVENTOS_MOVIMENTO = ["nota", "mudanca_etapa", "criacao", "reabertura"];
const ROTULO_ORIGEM: Record<string, string> = {
  sz_auto: "WhatsApp / SZ Chat",
  manual: "Cadastro manual",
  site: "Site",
  sgp_auto: "SGP",
  indicacao: "Indicação",
};

export type CardTicket = {
  id: string;
  cliente: string;
  telefone: string | null;
  origem: string;
  etapa: string;
  criadoEm: string;
  /** referência de tempo do card (aguardando desde / agendado para / parado desde) */
  referencia: string | null;
  proximaAbordagem: string | null;
};

export type CardEsteira = {
  chave: string;
  ticketId: string | null;
  contratoSgp: string | null;
  cliente: string;
  pendencias: PendenciaEsteira[];
  detalhe: string | null;
};

export type CardPosVenda = {
  contratoId: string;
  sgpContratoId: string | null;
  cliente: string;
  telefone: string | null;
  plano: string | null;
  ativadoEm: string;
  boasVindasEm: string | null;
};

export type ItemPendente = { sgp: string; cliente: string; status: string; dataVenda: string };

export type MeuDia = {
  vendedorId: string;
  nome: string;
  hoje: string;
  leads: CardTicket[];
  followup: Record<SubFila, CardTicket[]>;
  esteira: CardEsteira[];
  posvenda: CardPosVenda[];
  pendentes90: { total: number; lista: ItemPendente[]; calculadoEm: string | null };
  meta: {
    metaMes: number;
    realizadoMes: number;
    realizadoHoje: number;
    metaDia: number;
    batida: boolean;
    falta: number;
    diasRestantes: number;
    pct: number;
  };
  abertos: number;
  concluidosHoje: number;
};

export async function vendedorDoMeuDia(usuarioId: string): Promise<{ id: string; nome: string; pop_id: string | null } | null> {
  const { data } = await criarClienteAdmin()
    .from("vendedores")
    .select("id, nome, pop_id")
    .eq("usuario_id", usuarioId)
    .eq("meu_dia", true)
    .eq("ativo", true)
    .maybeSingle();
  return (data as { id: string; nome: string; pop_id: string | null } | null) ?? null;
}

export async function carregarMeuDia(vendedorId: string): Promise<MeuDia> {
  const admin = criarClienteAdmin();
  const agora = new Date().toISOString();
  const hoje = hojeIso();
  const mes = primeiroDiaDoMes(hoje);
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const ha60 = new Date(Date.parse(`${hoje}T12:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10);
  const inicioHoje = `${hoje}T00:00:00-03:00`;

  const camposTicket =
    "id, cliente_nome, telefone, origem_criacao, etapa, criado_em, followup_em, urgencia, atualizado_em, desfecho, fechado_em, adiantamento_valor, adiantamento_recebido_em, score_faixa, proxima_abordagem";
  const [
    { data: vend },
    { data: abertos },
    { data: convertidos },
    { data: contratos },
    { data: vendasMes },
    { data: meta },
    { data: cal },
    { data: posv },
    { data: diario },
    { count: concluidosHoje },
  ] = await Promise.all([
    admin.from("vendedores").select("nome").eq("id", vendedorId).maybeSingle(),
    admin.from("tickets").select(camposTicket).eq("vendedor_id", vendedorId).neq("etapa", "fechado").limit(500),
    admin
      .from("tickets")
      .select(camposTicket)
      .eq("vendedor_id", vendedorId)
      .eq("desfecho", "convertido")
      .gte("fechado_em", ha30)
      .gt("adiantamento_valor", 0)
      .is("adiantamento_recebido_em", null)
      .limit(200),
    admin
      .from("contratos")
      .select("id, sgp_contrato_id, status, data_venda, termo_adesao_assinado, fidelidade_assinada, assinatura_dispensada, desistencia_em, clientes(nome)")
      .eq("vendedor_id", vendedorId)
      .gte("data_venda", ha60)
      .limit(500),
    admin
      .from("contratos")
      .select("data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, valor_mensalidade")
      .eq("vendedor_id", vendedorId)
      .gte("data_venda", mes)
      .lte("data_venda", hoje)
      .limit(1000),
    admin.from("metas").select("quantidade_vendas").eq("escopo", "vendedora").eq("referencia_id", vendedorId).eq("mes_ano", mes).maybeSingle(),
    admin.from("calendario").select("data, dia_util").gte("data", mes).lte("data", ultimoDiaDoMes(hoje)),
    admin
      .from("meu_dia_posvenda")
      .select("contrato_id, ativado_em, boas_vindas_em, contratos(sgp_contrato_id, clientes(nome, telefone), planos(nome))")
      .eq("vendedor_id", vendedorId)
      .is("resultado", null)
      .order("ativado_em"),
    admin.from("meu_dia_diario").select("pendentes_90, pendentes_lista, calculado_em").eq("vendedor_id", vendedorId).eq("data", hoje).maybeSingle(),
    admin.from("meu_dia_log").select("id", { count: "exact", head: true }).eq("vendedor_id", vendedorId).gte("criado_em", inicioHoje),
  ]);

  const tks = abertos ?? [];
  const ids = [...tks, ...(convertidos ?? [])].map((t) => t.id as string);
  const eventos: { ticket_id: string; tipo: string; criado_em: string; usuario_id: string | null }[] = [];
  const propostas = new Map<string, number>();
  const consultas = new Map<string, number>();
  const acoes: { ticket_id: string; quando: string; criado_em: string; concluida_em: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [{ data: ev }, { data: pr }, { data: co }, { data: ac }] = await Promise.all([
      admin.from("ticket_eventos").select("ticket_id, tipo, criado_em, usuario_id").in("ticket_id", lote).in("tipo", EVENTOS_MOVIMENTO).limit(5000),
      admin.from("ticket_propostas").select("ticket_id, criado_em").in("ticket_id", lote).limit(5000),
      admin.from("consultas_credito").select("ticket_id").in("ticket_id", lote).limit(5000),
      admin.from("ticket_acoes").select("ticket_id, quando, criado_em, concluida_em").in("ticket_id", lote).limit(5000),
    ]);
    eventos.push(...((ev ?? []) as typeof eventos));
    for (const p of pr ?? []) propostas.set(p.ticket_id as string, (propostas.get(p.ticket_id as string) ?? 0) + 1);
    for (const c of co ?? []) consultas.set(c.ticket_id as string, (consultas.get(c.ticket_id as string) ?? 0) + 1);
    acoes.push(...((ac ?? []) as typeof acoes));
    // proposta também é movimentação
    for (const p of pr ?? []) eventos.push({ ticket_id: p.ticket_id as string, tipo: "proposta", criado_em: p.criado_em as string, usuario_id: "x" });
  }
  const ultimaMov = new Map<string, string>();
  const tratativaHoje = new Set<string>();
  for (const e of eventos) {
    if ((ultimaMov.get(e.ticket_id) ?? "") < e.criado_em) ultimaMov.set(e.ticket_id, e.criado_em);
    if (e.tipo === "nota" && e.usuario_id && diaLocal(e.criado_em) === hoje) tratativaHoje.add(e.ticket_id);
  }
  for (const a of acoes) {
    for (const t of [a.criado_em, a.concluida_em]) if (t && (ultimaMov.get(a.ticket_id) ?? "") < t) ultimaMov.set(a.ticket_id, t);
  }

  const card = (t: Record<string, unknown>, referencia: string | null): CardTicket => ({
    id: t.id as string,
    cliente: t.cliente_nome as string,
    telefone: (t.telefone as string | null) ?? null,
    origem: ROTULO_ORIGEM[String(t.origem_criacao)] ?? String(t.origem_criacao ?? ""),
    etapa: t.etapa as string,
    criadoEm: t.criado_em as string,
    referencia,
    proximaAbordagem: (t.proxima_abordagem as string | null) ?? null,
  });

  // ---- Bloco 1: leads aguardando (Sem contato), mais antigo primeiro
  const leads = tks
    .filter((t) => t.etapa === "novo")
    .sort((a, b) => ((a.criado_em as string) < (b.criado_em as string) ? -1 : 1))
    .map((t) => card(t, t.criado_em as string));

  // ---- Bloco 2: follow-up
  const followup: Record<SubFila, CardTicket[]> = { atrasado: [], hoje: [], urgencia: [], parada: [] };
  for (const t of tks) {
    const id = t.id as string;
    const lembretes = acoes.filter((a) => a.ticket_id === id && !a.concluida_em).map((a) => a.quando);
    const fila = classificarFollowup(
      {
        etapa: t.etapa as string,
        followupEm: (t.followup_em as string | null) ?? null,
        urgencia: (t.urgencia as string | null) ?? null,
        ultimaMovimentacao: ultimaMov.get(id) ?? (t.criado_em as string),
        lembretesPendentes: lembretes,
        tratativaHoje: tratativaHoje.has(id),
      },
      agora
    );
    if (!fila) continue;
    const agendados = [...(t.followup_em ? [t.followup_em as string] : []), ...lembretes].sort();
    const ref = fila === "parada" ? ultimaMov.get(id) ?? (t.criado_em as string) : fila === "urgencia" ? null : agendados[0] ?? null;
    followup[fila].push(card(t, ref));
  }
  for (const k of Object.keys(followup) as SubFila[]) followup[k].sort((a, b) => ((a.referencia ?? "") < (b.referencia ?? "") ? -1 : 1));

  // ---- Bloco 3: esteira
  const esteira: CardEsteira[] = [];
  for (const t of [...tks, ...(convertidos ?? [])]) {
    const p = pendenciasTicket({
      etapa: t.etapa as string,
      desfecho: (t.desfecho as string | null) ?? null,
      propostas: propostas.get(t.id as string) ?? 0,
      consultas: consultas.get(t.id as string) ?? 0,
      adiantamentoValor: t.adiantamento_valor === null ? null : Number(t.adiantamento_valor),
      adiantamentoRecebidoEm: (t.adiantamento_recebido_em as string | null) ?? null,
      scoreFaixa: (t.score_faixa as string | null) ?? null,
    });
    if (p.length)
      esteira.push({
        chave: `t${t.id}`,
        ticketId: t.id as string,
        contratoSgp: null,
        cliente: t.cliente_nome as string,
        pendencias: p,
        detalhe: p.includes("adiantamento") ? `Adiantamento recomendado: R$ ${Number(t.adiantamento_valor).toFixed(2).replace(".", ",")}` : null,
      });
  }
  for (const c of contratos ?? []) {
    const sem = contratoSemAssinatura({
      status: c.status as string,
      termoAssinado: (c.termo_adesao_assinado as boolean | null) ?? null,
      fidelidadeAssinada: (c.fidelidade_assinada as boolean | null) ?? null,
      assinaturaDispensada: (c.assinatura_dispensada as boolean | null) ?? null,
      desistenciaEm: (c.desistencia_em as string | null) ?? null,
    });
    if (!sem) continue;
    const falta = [!c.termo_adesao_assinado ? "termo" : null, !c.fidelidade_assinada ? "fidelidade" : null].filter(Boolean).join(" e ");
    esteira.push({
      chave: `c${c.id}`,
      ticketId: null,
      contratoSgp: (c.sgp_contrato_id as string | null) ?? null,
      cliente: (c.clientes as unknown as { nome: string } | null)?.nome ?? "—",
      pendencias: ["sem_assinatura"],
      detalhe: `Falta ${falta} · vendido em ${String(c.data_venda).split("-").reverse().join("/")}`,
    });
  }

  // ---- Bloco 4: pós-venda (gerado pelo job)
  const posvenda: CardPosVenda[] = (posv ?? []).map((p) => {
    const c = p.contratos as unknown as { sgp_contrato_id: string | null; clientes: { nome: string; telefone: string | null } | null; planos: { nome: string } | null } | null;
    return {
      contratoId: p.contrato_id as string,
      sgpContratoId: c?.sgp_contrato_id ?? null,
      cliente: c?.clientes?.nome ?? "—",
      telefone: c?.clientes?.telefone ?? null,
      plano: c?.planos?.nome ?? null,
      ativadoEm: p.ativado_em as string,
      boasVindasEm: (p.boas_vindas_em as string | null) ?? null,
    };
  });

  // ---- Bloco 5: pendentes 90+ (job; se ainda não rodou hoje, calcula agora)
  let d5 = diario as { pendentes_90: number; pendentes_lista: ItemPendente[]; calculado_em: string } | null;
  if (!d5) {
    await rodarJobMeuDia({ vendedorIds: [vendedorId], hoje }).catch((e) => console.error("meu dia (sob demanda):", e));
    const { data: novo } = await admin.from("meu_dia_diario").select("pendentes_90, pendentes_lista, calculado_em").eq("vendedor_id", vendedorId).eq("data", hoje).maybeSingle();
    d5 = (novo as typeof d5) ?? null;
  }

  // ---- Bloco 6: meta
  const vendas = (vendasMes ?? []) as ContratoIndicador[];
  const realizadoMes = vendasDoPeriodo(vendas, mes, hoje).length;
  const realizadoHoje = vendasDoPeriodo(vendas, hoje, hoje).length;
  const metaMes = Number(meta?.quantidade_vendas ?? 0);
  const diasRestantes = diasUteisRestantes((cal ?? []) as { data: string; dia_util: boolean }[], hoje);
  const md = metaDoDia(metaMes, realizadoMes, diasRestantes);

  const abertosTotal =
    leads.length + Object.values(followup).reduce((s, l) => s + l.length, 0) + esteira.length + posvenda.length;

  return {
    vendedorId,
    nome: (vend?.nome as string) ?? "",
    hoje,
    leads,
    followup,
    esteira,
    posvenda,
    pendentes90: { total: d5?.pendentes_90 ?? 0, lista: d5?.pendentes_lista ?? [], calculadoEm: d5?.calculado_em ?? null },
    meta: {
      metaMes,
      realizadoMes,
      realizadoHoje,
      metaDia: md.metaDia,
      batida: md.batida,
      falta: md.falta,
      diasRestantes,
      pct: metaMes > 0 ? Math.round((realizadoMes / metaMes) * 100) : 0,
    },
    abertos: abertosTotal,
    concluidosHoje: concluidosHoje ?? 0,
  };
}

/** Visão do gestor: todas as vendedoras do piloto (filtro opcional de unidade) */
export async function carregarEquipeMeuDia(popId?: string | null): Promise<(MeuDia & { pop: string | null })[]> {
  const admin = criarClienteAdmin();
  let q = admin.from("vendedores").select("id, pop_id, pops(nome)").eq("meu_dia", true).eq("ativo", true).order("nome");
  if (popId) q = q.eq("pop_id", popId);
  const { data } = await q;
  const saida: (MeuDia & { pop: string | null })[] = [];
  for (const v of data ?? []) {
    const d = await carregarMeuDia(v.id as string);
    saida.push({ ...d, pop: (v.pops as unknown as { nome: string } | null)?.nome ?? null });
  }
  return saida;
}
