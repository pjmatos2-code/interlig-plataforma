import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarConfig, carregarDiasUteis } from "../config-servidor";
import { todas } from "./paginar";
import type { EscopoPerformance } from "../escopo";
import type { PeriodoPerf } from "../periodo";
import type { Reatribuicao } from "../regras/atribuicao";
import type {
  AcaoHumana,
  AnaliseBase,
  BaseDados,
  ContratoBase,
  ConversaBase,
  FollowupBase,
  IndisponibilidadeBase,
  MetaBase,
  PropostaBase,
  TicketBase,
  TituloBase,
  VendedorBase,
} from "./base";

/**
 * Carrega, de uma vez, tudo o que a apuração precisa para o período, o
 * comparativo e as coortes de qualidade (24/10/2026). Lê só do banco
 * (CLAUDE.md: tela nunca consulta API externa). O escopo do usuário limita
 * os vendedores; tickets e conversas vêm inteiros porque um lead pode ter
 * passado por mais de um vendedor (atribuição exige o histórico todo).
 */

const somaDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const inicioDoDia = (iso: string) => `${iso}T00:00:00-03:00`;

/** tempos de cada etapa no log (PERF_TEMPOS=1) — observabilidade da apuração */
function cronometro() {
  const t0 = Date.now();
  let ultimo = t0;
  return (etapa: string) => {
    if (process.env.PERF_TEMPOS !== "1") return;
    const agora = Date.now();
    console.log(`[performance] ${etapa}: ${agora - ultimo} ms (total ${agora - t0} ms)`);
    ultimo = agora;
  };
}

