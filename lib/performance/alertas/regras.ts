/**
 * Regras da central de alertas comerciais (24/10/2026) — puro sobre a
 * apuração já calculada. Cada alerta tem uma CHAVE estável (tipo + alvo +
 * janela): a mesma situação não gera alerta repetido, e quando ela deixa
 * de existir o job resolve o alerta sozinho. A IA pode sugerir sinais
 * (cliente quente), mas o alerta crítico só nasce depois da validação
 * operacional feita aqui: lead aberto, sem ação humana depois do sinal,
 * passado o prazo de expediente configurado.
 * Testado em regras.test.ts.
 */
import { segundosUteis } from "../expediente";
import type { BaseDados, TicketBase } from "../dados/base";
import type { LinhaPerformance, TotaisPerformance } from "../dados/calcular";
import type { indexar } from "../dados/calcular";

export type CategoriaAlerta = "critico" | "atencao" | "informativo";

export type AlertaCandidato = {
  chave: string;
  categoria: CategoriaAlerta;
  tipo: string;
  titulo: string;
  detalhe: string;
  vendedor_id: string | null;
  ticket_id: string | null;
  pop_id: string | null;
  evidencias: Record<string, unknown>;
  origem: "regra" | "ia";
};

export const ROTULO_TIPO_ALERTA: Record<string, string> = {
  lead_quente_sem_retorno: "Lead quente sem retorno",
  pronto_sem_continuidade: "Cliente pronto para contratar sem continuidade",
  followup_alta_vencido: "Follow-up de alta prioridade vencido",
  followups_acumulados: "Follow-ups acumulados",
  conversao_abaixo: "Conversão abaixo da meta",
  queda_produtividade: "Queda de produtividade",
  disciplina_baixa: "Oportunidades sem atualização",
  leads_sem_retorno: "Leads sem retorno",
  meta_alcancada: "Meta do mês alcançada",
  meta_no_ritmo: "No ritmo da meta",
  melhoria_conversao: "Melhoria de conversão",
  lead_recuperado: "Lead recuperado",
  evolucao_performance: "Evolução de performance",
  equipe_meta: "Equipe no ritmo da meta",
};

const primeiroNome = (n: string) => n.split(/\s+/)[0];

