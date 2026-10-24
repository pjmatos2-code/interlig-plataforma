/**
 * Perfil de performance do vendedor (24/10/2026) — puro sobre a apuração.
 * Carteira, oportunidades, tarefas, evolução semanal, feedback por regras
 * verificáveis e histórico de atividades.
 */
import { pontuarPrioridade } from "../regras/followups";
import type { Apuracao } from "./apurar";
import type { TicketBase } from "./base";
import { calcularLinha, indexar, type LinhaPerformance } from "./calcular";

const somaDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const ROTULO_ETAPA: Record<string, string> = { pre_cadastro: "Pré-cadastro", novo: "Sem contato", em_atendimento: "Contato inicial", aguardando: "Criação do contrato", proposta: "Proposta", fechado: "Fechado" };

export type ItemCarteira = {
  ticketId: string;
  cliente: string;
  etapa: string;
  criadoEm: string;
  ultimaAcao: string | null;
  proximoRetorno: string | null;
  prioridade: number;
  temperatura: string | null;
  intencao: boolean;
  urgencia: string | null;
  valor: number | null;
  semRetorno: boolean;
};

export type Feedback = { tom: "positivo" | "atencao" | "critico"; texto: string; href?: string };
export type Atividade = { em: string; tipo: string; ticketId: string | null; soData?: boolean };

