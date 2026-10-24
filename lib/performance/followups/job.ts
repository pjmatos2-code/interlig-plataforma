import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarConfig } from "../config-servidor";
import { todas } from "../dados/paginar";
import { avaliarFollowup, prazoDaNota, type AtividadeHumana, type StatusFollowup } from "../regras/followups";

/**
 * Registro e avaliação dos follow-ups (24/10/2026). Roda a cada ciclo do
 * cron (barato) e pode ser disparado à mão.
 *
 * 1) IMPORTA os retornos agendados por GENTE, sem mexer no CRM:
 *    - tratativa "Reagendado" (Meu Dia/CRM): meu_dia_log.dados.retorno e a
 *      nota com desfecho reagendado (mesma ação → mesma chave, sem duplicar);
 *    - lembretes ⏰ do ticket (ticket_acoes): quando / concluída;
 *    - o retorno automático do robô (tickets.followup_em sem origem humana)
 *      entra como origem "robo" — fora da taxa de execução por padrão.
 * 2) AVALIA cada um aberto pela 1ª ação humana no lead depois do agendamento
 *    (mensagem do vendedor no chat, registro no CRM, proposta, visita,
 *    retorno marcado como feito) — regra pura em regras/followups.ts.
 */

const minuto = (iso: string) => new Date(Math.floor(Date.parse(iso) / 60_000) * 60_000).toISOString();