export function gerarAlertas(
  base: BaseDados,
  idx: ReturnType<typeof indexar>,
  atual: { linhas: LinhaPerformance[]; totais: TotaisPerformance; de: string; ate: string },
  anteriores: Map<string, LinhaPerformance>,
  semana7: Map<string, LinhaPerformance>,
  base30: Map<string, LinhaPerformance>
): AlertaCandidato[] {
  const cfg = base.cfg;
  const saida: AlertaCandidato[] = [];
  const agoraIso = new Date(base.agoraMs).toISOString();
  const util = (desdeMs: number) => segundosUteis(new Date(desdeMs).toISOString(), agoraIso, cfg.expediente, base.ehDiaUtil);
  const nomeVendedor = new Map(base.vendedores.map((v) => [v.id, v.nome]));
  const ids = new Set(atual.linhas.map((l) => l.vendedor.id));
  const mes = base.hoje.slice(0, 7);
  const abertos = base.tickets.filter((t) => t.origem_criacao !== "sgp_auto" && t.etapa !== "fechado" && t.vendedor_id && ids.has(t.vendedor_id));
  const comProposta = new Set(base.propostas.map((p) => p.ticket_id));

  // ---------------- CRÍTICO
  for (const t of abertos) {
    const a = idx.analisePorTicket.get(t.id);
    const ultima = idx.ultimaAcao(t.id) ?? 0;
    const quenteIa = cfg.lead_quente.usar_ia && a && (a.temperatura === "quente" || a.intencao_compra);
    const quenteUrg = cfg.lead_quente.usar_urgencia_alta && t.urgencia === "alta";
    if (quenteIa || quenteUrg) {
      const sinal = quenteIa ? Date.parse(a!.concluido_em) : Date.parse(t.criado_em);
      if (ultima < sinal && util(sinal) > cfg.lead_quente.minutos_sem_resposta * 60) {
        saida.push({
          chave: `lead_quente:${t.id}`,
          categoria: "critico",
          tipo: "lead_quente_sem_retorno",
          titulo: `Lead quente sem retorno — ${primeiroNome(nomeVendedor.get(t.vendedor_id!) ?? "vendedor")}`,
          detalhe: quenteIa
            ? `A IA identificou ${a!.intencao_compra ? "intenção de compra" : "cliente quente"} e não houve ação humana depois disso.`
            : "Urgência alta marcada pelo robô e nenhuma ação humana desde então.",
          vendedor_id: t.vendedor_id,
          ticket_id: t.id,
          pop_id: t.pop_id,
          evidencias: { sinal_em: new Date(sinal).toISOString(), ultima_acao_em: ultima ? new Date(ultima).toISOString() : null, fonte: quenteIa ? "ia" : "urgencia" },
          origem: quenteIa ? "ia" : "regra",
        });
      }
    }
    // pronto para contratar, sem proposta/contrato 24h úteis depois
    if (a?.intencao_compra && !comProposta.has(t.id) && t.etapa !== "aguardando" && !t.contrato_id && util(Date.parse(a.concluido_em)) > 10 * 3600 /* 1 dia de expediente (08–18h) */) {
      saida.push({
        chave: `pronto:${t.id}`,
        categoria: "critico",
        tipo: "pronto_sem_continuidade",
        titulo: `Cliente pronto para contratar sem continuidade — ${primeiroNome(nomeVendedor.get(t.vendedor_id!) ?? "vendedor")}`,
        detalhe: "Intenção de compra identificada e o lead não avançou (sem proposta registrada nem criação do contrato) após 1 dia de expediente.",
        vendedor_id: t.vendedor_id,
        ticket_id: t.id,
        pop_id: t.pop_id,
        evidencias: { analise_em: a.concluido_em },
        origem: "ia",
      });
    }
  }
  for (const f of base.followups) {
    if (f.status !== "vencido" || f.prioridade !== "alta" || !f.vendedor_id || !ids.has(f.vendedor_id)) continue;
    saida.push({
      chave: `fu_alta:${f.id}`,
      categoria: "critico",
      tipo: "followup_alta_vencido",
      titulo: `Follow-up de alta prioridade vencido — ${primeiroNome(nomeVendedor.get(f.vendedor_id) ?? "vendedor")}`,
      detalhe: f.proximo_passo ?? f.motivo ?? "Retorno de alta prioridade passou do prazo sem ação.",
      vendedor_id: f.vendedor_id,
      ticket_id: f.ticket_id,
      pop_id: null,
      evidencias: { prazo: f.prazo, followup_id: f.id },
      origem: "regra",
    });
  }

  // ---------------- ATENÇÃO (por vendedor, só quem tem volume)
  for (const l of atual.linhas) {
    if (!l.vendedor.ativo) continue;
    const v = l.vendedor;
    const nome = primeiroNome(v.nome);
    if (l.numeros.followupsAtrasados >= cfg.alertas.followups_acumulados)
      saida.push({ chave: `fu_acumulados:${v.id}`, categoria: "atencao", tipo: "followups_acumulados", titulo: `${l.numeros.followupsAtrasados} follow-ups vencidos — ${nome}`, detalhe: "Retornos programados passaram do prazo sem ação humana.", vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: { vencidos: l.numeros.followupsAtrasados }, origem: "regra" });
    if (l.numeros.leadsSemRetorno >= 5)
      saida.push({ chave: `sem_retorno:${v.id}`, categoria: "atencao", tipo: "leads_sem_retorno", titulo: `${l.numeros.leadsSemRetorno} leads sem retorno — ${nome}`, detalhe: `Leads abertos sem ação humana há mais de ${cfg.sla.sem_retorno_horas} h de expediente e sem retorno agendado.`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: { sem_retorno: l.numeros.leadsSemRetorno }, origem: "regra" });
    const conv = l.resultado.indicadores.conversao;
    if (conv.disponivel && conv.valor !== null && conv.valor < cfg.faixas.conversao.alvo * cfg.alertas.conversao_abaixo)
      saida.push({ chave: `conversao:${v.id}:${mes}`, categoria: "atencao", tipo: "conversao_abaixo", titulo: `Conversão abaixo da meta — ${nome}`, detalhe: `Conversão real de ${Math.round(conv.valor * 100)}% no mês (alvo ${Math.round(cfg.faixas.conversao.alvo * 100)}%).`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: { conversao: conv.valor, fechados: conv.denominador }, origem: "regra" });
    const disc = l.esforco.indicadores.disciplina_crm;
    if (disc.disponivel && disc.valor !== null && disc.valor < cfg.alertas.disciplina_minima && (disc.denominador ?? 0) >= 9)
      saida.push({ chave: `disciplina:${v.id}`, categoria: "atencao", tipo: "disciplina_baixa", titulo: `Alto índice de oportunidades sem atualização — ${nome}`, detalhe: `${Math.round(disc.valor * 100)}% das checagens do CRM em dia (telefone, etapa e próximo passo).`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: { disciplina: disc.valor }, origem: "regra" });
    const s7 = semana7.get(v.id);
    const b30 = base30.get(v.id);
    if (s7 && b30) {
      const porDia7 = s7.numeros.leadsTrabalhados / 6; // 7 dias corridos ≈ 6 úteis
      const porDia30 = b30.numeros.leadsTrabalhados / 26;
      if (porDia30 >= 1 && porDia7 < porDia30 * cfg.alertas.queda_produtividade)
        saida.push({ chave: `queda:${v.id}:${mes}`, categoria: "atencao", tipo: "queda_produtividade", titulo: `Queda de produtividade — ${nome}`, detalhe: `${porDia7.toFixed(1).replace(".", ",")} leads trabalhados/dia útil nos últimos 7 dias contra ${porDia30.toFixed(1).replace(".", ",")} na média dos 30 anteriores. Verifique folgas ou mudança de carteira antes de concluir.`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: { ultimos7: porDia7, media30: porDia30 }, origem: "regra" });
    }

    // ---------------- INFORMATIVO
    // meta CHEIA do mês batida ≠ estar acima da meta proporcional até hoje (títulos distintos)
    const metaMes = v.eh_coordenador ? undefined : base.metas.find((m) => m.vendedor_id === v.id && m.mes_ano.slice(0, 7) === mes)?.quantidade_vendas;
    if (atual.de.slice(0, 7) === mes && metaMes && l.numeros.vendas >= metaMes)
      saida.push({ chave: `meta:${v.id}:${mes}`, categoria: "informativo", tipo: "meta_alcancada", titulo: `Meta do mês alcançada — ${nome}`, detalhe: `${l.numeros.vendas} vendas para a meta de ${metaMes} no mês.`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: { vendas: l.numeros.vendas, meta: metaMes }, origem: "regra" });
    else if (l.numeros.metaPct !== null && l.numeros.metaPct >= 1 && atual.de.slice(0, 7) === mes)
      saida.push({ chave: `meta_ritmo:${v.id}:${mes}`, categoria: "informativo", tipo: "meta_no_ritmo", titulo: `No ritmo da meta — ${nome}`, detalhe: `${l.numeros.vendas} vendas para uma meta proporcional de ${l.numeros.metaPeriodo} até hoje${metaMes ? ` (meta do mês: ${metaMes})` : ""}.`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: { vendas: l.numeros.vendas, meta: l.numeros.metaPeriodo }, origem: "regra" });
    const ant = anteriores.get(v.id);
    if (ant && l.numeros.conversao !== null && ant.numeros.conversao !== null && conv.disponivel && l.numeros.conversao - ant.numeros.conversao >= 0.1)
      saida.push({ chave: `melhora_conv:${v.id}:${mes}`, categoria: "informativo", tipo: "melhoria_conversao", titulo: `Melhoria de conversão — ${nome}`, detalhe: `Conversão subiu de ${Math.round(ant.numeros.conversao * 100)}% para ${Math.round(l.numeros.conversao * 100)}%.`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: {}, origem: "regra" });
    if (ant && l.ipc.valor !== null && ant.ipc.valor !== null && !l.ipc.provisorio && l.ipc.valor - ant.ipc.valor >= 10)
      saida.push({ chave: `evolucao:${v.id}:${mes}`, categoria: "informativo", tipo: "evolucao_performance", titulo: `Evolução de performance — ${nome}`, detalhe: `IPC subiu ${Math.round(l.ipc.valor - ant.ipc.valor)} pontos em relação ao período anterior.`, vendedor_id: v.id, ticket_id: null, pop_id: v.pop_id, evidencias: {}, origem: "regra" });
  }
  // lead recuperado nos últimos 7 dias
  const seteDias = base.agoraMs - 7 * 86_400_000;
  for (const t of base.tickets as TicketBase[]) {
    if (t.desfecho !== "convertido" || !t.fechado_em || Date.parse(t.fechado_em) < seteDias || !t.vendedor_id || !ids.has(t.vendedor_id)) continue;
    if (t.reaberto_de_id || (idx.acoesPorTicket.get(t.id) ?? []).some((a) => a.fonte === "reabertura"))
      saida.push({ chave: `recuperado:${t.id}`, categoria: "informativo", tipo: "lead_recuperado", titulo: `Lead recuperado — ${primeiroNome(nomeVendedor.get(t.vendedor_id) ?? "")}`, detalhe: "Lead que tinha sido perdido voltou e virou venda.", vendedor_id: t.vendedor_id, ticket_id: t.id, pop_id: t.pop_id, evidencias: {}, origem: "regra" });
  }
  if (atual.totais.metaPct !== null && atual.totais.metaPct >= 1 && atual.de.slice(0, 7) === mes)
    saida.push({ chave: `equipe_meta:${mes}`, categoria: "informativo", tipo: "equipe_meta", titulo: "Equipe no ritmo da meta", detalhe: `${atual.totais.vendasComMeta} vendas (de quem tem meta) para a meta proporcional de ${atual.totais.metaPeriodo} até hoje.`, vendedor_id: null, ticket_id: null, pop_id: null, evidencias: {}, origem: "regra" });

  // uma ocorrência por chave
  const unicos = new Map<string, AlertaCandidato>();
  for (const a of saida) if (!unicos.has(a.chave)) unicos.set(a.chave, a);
  return [...unicos.values()];
}