export function detalheVendedor(ap: Apuracao, linha: LinhaPerformance) {
  const base = ap.base;
  const idx = indexar(base);
  const v = linha.vendedor;
  const agora = base.agoraMs;
  const leads = base.tickets.filter((t) => t.origem_criacao !== "sgp_auto");
  const abertos = leads.filter((t) => t.vendedor_id === v.id && t.etapa !== "fechado");
  const limiteSemRetorno = base.cfg.sla.sem_retorno_horas * 3600 * 1000;

  // ---------- carteira priorizada
  const carteira: ItemCarteira[] = abertos.map((t: TicketBase) => {
    const ultima = idx.ultimaAcao(t.id);
    const a = idx.analisePorTicket.get(t.id);
    const fuAberto = base.followups.filter((f) => f.ticket_id === t.id && ["programado", "pendente", "vencido"].includes(f.status)).sort((x, y) => Date.parse(x.prazo) - Date.parse(y.prazo))[0];
    const proximo = fuAberto?.prazo ?? t.followup_em;
    const vencidoHoras = proximo && Date.parse(proximo) < agora ? (agora - Date.parse(proximo)) / 3_600_000 : 0;
    return {
      ticketId: t.id,
      cliente: t.cliente_nome ?? "Cliente sem nome",
      etapa: ROTULO_ETAPA[t.etapa] ?? t.etapa,
      criadoEm: t.criado_em,
      ultimaAcao: ultima ? new Date(ultima).toISOString() : null,
      proximoRetorno: proximo,
      temperatura: a?.temperatura ?? null,
      intencao: Boolean(a?.intencao_compra),
      urgencia: t.urgencia,
      valor: t.valor_estimado,
      semRetorno: !(proximo && Date.parse(proximo) > agora) && agora - (ultima ?? Date.parse(t.criado_em)) > limiteSemRetorno,
      prioridade: pontuarPrioridade({
        intencaoCompra: a?.intencao_compra ?? null,
        temperatura: (a?.temperatura as "quente" | "morno" | "frio" | "indeterminado" | null) ?? null,
        urgenciaAlta: t.urgencia === "alta",
        horasSemInteracao: ultima ? (agora - ultima) / 3_600_000 : (agora - Date.parse(t.criado_em)) / 3_600_000,
        vencidoHoras,
        etapa: t.etapa,
        valorEstimado: t.valor_estimado,
        prioridadeDeclarada: (fuAberto?.prioridade as "alta" | "media" | "baixa" | undefined) ?? "media",
      }),
    };
  }).sort((a, b) => b.prioridade - a.prioridade);

  const oportunidades = carteira.filter((c) => c.intencao || c.temperatura === "quente" || c.urgencia === "alta").slice(0, 10);
  const tarefas = base.followups
    .filter((f) => f.vendedor_id === v.id && ["sugerido", "programado", "pendente", "vencido"].includes(f.status))
    .sort((a, b) => (a.status === "vencido" ? -1 : 0) - (b.status === "vencido" ? -1 : 0) || Date.parse(a.prazo) - Date.parse(b.prazo));

  // ---------- evolução semanal (8 semanas terminando no fim do período)
  const semanas: { dia: string; valor: number | null; media: number | null; esforco: number | null }[] = [];
  const pares = ap.linhas.filter((l) => l.vendedor.setor === v.setor && l.flags.comparavel && l.vendedor.id !== v.id).map((l) => l.vendedor);
  for (let i = 7; i >= 0; i--) {
    const ate = somaDias(ap.periodo.ate, -7 * i);
    const de = somaDias(ate, -6);
    if (de < somaDias(ap.periodo.de, -60)) continue; // fora do que foi carregado
    const minha = calcularLinha(base, idx, v, de, ate);
    const outros = pares.map((p) => calcularLinha(base, idx, p, de, ate).ipc.valor).filter((x): x is number => x !== null);
    semanas.push({
      dia: ate,
      valor: minha.ipc.valor,
      esforco: minha.esforco.score.valor,
      media: outros.length ? Math.round((outros.reduce((s, x) => s + x, 0) / outros.length) * 10) / 10 : null,
    });
  }

  // ---------- feedback por regras verificáveis
  const fb: Feedback[] = [];
  const e = linha.esforco.indicadores;
  const r = linha.resultado.indicadores;
  const q = linha.qualidade.indicadores;
  const qsV = `vendedor=${v.id}`;
  if (e.sla_primeira_resposta.disponivel && e.sla_primeira_resposta.valor !== null) {
    const fora = (e.sla_primeira_resposta.denominador ?? 0) - (e.sla_primeira_resposta.numerador ?? 0);
    if (e.sla_primeira_resposta.valor < 0.8)
      fb.push({ tom: "atencao", texto: `${fora} de ${e.sla_primeira_resposta.denominador} conversas tiveram a 1ª resposta humana acima de ${base.cfg.sla.primeira_resposta_min} min de expediente. Priorize quem está na fila.`, href: `/performance/esforco?${qsV}` });
    else fb.push({ tom: "positivo", texto: `1ª resposta dentro do SLA em ${Math.round(e.sla_primeira_resposta.valor * 100)}% das conversas.` });
  }
  if (linha.numeros.leadsSemRetorno > 0)
    fb.push({ tom: linha.numeros.leadsSemRetorno >= 5 ? "critico" : "atencao", texto: `${linha.numeros.leadsSemRetorno} lead(s) sem ação humana há mais de ${base.cfg.sla.sem_retorno_horas} h de expediente e sem retorno agendado.`, href: `/performance/followups?aba=sem_retorno&${qsV}` });
  if (linha.numeros.followupsAtrasados > 0)
    fb.push({ tom: "critico", texto: `${linha.numeros.followupsAtrasados} follow-up(s) vencido(s). Execute ou reprograme com o cliente.`, href: `/performance/followups?status=vencido&${qsV}` });
  const semProximo = abertos.filter((t) => ["em_atendimento", "aguardando", "proposta"].includes(t.etapa) && !t.followup_em && !t.urgencia && !base.followups.some((f) => f.ticket_id === t.id && ["programado", "pendente", "vencido"].includes(f.status))).length;
  if (semProximo > 0)
    fb.push({ tom: "atencao", texto: `${semProximo} lead(s) em negociação sem próximo passo definido. Registre a tratativa com o retorno agendado.`, href: "/crm" });
  if (e.leads_atendidos.disponivel && e.leads_atendidos.valor !== null && e.leads_atendidos.valor < 0.9) {
    const falta = (e.leads_atendidos.denominador ?? 0) - (e.leads_atendidos.numerador ?? 0);
    fb.push({ tom: "atencao", texto: `${falta} dos ${e.leads_atendidos.denominador} leads recebidos no período ainda não tiveram ação sua.`, href: "/crm" });
  }
  if (e.leads_atendidos.motivo === "sem_integracao")
    fb.push({ tom: "atencao", texto: "Seus atendimentos no chat não aparecem: nenhum agente do chat está vinculado ao seu cadastro (Administração → vínculo de atendentes)." });
  if (r.conversao.disponivel && r.conversao.valor !== null && r.conversao.valor < base.cfg.faixas.conversao.alvo)
    fb.push({ tom: "atencao", texto: `Conversão real de ${Math.round(r.conversao.valor * 100)}% (alvo ${Math.round(base.cfg.faixas.conversao.alvo * 100)}%). Veja onde os leads param no funil.`, href: `/performance/funil?${qsV}` });
  if (linha.numeros.metaPct !== null && linha.numeros.metaPct >= 1) fb.push({ tom: "positivo", texto: `Meta proporcional do período batida (${linha.numeros.vendas} vendas).` });
  if (q.cancel_antes_instalacao.disponivel && (q.cancel_antes_instalacao.nota ?? 100) < 60)
    fb.push({ tom: "atencao", texto: `${Math.round((q.cancel_antes_instalacao.valor ?? 0) * 100)}% das vendas maduras cancelaram antes da instalação. Vale revisar com a esteira (sinal de investigação, não culpa).`, href: `/performance/qualidade?${qsV}` });
  if (q.inad_1a.disponivel && (q.inad_1a.nota ?? 100) < 60)
    fb.push({ tom: "atencao", texto: `Inadimplência da 1ª fatura em ${Math.round((q.inad_1a.valor ?? 0) * 100)}% da coorte madura.`, href: `/performance/qualidade?${qsV}` });

  // ---------- histórico de atividades (mais recentes)
  const atividades: Atividade[] = [];
  const ROT: Record<string, string> = { tratativa: "Registro no CRM", etapa: "Mudança de etapa", fechamento: "Fechamento de ticket", reabertura: "Reabertura", proposta: "Proposta registrada", visita: "Visita externa" };
  for (const a of base.acoes) if (a.vendedorId === v.id && a.fonte !== "chat") atividades.push({ em: new Date(a.em).toISOString(), tipo: ROT[a.fonte] ?? a.fonte, ticketId: a.ticketId });
  for (const c of base.conversas) {
    const ag = Object.values(c.por_agente ?? {}).find((x) => x.vendedor_id === v.id);
    if (ag) atividades.push({ em: ag.ultima_msg_em, tipo: `Atendimento no chat (${ag.msgs} mensagens)`, ticketId: c.ticket_id });
  }
  for (const k of base.contratos) if (k.vendedor_id === v.id) atividades.push({ em: `${k.data_venda}T12:00:00-03:00`, tipo: "Venda registrada no SGP", ticketId: null, soData: true });
  atividades.sort((a, b) => Date.parse(b.em) - Date.parse(a.em));

  return { carteira, oportunidades, tarefas, semanas, feedback: fb, atividades: atividades.slice(0, 25) };
}