export async function rodarFollowups(opts: { desdeDias?: number } = {}) {
  const admin = criarClienteAdmin();
  const cfg = await carregarConfig();
  const desde = new Date(Date.now() - (opts.desdeDias ?? 60) * 86_400_000).toISOString();
  // paginado: o PostgREST devolve no máximo 1000 linhas por pedido
  type Linha = Record<string, unknown> & { id: string };
  const [{ data: usuarios }, logs, notas, acoes, ticketsFu] = await Promise.all([
    admin.from("usuarios").select("id, vendedor_id"),
    todas<Linha>((de, ate) => admin.from("meu_dia_log").select("id, usuario_id, vendedor_id, ticket_id, acao, resultado, dados, criado_em").in("acao", ["tratativa", "retorno_agendado", "retorno_adiado"]).gte("criado_em", desde).order("id").range(de, ate)),
    todas<Linha>((de, ate) => admin.from("ticket_eventos").select("id, ticket_id, usuario_id, dados, criado_em").eq("tipo", "nota").eq("dados->>desfecho", "reagendado").gte("criado_em", desde).order("id").range(de, ate)),
    todas<Linha>((de, ate) => admin.from("ticket_acoes").select("id, ticket_id, descricao, quando, criado_por, criado_em, concluida_em").gte("criado_em", desde).order("id").range(de, ate)),
    todas<Linha>((de, ate) => admin.from("tickets").select("id, vendedor_id, followup_em, etapa, atualizado_em, resumo_em").neq("etapa", "fechado").not("followup_em", "is", null).gte("followup_em", desde).order("id").range(de, ate)),
  ]);
  const vendedorDoUsuario = new Map((usuarios ?? []).filter((u) => u.vendedor_id).map((u) => [u.id as string, u.vendedor_id as string]));
  const idsTickets = [...new Set([...logs, ...notas, ...acoes, ...ticketsFu].map((x) => (x as { ticket_id?: string; id: string }).ticket_id ?? (x as { id: string }).id).filter(Boolean))];
  const donoTicket = new Map<string, string | null>();
  for (let i = 0; i < idsTickets.length; i += 200) {
    const { data } = await admin.from("tickets").select("id, vendedor_id").in("id", idsTickets.slice(i, i + 200));
    for (const t of data ?? []) donoTicket.set(t.id as string, (t.vendedor_id as string | null) ?? null);
  }

  // ---------- 1) importação (idempotente pela chave)
  type Novo = { chave: string; ticket_id: string; vendedor_id: string | null; prazo: string; origem: string; tipo: string; motivo: string | null; criado_em: string; criado_por: string | null; concluido_em?: string | null };
  const novos = new Map<string, Novo>();
  const chavesHumanas = new Set<string>();
  for (const l of logs) {
    if (!l.ticket_id) continue;
    // tratativa reagendada guarda o horário; agendar/adiar retorno do CRM guarda
    // só a data, gravada no ticket como 12:00 UTC (09:00 em Santarém)
    const retorno =
      l.acao === "tratativa"
        ? l.resultado === "reagendado"
          ? (l.dados as { retorno?: string } | null)?.retorno
          : undefined
        : /^\d{4}-\d{2}-\d{2}$/.test(String(l.resultado ?? ""))
          ? `${l.resultado}T12:00:00Z`
          : undefined;
    if (!retorno || !Number.isFinite(Date.parse(retorno))) continue;
    const chave = `crm:${l.ticket_id}:${minuto(retorno)}`;
    chavesHumanas.add(chave);
    novos.set(chave, {
      chave, ticket_id: l.ticket_id as string, prazo: new Date(retorno).toISOString(), origem: "crm", tipo: "retorno",
      motivo: l.acao === "tratativa" ? "Tratativa reagendada" : l.acao === "retorno_adiado" ? "Retorno adiado" : "Retorno agendado",
      vendedor_id: (l.vendedor_id as string | null) ?? vendedorDoUsuario.get(l.usuario_id as string) ?? donoTicket.get(l.ticket_id as string) ?? null,
      criado_em: l.criado_em as string, criado_por: (l.usuario_id as string | null) ?? null,
    });
  }
  for (const n of notas) {
    const prazo = prazoDaNota(String((n.dados as { texto?: string } | null)?.texto ?? ""));
    if (!prazo || !n.usuario_id) continue;
    const chave = `crm:${n.ticket_id}:${minuto(prazo)}`;
    chavesHumanas.add(chave);
    if (!novos.has(chave))
      novos.set(chave, {
        chave, ticket_id: n.ticket_id as string, prazo, origem: "crm", tipo: "retorno", motivo: "Tratativa reagendada",
        vendedor_id: vendedorDoUsuario.get(n.usuario_id as string) ?? donoTicket.get(n.ticket_id as string) ?? null,
        criado_em: n.criado_em as string, criado_por: n.usuario_id as string,
      });
  }
  for (const a of acoes) {
    if (!a.quando) continue;
    const chave = `acao:${a.id}`;
    novos.set(chave, {
      chave, ticket_id: a.ticket_id as string, prazo: new Date(a.quando as string).toISOString(), origem: "crm", tipo: /instala/i.test(String(a.descricao ?? "")) ? "instalacao" : "outro",
      motivo: String(a.descricao ?? "Lembrete").slice(0, 200), vendedor_id: vendedorDoUsuario.get(a.criado_por as string) ?? donoTicket.get(a.ticket_id as string) ?? null,
      criado_em: a.criado_em as string, criado_por: (a.criado_por as string | null) ?? null, concluido_em: (a.concluida_em as string | null) ?? null,
    });
  }
  for (const t of ticketsFu) {
    const chaveHumana = `crm:${t.id}:${minuto(t.followup_em as string)}`;
    if (chavesHumanas.has(chaveHumana)) continue; // foi gente que agendou
    const chave = `robo:${t.id}:${minuto(t.followup_em as string)}`;
    novos.set(chave, {
      chave, ticket_id: t.id as string, prazo: new Date(t.followup_em as string).toISOString(), origem: "robo", tipo: "retorno", motivo: "Retorno automático do robô do chat",
      vendedor_id: (t.vendedor_id as string | null) ?? null, criado_em: (t.resumo_em as string | null) ?? (t.atualizado_em as string), criado_por: null,
    });
  }
  let importados = 0;
  const lista = [...novos.values()];
  for (let i = 0; i < lista.length; i += 200) {
    const lote = lista.slice(i, i + 200).map((n) => ({ ...n, status: "programado", data_referencia: n.prazo.slice(0, 10) }));
    const { data, error } = await admin.from("followups").upsert(lote, { onConflict: "chave", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`importar follow-ups: ${error.message}`);
    importados += data?.length ?? 0;
    if (data?.length)
      await admin.from("followups_historico").insert((data ?? []).map((d) => ({ followup_id: d.id as string, evento: "criado", dados: { fonte: "importacao" } })));
  }

  // ---------- 2) avaliação dos abertos
  const abertos = await todas<Linha>((de, ate) =>
    admin.from("followups").select("id, ticket_id, status, prazo, criado_em, concluido_em, cancelado_em, chave, origem").in("status", ["programado", "pendente", "vencido"]).order("id").range(de, ate)
  );
  const tickets = [...new Set(abertos.map((f) => f.ticket_id as string))];
  // só importa ação humana DEPOIS do agendamento mais antigo de cada ticket
  const desdeTicket = new Map<string, string>();
  for (const f of abertos) {
    const t = f.ticket_id as string;
    const c = f.criado_em as string;
    if (!desdeTicket.has(t) || c < desdeTicket.get(t)!) desdeTicket.set(t, c);
  }
  const atividades = new Map<string, AtividadeHumana[]>();
  const fechadoEm = new Map<string, string | null>();
  const add = (t: string, a: AtividadeHumana) => atividades.set(t, [...(atividades.get(t) ?? []), a]);
  for (let i = 0; i < tickets.length; i += 150) {
    const lote = tickets.slice(i, i + 150);
    const desde = lote.reduce((m, t) => (desdeTicket.get(t)! < m ? desdeTicket.get(t)! : m), desdeTicket.get(lote[0])!);
    const [conv, evs, props, vis, md, tks, acs] = await Promise.all([
      todas<Linha>((de, ate) => admin.from("conversas_atendimento").select("id, ticket_id").in("ticket_id", lote).gte("finalizada_em", desde).order("id").range(de, ate)),
      todas<Linha>((de, ate) => admin.from("ticket_eventos").select("id, ticket_id, criado_em, tipo").in("ticket_id", lote).not("usuario_id", "is", null).in("tipo", ["nota", "mudanca_etapa", "fechamento"]).gte("criado_em", desde).order("id").range(de, ate)),
      todas<Linha>((de, ate) => admin.from("ticket_propostas").select("id, ticket_id, criado_em").in("ticket_id", lote).gte("criado_em", desde).order("id").range(de, ate)),
      todas<Linha>((de, ate) => admin.from("visitas_externas").select("id, ticket_id, criado_em").in("ticket_id", lote).gte("criado_em", desde).order("id").range(de, ate)),
      todas<Linha>((de, ate) => admin.from("meu_dia_log").select("id, ticket_id, criado_em, acao").in("ticket_id", lote).in("acao", ["retorno_feito", "followup_ia_feito", "lembrete_feito", "tratativa", "fechamento"]).gte("criado_em", desde).order("id").range(de, ate)),
      todas<Linha>((de, ate) => admin.from("tickets").select("id, fechado_em, etapa").in("id", lote).order("id").range(de, ate)),
      todas<Linha>((de, ate) => admin.from("ticket_acoes").select("id, ticket_id, concluida_em").in("ticket_id", lote).gte("concluida_em", desde).order("id").range(de, ate)),
    ]);
    const convPorTicket = new Map<string, string>();
    for (const c of conv) convPorTicket.set(c.id as string, c.ticket_id as string);
    const idsConv = [...convPorTicket.keys()];
    for (let j = 0; j < idsConv.length; j += 150) {
      const msgs = await todas<Record<string, unknown>>((de, ate) =>
        admin.from("conversas_mensagens").select("id, conversa_id, enviada_em").in("conversa_id", idsConv.slice(j, j + 150)).eq("autor", "agente").gte("enviada_em", desde).order("id").range(de, ate)
      );
      for (const m of msgs) add(convPorTicket.get(m.conversa_id as string)!, { em: m.enviada_em as string, fonte: "mensagem do vendedor no chat" });
    }
    for (const e of evs) add(e.ticket_id as string, { em: e.criado_em as string, fonte: e.tipo === "fechamento" ? "fechamento do ticket" : "registro no CRM" });
    for (const p of props) add(p.ticket_id as string, { em: p.criado_em as string, fonte: "proposta registrada" });
    for (const v of vis) add(v.ticket_id as string, { em: v.criado_em as string, fonte: "visita externa" });
    for (const d of md) add(d.ticket_id as string, { em: d.criado_em as string, fonte: "ação no Meu Dia" });
    for (const t of tks) fechadoEm.set(t.id as string, t.etapa === "fechado" ? ((t.fechado_em as string | null) ?? null) : null);
    for (const a of acs) add(a.ticket_id as string, { em: a.concluida_em as string, fonte: `lembrete concluído:${a.id}` });
  }

  const agora = new Date().toISOString();
  let atualizados = 0;
  for (const f of abertos) {
    const ativ = (atividades.get(f.ticket_id as string) ?? []).filter((a) => !a.fonte.startsWith("lembrete concluído:") || a.fonte === `lembrete concluído:${String(f.chave).replace("acao:", "")}`);
    const r = avaliarFollowup(
      { status: f.status as StatusFollowup, prazo: f.prazo as string, criadoEm: f.criado_em as string, canceladoEm: (f.cancelado_em as string | null) ?? null },
      ativ.map((a) => ({ ...a, fonte: a.fonte.startsWith("lembrete concluído:") ? "lembrete marcado como concluído" : a.fonte })),
      fechadoEm.get(f.ticket_id as string) ?? null,
      agora,
      { tolerancia: cfg.followup.tolerancia, carenciaMin: cfg.followup.carencia_min }
    );
    if (r.status === f.status && (r.concluidoEm ?? null) === ((f.concluido_em as string | null) ?? null)) continue;
    const { error } = await admin
      .from("followups")
      .update({
        status: r.status,
        concluido_em: r.concluidoEm,
        evidencia: r.evidencia,
        cancelado_em: r.status === "cancelado" ? agora : null,
        motivo_cancelamento: r.status === "cancelado" ? r.evidencia : null,
        atualizado_em: agora,
      })
      .eq("id", f.id);
    if (error) throw new Error(`avaliar follow-up ${f.id}: ${error.message}`);
    await admin.from("followups_historico").insert({ followup_id: f.id, evento: r.status, dados: { de: f.status, evidencia: r.evidencia, concluido_em: r.concluidoEm } });
    atualizados++;
  }
  return { importados, avaliados: abertos.length, atualizados };
}