export async function carregarBase(escopo: EscopoPerformance, periodo: PeriodoPerf): Promise<BaseDados> {
  const marca = cronometro();
  const admin = criarClienteAdmin();
  const [cfg, { data: vends }, { data: pops }, { data: usuarios }, { data: extras }] = await Promise.all([
    carregarConfig(),
    admin.from("vendedores").select("id, nome, setor, pop_id, coordenador_id, foto_url, ativo, eh_coordenador, admitido_em"),
    admin.from("pops").select("id, nome"),
    admin.from("usuarios").select("id, nome, vendedor_id"),
    admin.from("coordenadores_extras").select("usuario_id, vendedor_id"),
  ]);
  marca("config, vendedores, pops, usuarios");
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const inicioCarga = [periodo.deAnterior, somaDias(periodo.de, -60)].sort()[0];
  const inicioContratos = [somaDias(periodo.ate, -(90 + cfg.qualidade.janela_dias + 60)), somaDias(periodo.deAnterior, -1)].sort()[0];
  const fimCarga = `${periodo.ate}T23:59:59.999-03:00`;

  // ---------- vendedores no escopo
  const nomePop = new Map((pops ?? []).map((p) => [p.id as string, p.nome as string]));
  const nomeUsuario = new Map((usuarios ?? []).map((u) => [u.id as string, u.nome as string]));
  const usuarioParaVendedor = new Map((usuarios ?? []).filter((u) => u.vendedor_id).map((u) => [u.id as string, u.vendedor_id as string]));
  const coordExtra = new Map<string, string>();
  for (const e of extras ?? []) if (!coordExtra.has(e.vendedor_id as string)) coordExtra.set(e.vendedor_id as string, e.usuario_id as string);
  const vendedores: VendedorBase[] = (vends ?? [])
    .filter((v) => escopo.vendedorIds === null || escopo.vendedorIds.includes(v.id as string))
    .map((v) => {
      const coord = (v.coordenador_id as string | null) ?? coordExtra.get(v.id as string) ?? null;
      return {
        id: v.id as string,
        nome: v.nome as string,
        setor: (v.setor as string | null) ?? null,
        pop_id: (v.pop_id as string | null) ?? null,
        pop_nome: v.pop_id ? (nomePop.get(v.pop_id as string) ?? null) : null,
        coordenador_id: coord,
        coordenador_nome: coord ? (nomeUsuario.get(coord) ?? null) : null,
        foto_url: (v.foto_url as string | null) ?? null,
        ativo: Boolean(v.ativo),
        eh_coordenador: Boolean(v.eh_coordenador),
        admitido_em: (v.admitido_em as string | null) ?? null,
      };
    });
  const ids = vendedores.map((v) => v.id);
  const idsOuNenhum = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

  // contratos primeiro; a 1ª fatura e as OS saem assim que eles chegam, em
  // paralelo com o resto (200 ids por lote: mais que isso estoura a URL do
  // PostgREST — e erro aqui nunca pode virar "sem dado" calado)
  const contratosP = todas<Record<string, unknown>>((de, ate) =>
    admin
      .from("contratos")
      .select("id, vendedor_id, pop_id, plano_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, origem_cadastro")
      .in("vendedor_id", idsOuNenhum)
      .gte("data_venda", inicioContratos)
      .order("id")
      .range(de, ate)
  );
  const titulosEOsP = contratosP.then(async (lista) => {
    const idsC = lista.map((c) => c.id as string);
    const lotes: string[][] = [];
    for (let i = 0; i < idsC.length; i += 200) lotes.push(idsC.slice(i, i + 200));
    const [tl, ol] = await Promise.all([
      Promise.all(lotes.map((l) => admin.from("titulos").select("contrato_id, vencimento, data_pagamento, status").eq("numero_parcela", 1).in("contrato_id", l))),
      Promise.all(lotes.map((l) => admin.from("os_instalacao").select("contrato_id").not("agendamento", "is", null).in("contrato_id", l))),
    ]);
    for (const r of [...tl, ...ol]) if (r.error) throw new Error(`carregar títulos/OS: ${r.error.message}`);
    return [tl.flatMap((r) => (r.data ?? []) as Record<string, unknown>[]), ol.flatMap((r) => (r.data ?? []) as Record<string, unknown>[])] as const;
  });

  const [ticketsBrutos, eventos, propostasBrutas, visitas, conversasBrutas, followupsBrutos, contratosBrutos, metasBrutas, indisp, analisesBrutas, ehDiaUtil, { data: motivosBrutos }, { data: planosBrutos }, [titulosBrutos, osBrutas]] =
    await Promise.all([
      todas<Record<string, unknown>>((de, ate) =>
        admin
          .from("tickets")
          .select("id, cliente_nome, vendedor_id, pop_id, etapa, desfecho, origem_criacao, criado_em, fechado_em, followup_em, telefone, contrato_id, urgencia, valor_estimado, reaberto_de_id, motivo_id, etapa_encerramento, plano_id, contratos!tickets_contrato_id_fkey(data_venda)")
          .lte("criado_em", fimCarga)
          .or(`etapa.neq.fechado,fechado_em.gte.${inicioDoDia(inicioCarga)}`)
          .order("id")
          .range(de, ate)
      ),
      todas<Record<string, unknown>>((de, ate) =>
        admin
          .from("ticket_eventos")
          .select("ticket_id, tipo, dados, usuario_id, criado_em")
          .in("tipo", ["reatribuicao", "nota", "mudanca_etapa", "fechamento", "reabertura"])
          .gte("criado_em", inicioDoDia(somaDias(inicioCarga, -120)))
          .lte("criado_em", fimCarga)
          .order("id")
          .range(de, ate)
      ),
      todas<Record<string, unknown>>((de, ate) =>
        admin.from("ticket_propostas").select("ticket_id, criado_por, criado_em, valor").gte("criado_em", inicioDoDia(inicioCarga)).lte("criado_em", fimCarga).order("id").range(de, ate)
      ),
      todas<Record<string, unknown>>((de, ate) =>
        admin.from("visitas_externas").select("ticket_id, vendedor_id, criado_em").gte("criado_em", inicioDoDia(inicioCarga)).lte("criado_em", fimCarga).order("id").range(de, ate)
      ),
      todas<Record<string, unknown>>((de, ate) =>
        admin
          .from("conversas_atendimento")
          .select("id, ticket_id, vendedor_id, pop_id, canal, equipe, iniciada_por, iniciada_em, finalizada_em, primeira_resposta_em, primeira_resposta_vendedor_id, primeira_resposta_seg, primeira_resposta_util_seg, cliente_sem_resposta, msgs_cliente, msgs_agente, msgs_automacao, por_agente, cliente_por_dia, status_final")
          .gte("finalizada_em", inicioDoDia(somaDias(inicioCarga, -1)))
          .lte("iniciada_em", fimCarga)
          .order("id")
          .range(de, ate)
      ),
      todas<Record<string, unknown>>((de, ate) =>
        admin.from("followups").select("id, ticket_id, vendedor_id, origem, status, prazo, concluido_em, prioridade, tipo, motivo, proximo_passo, evidencia, criado_em").gte("prazo", inicioDoDia(inicioCarga)).order("id").range(de, ate)
      ),
      contratosP,
      todas<Record<string, unknown>>((de, ate) =>
        admin
          .from("metas")
          .select("referencia_id, mes_ano, quantidade_vendas, receita")
          .eq("escopo", "vendedora")
          .gte("mes_ano", `${inicioCarga.slice(0, 7)}-01`)
          .lte("mes_ano", `${periodo.ate.slice(0, 7)}-01`)
          .order("id")
          .range(de, ate)
      ),
      todas<Record<string, unknown>>((de, ate) =>
        admin.from("indisponibilidades_vendedor").select("vendedor_id, inicio, fim, tipo").lte("inicio", periodo.ate).gte("fim", inicioCarga).order("id").range(de, ate)
      ),
      todas<Record<string, unknown>>((de, ate) =>
        admin
          .from("analises_conversa")
          .select("conversa_id, ticket_id, vendedor_id, concluido_em, score_atendimento, temperatura, intencao_compra, objecoes, status_lead, prioridade_lead, resultado, revisao")
          .eq("status", "concluida")
          .gte("concluido_em", inicioDoDia(inicioCarga))
          .order("id")
          .range(de, ate)
      ),
      carregarDiasUteis(somaDias(inicioContratos, -30), somaDias(periodo.ate, 60)),
      admin.from("motivos_nao_conversao").select("id, nome"),
      admin.from("planos").select("id, nome"),
      titulosEOsP,
    ]);

  marca("consultas principais (paralelas)");
  const tickets: TicketBase[] = ticketsBrutos.map((t) => ({
    id: t.id as string,
    cliente_nome: (t.cliente_nome as string | null) ?? null,
    vendedor_id: (t.vendedor_id as string | null) ?? null,
    pop_id: (t.pop_id as string | null) ?? null,
    etapa: t.etapa as string,
    desfecho: (t.desfecho as string | null) ?? null,
    origem_criacao: t.origem_criacao as string,
    criado_em: t.criado_em as string,
    fechado_em: (t.fechado_em as string | null) ?? null,
    followup_em: (t.followup_em as string | null) ?? null,
    telefone: (t.telefone as string | null) ?? null,
    contrato_id: (t.contrato_id as string | null) ?? null,
    data_venda_contrato: ((t.contratos as { data_venda?: string } | null)?.data_venda as string | undefined) ?? null,
    urgencia: (t.urgencia as string | null) ?? null,
    valor_estimado: t.valor_estimado === null || t.valor_estimado === undefined ? null : Number(t.valor_estimado),
    reaberto_de_id: (t.reaberto_de_id as string | null) ?? null,
    motivo_id: (t.motivo_id as string | null) ?? null,
    etapa_encerramento: (t.etapa_encerramento as string | null) ?? null,
    plano_id: (t.plano_id as string | null) ?? null,
  }));

  const reatribuicoes = new Map<string, Reatribuicao[]>();
  const acoes: AcaoHumana[] = [];
  for (const e of eventos) {
    const tid = e.ticket_id as string;
    const dados = (e.dados ?? {}) as Record<string, unknown>;
    if (e.tipo === "reatribuicao") {
      const lista = reatribuicoes.get(tid) ?? [];
      lista.push({ em: e.criado_em as string, de: (dados.de as string | null) ?? null, para: (dados.para as string | null) ?? null });
      reatribuicoes.set(tid, lista);
      continue;
    }
    // só ação de GENTE (usuario_id preenchido); rotinas e robô gravam sem usuário
    if (!e.usuario_id) continue;
    const fonte = e.tipo === "nota" ? "tratativa" : e.tipo === "mudanca_etapa" ? "etapa" : e.tipo === "fechamento" ? "fechamento" : "reabertura";
    acoes.push({ ticketId: tid, vendedorId: usuarioParaVendedor.get(e.usuario_id as string) ?? null, em: Date.parse(e.criado_em as string), fonte });
  }
  const propostas: PropostaBase[] = propostasBrutas.map((p) => ({
    ticket_id: p.ticket_id as string,
    vendedor_id: p.criado_por ? (usuarioParaVendedor.get(p.criado_por as string) ?? null) : null,
    em: Date.parse(p.criado_em as string),
    valor: p.valor === null || p.valor === undefined ? null : Number(p.valor),
  }));
  for (const p of propostas) acoes.push({ ticketId: p.ticket_id, vendedorId: p.vendedor_id, em: p.em, fonte: "proposta" });
  for (const v of visitas)
    if (v.ticket_id) acoes.push({ ticketId: v.ticket_id as string, vendedorId: (v.vendedor_id as string | null) ?? null, em: Date.parse(v.criado_em as string), fonte: "visita" });

  const conversas: ConversaBase[] = conversasBrutas.map((c) => ({
    id: c.id as string,
    ticket_id: (c.ticket_id as string | null) ?? null,
    vendedor_id: (c.vendedor_id as string | null) ?? null,
    pop_id: (c.pop_id as string | null) ?? null,
    canal: (c.canal as string | null) ?? null,
    equipe: (c.equipe as string | null) ?? null,
    iniciada_por: (c.iniciada_por as string | null) ?? null,
    iniciada_em: (c.iniciada_em as string | null) ?? null,
    finalizada_em: (c.finalizada_em as string | null) ?? null,
    primeira_resposta_em: (c.primeira_resposta_em as string | null) ?? null,
    primeira_resposta_vendedor_id: (c.primeira_resposta_vendedor_id as string | null) ?? null,
    primeira_resposta_seg: (c.primeira_resposta_seg as number | null) ?? null,
    primeira_resposta_util_seg: (c.primeira_resposta_util_seg as number | null) ?? null,
    cliente_sem_resposta: Boolean(c.cliente_sem_resposta),
    msgs_cliente: Number(c.msgs_cliente ?? 0),
    msgs_agente: Number(c.msgs_agente ?? 0),
    msgs_automacao: Number(c.msgs_automacao ?? 0),
    por_agente: (c.por_agente ?? {}) as ConversaBase["por_agente"],
    cliente_por_dia: (c.cliente_por_dia ?? {}) as Record<string, number>,
    status_final: (c.status_final as string | null) ?? null,
  }));

  const followups: FollowupBase[] = followupsBrutos.map((f) => ({
    id: f.id as string,
    ticket_id: f.ticket_id as string,
    vendedor_id: (f.vendedor_id as string | null) ?? null,
    origem: f.origem as string,
    status: f.status as string,
    prazo: f.prazo as string,
    concluido_em: (f.concluido_em as string | null) ?? null,
    prioridade: f.prioridade as string,
    tipo: f.tipo as string,
    motivo: (f.motivo as string | null) ?? null,
    proximo_passo: (f.proximo_passo as string | null) ?? null,
    evidencia: (f.evidencia as string | null) ?? null,
    criado_em: f.criado_em as string,
  }));

  const contratos: ContratoBase[] = contratosBrutos.map((c) => ({
    id: c.id as string,
    vendedor_id: (c.vendedor_id as string | null) ?? null,
    pop_id: (c.pop_id as string | null) ?? null,
    plano_id: (c.plano_id as string | null) ?? null,
    data_venda: c.data_venda as string,
    data_assinatura: (c.data_assinatura as string | null) ?? null,
    data_ativacao: (c.data_ativacao as string | null) ?? null,
    data_cancelamento: (c.data_cancelamento as string | null) ?? null,
    motivo_cancelamento: (c.motivo_cancelamento as string | null) ?? null,
    status: c.status as string,
    valor_mensalidade: Number(c.valor_mensalidade ?? 0),
    origem_cadastro: (c.origem_cadastro as string | null) ?? null,
  }));

  const titulosPrimeira: TituloBase[] = titulosBrutos.map((t) => ({
    contrato_id: t.contrato_id as string,
    vencimento: String(t.vencimento).slice(0, 10),
    data_pagamento: t.data_pagamento ? String(t.data_pagamento).slice(0, 10) : null,
    status: t.status as string,
  }));
  const osAgendadas = new Set<string>(osBrutas.map((o) => o.contrato_id as string).filter(Boolean));

  return {
    hoje,
    agoraMs: Date.now(),
    cfg,
    ehDiaUtil,
    vendedores,
    tickets,
    reatribuicoes,
    acoes,
    conversas,
    followups,
    contratos,
    titulosPrimeira,
    osAgendadas,
    metas: metasBrutas.map((m) => ({
      vendedor_id: m.referencia_id as string,
      mes_ano: String(m.mes_ano).slice(0, 10),
      quantidade_vendas: Number(m.quantidade_vendas ?? 0),
      receita: m.receita === null || m.receita === undefined ? null : Number(m.receita),
    })) as MetaBase[],
    indisponibilidades: indisp.map((d) => ({ vendedor_id: d.vendedor_id as string, inicio: String(d.inicio), fim: String(d.fim), tipo: d.tipo as string })) as IndisponibilidadeBase[],
    // revisão humana prevalece sobre a classificação da IA nos indicadores
    analises: analisesBrutas.map((a) => {
      const rev = (a.revisao ?? null) as { temperatura?: string | null; status_lead?: string | null; score?: number | null } | null;
      const scoreIa = a.score_atendimento === null || a.score_atendimento === undefined ? null : Number(a.score_atendimento);
      return {
        conversa_id: a.conversa_id as string,
        ticket_id: (a.ticket_id as string | null) ?? null,
        vendedor_id: (a.vendedor_id as string | null) ?? null,
        concluido_em: a.concluido_em as string,
        score_atendimento: rev?.score ?? scoreIa,
        temperatura: rev?.temperatura ?? ((a.temperatura as string | null) ?? null),
        intencao_compra: (a.intencao_compra as boolean | null) ?? null,
        objecoes: (a.objecoes as string[] | null) ?? [],
        status_lead: rev?.status_lead ?? ((a.status_lead as string | null) ?? null),
        prioridade_lead: (a.prioridade_lead as string | null) ?? null,
        resultado: (a.resultado as Record<string, unknown> | null) ?? null,
        revisada: Boolean(rev),
      };
    }) as AnaliseBase[],
    propostas,
    motivos: new Map((motivosBrutos ?? []).map((m) => [m.id as string, m.nome as string])),
    planos: new Map((planosBrutos ?? []).map((p) => [p.id as string, p.nome as string])),
  };
}
