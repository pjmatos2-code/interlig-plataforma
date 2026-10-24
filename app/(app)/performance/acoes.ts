"use server";

import { revalidatePath } from "next/cache";
import { agendarFollowup as agendarNoCrm, concluirAcaoTicket, concluirFollowup as concluirNoCrm } from "@/app/(app)/crm/acoes";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CONFIG_PADRAO, mesclarConfig } from "@/lib/performance/config";
import { carregarConfig } from "@/lib/performance/config-servidor";
import { invalidarCachePerformance } from "@/lib/performance/dados/apurar";
import { alcanca, exigirEscopo, type EscopoPerformance } from "@/lib/performance/escopo";

/**
 * Ações da Performance Comercial (24/10/2026). Toda ação confere o escopo no
 * SERVIDOR; o que mexe no lead passa pelas ações do próprio CRM (mesma regra,
 * mesma RLS, mesmo histórico). Diretoria é só leitura.
 */
export type Resposta = { ok?: string; erro?: string };

const podeAgir = (e: EscopoPerformance) => e.papel !== "diretoria";
const agora = () => new Date().toISOString();

async function auditar(usuarioId: string, acao: string, alvo: string | null, antes: unknown, depois: unknown) {
  await criarClienteAdmin().from("auditoria_performance").insert({ usuario_id: usuarioId, acao, alvo, antes: antes ?? null, depois: depois ?? null });
}

function revalidar() {
  invalidarCachePerformance();
  revalidatePath("/performance", "layout");
}

async function followupDoEscopo(escopo: EscopoPerformance, id: string) {
  const { data: f } = await criarClienteAdmin().from("followups").select("id, ticket_id, vendedor_id, status, prazo, chave, origem").eq("id", id).maybeSingle();
  if (!f) return null;
  let dono = f.vendedor_id as string | null;
  if (!dono) {
    const { data: t } = await criarClienteAdmin().from("tickets").select("vendedor_id").eq("id", f.ticket_id).maybeSingle();
    dono = (t?.vendedor_id as string | null) ?? null;
  }
  return alcanca(escopo, dono) ? f : null;
}

async function historico(followupId: string, evento: string, usuarioId: string, dados: Record<string, unknown> = {}) {
  await criarClienteAdmin().from("followups_historico").insert({ followup_id: followupId, evento, usuario_id: usuarioId, dados });
}

const dataValida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T12:00:00Z`));

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------
export async function concluirFollowupPerf(id: string, resultado: string | null): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!podeAgir(escopo)) return { erro: "Seu perfil só consulta este módulo." };
  const f = await followupDoEscopo(escopo, id);
  if (!f) return { erro: "Follow-up fora do seu escopo." };
  const res = ["avancou", "assinou", "sem_resposta", "perdido"].includes(resultado ?? "") ? resultado : null;
  // conclui no CRM também: lembrete ⏰ fecha o próprio lembrete; retorno tira
  // a data do ticket — sempre registrando quem fez e quando
  const chave = String(f.chave ?? "");
  const r = chave.startsWith("acao:")
    ? await concluirAcaoTicket(chave.slice(5), f.ticket_id as string)
    : await concluirNoCrm(f.ticket_id as string);
  if (r.erro) return { erro: `CRM: ${r.erro}` };
  const quando = agora();
  const limite = Date.parse(`${new Date(Date.parse(f.prazo as string) - 3 * 3_600_000).toISOString().slice(0, 10)}T23:59:59.999-03:00`);
  await criarClienteAdmin()
    .from("followups")
    .update({ status: Date.parse(quando) <= limite ? "concluido_prazo" : "concluido_atraso", concluido_em: quando, concluido_por: escopo.usuario.id, resultado: res, evidencia: "marcado como feito", atualizado_em: quando })
    .eq("id", id);
  await historico(id, "concluido", escopo.usuario.id, { resultado: res });
  revalidar();
  return { ok: "Follow-up concluído." };
}

export async function reprogramarFollowupPerf(id: string, novaData: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!podeAgir(escopo)) return { erro: "Seu perfil só consulta este módulo." };
  if (!dataValida(novaData) || novaData < new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)) return { erro: "Escolha uma data de hoje em diante." };
  const f = await followupDoEscopo(escopo, id);
  if (!f) return { erro: "Follow-up fora do seu escopo." };
  const fd = new FormData();
  fd.set("ticket_id", f.ticket_id as string);
  fd.set("followup_em", novaData);
  const r = await agendarNoCrm({}, fd);
  if (r.erro) return { erro: `CRM: ${r.erro}` };
  const admin = criarClienteAdmin();
  await admin.from("followups").update({ status: "cancelado", cancelado_em: agora(), motivo_cancelamento: "reprogramado", atualizado_em: agora() }).eq("id", id);
  await historico(id, "reprogramado", escopo.usuario.id, { para: novaData });
  const prazo = `${novaData}T12:00:00.000Z`;
  const { data: novo } = await admin
    .from("followups")
    .upsert(
      { chave: `crm:${f.ticket_id}:${prazo}`, ticket_id: f.ticket_id, vendedor_id: f.vendedor_id, prazo, origem: "crm", tipo: "retorno", motivo: "Retorno reprogramado", status: "programado", criado_por: escopo.usuario.id, data_referencia: novaData },
      { onConflict: "chave", ignoreDuplicates: true }
    )
    .select("id");
  if (novo?.[0]) await historico(novo[0].id as string, "criado", escopo.usuario.id, { de_followup: id });
  revalidar();
  return { ok: "Retorno reprogramado no CRM." };
}

export async function cancelarFollowupPerf(id: string, motivo: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!podeAgir(escopo)) return { erro: "Seu perfil só consulta este módulo." };
  if (motivo.trim().length < 5) return { erro: "Explique em poucas palavras por que cancelar." };
  const f = await followupDoEscopo(escopo, id);
  if (!f) return { erro: "Follow-up fora do seu escopo." };
  await criarClienteAdmin().from("followups").update({ status: "cancelado", cancelado_em: agora(), motivo_cancelamento: motivo.trim().slice(0, 300), atualizado_em: agora() }).eq("id", id);
  await historico(id, "cancelado", escopo.usuario.id, { motivo: motivo.trim().slice(0, 300) });
  revalidar();
  return { ok: "Follow-up cancelado." };
}

export async function aceitarSugestaoPerf(id: string, data: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!podeAgir(escopo)) return { erro: "Seu perfil só consulta este módulo." };
  if (!dataValida(data)) return { erro: "Data inválida." };
  const f = await followupDoEscopo(escopo, id);
  if (!f || f.status !== "sugerido") return { erro: "Sugestão não encontrada no seu escopo." };
  const fd = new FormData();
  fd.set("ticket_id", f.ticket_id as string);
  fd.set("followup_em", data);
  const r = await agendarNoCrm({}, fd);
  if (r.erro) return { erro: `CRM: ${r.erro}` };
  await criarClienteAdmin().from("followups").update({ status: "programado", prazo: `${data}T12:00:00.000Z`, data_referencia: data, atualizado_em: agora() }).eq("id", id);
  await historico(id, "aceito", escopo.usuario.id, { prazo: data });
  revalidar();
  return { ok: "Sugestão aceita: retorno agendado no CRM." };
}

export async function rejeitarSugestaoPerf(id: string, motivo: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!podeAgir(escopo)) return { erro: "Seu perfil só consulta este módulo." };
  const f = await followupDoEscopo(escopo, id);
  if (!f || f.status !== "sugerido") return { erro: "Sugestão não encontrada no seu escopo." };
  await criarClienteAdmin().from("followups").update({ status: "rejeitado", motivo_cancelamento: motivo.trim().slice(0, 300) || "rejeitada pelo vendedor", atualizado_em: agora() }).eq("id", id);
  await historico(id, "rejeitado", escopo.usuario.id, { motivo: motivo.trim().slice(0, 300) });
  revalidar();
  return { ok: "Sugestão rejeitada." };
}

/** agenda retorno para um lead (ex.: da lista "sem retorno") — no CRM e no registro */
export async function agendarRetornoPerf(ticketId: string, data: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!podeAgir(escopo)) return { erro: "Seu perfil só consulta este módulo." };
  if (!dataValida(data) || data < new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)) return { erro: "Escolha uma data de hoje em diante." };
  const { data: t } = await criarClienteAdmin().from("tickets").select("id, vendedor_id, etapa").eq("id", ticketId).maybeSingle();
  if (!t || !alcanca(escopo, t.vendedor_id as string | null)) return { erro: "Lead fora do seu escopo." };
  if (t.etapa === "fechado") return { erro: "Lead fechado não recebe retorno — reabra no CRM." };
  const fd = new FormData();
  fd.set("ticket_id", ticketId);
  fd.set("followup_em", data);
  const r = await agendarNoCrm({}, fd);
  if (r.erro) return { erro: `CRM: ${r.erro}` };
  const prazo = `${data}T12:00:00.000Z`;
  const { data: novo } = await criarClienteAdmin()
    .from("followups")
    .upsert(
      { chave: `crm:${ticketId}:${prazo}`, ticket_id: ticketId, vendedor_id: t.vendedor_id, prazo, origem: "manual", tipo: "retorno", motivo: "Agendado na Performance Comercial", status: "programado", criado_por: escopo.usuario.id, data_referencia: data },
      { onConflict: "chave", ignoreDuplicates: true }
    )
    .select("id");
  if (novo?.[0]) await historico(novo[0].id as string, "criado", escopo.usuario.id, { origem: "manual" });
  revalidar();
  return { ok: "Retorno agendado no CRM." };
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
export async function tratarAlertaPerf(id: string, acao: "reconhecer" | "resolver" | "silenciar" | "reabrir", dias?: number): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!escopo.podeTratarAlertas) return { erro: "Seu perfil não trata alertas." };
  const admin = criarClienteAdmin();
  const { data: a } = await admin.from("alertas_comerciais").select("id, vendedor_id, status").eq("id", id).maybeSingle();
  if (!a || (a.vendedor_id && !alcanca(escopo, a.vendedor_id as string)) || (!a.vendedor_id && escopo.vendedorIds !== null)) return { erro: "Alerta fora do seu escopo." };
  const q = agora();
  const campos =
    acao === "reconhecer"
      ? { status: "reconhecido", reconhecido_por: escopo.usuario.id, reconhecido_em: q }
      : acao === "resolver"
        ? { status: "resolvido", resolvido_por: escopo.usuario.id, resolvido_em: q }
        : acao === "silenciar"
          ? { status: "silenciado", silenciado_ate: new Date(Date.now() + Math.min(30, Math.max(1, dias ?? 1)) * 86_400_000).toISOString() }
          : { status: "aberto", silenciado_ate: null };
  const { error } = await admin.from("alertas_comerciais").update(campos).eq("id", id);
  if (error) return { erro: error.message };
  await admin.from("alertas_comerciais_eventos").insert({ alerta_id: id, evento: acao === "reconhecer" ? "reconhecido" : acao === "resolver" ? "resolvido" : acao === "silenciar" ? "silenciado" : "reaberto", usuario_id: escopo.usuario.id, dados: dias ? { dias } : {} });
  revalidar();
  return { ok: "Alerta atualizado." };
}

// ---------------------------------------------------------------------------
// Configurações (gestor) — sempre com trilha de auditoria
// ---------------------------------------------------------------------------
export async function salvarConfigPerf(json: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!escopo.podeConfigurar) return { erro: "Só o gestor altera as configurações." };
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { erro: "Configuração inválida." };
  }
  const antes = await carregarConfig();
  const nova = mesclarConfig(bruto, CONFIG_PADRAO);
  const { error } = await criarClienteAdmin()
    .from("config_comercial")
    .upsert({ chave: "performance", valor: nova, atualizado_em: agora(), atualizado_por: escopo.usuario.id }, { onConflict: "chave" });
  if (error) return { erro: error.message };
  await auditar(escopo.usuario.id, "configuracao", "performance", antes, nova);
  revalidar();
  return { ok: "Configurações salvas." };
}

export async function restaurarPadraoPerf(): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!escopo.podeConfigurar) return { erro: "Só o gestor altera as configurações." };
  const antes = await carregarConfig();
  await criarClienteAdmin().from("config_comercial").upsert({ chave: "performance", valor: CONFIG_PADRAO, atualizado_em: agora(), atualizado_por: escopo.usuario.id }, { onConflict: "chave" });
  await auditar(escopo.usuario.id, "configuracao_padrao", "performance", antes, CONFIG_PADRAO);
  revalidar();
  return { ok: "Padrões restaurados." };
}

// ---------------------------------------------------------------------------
// Metas extras e indisponibilidades
// ---------------------------------------------------------------------------
const TIPOS_META = ["vendas", "ativacoes", "conversao", "leads_trabalhados", "followups", "tempo_resposta", "receita_nova", "ticket_medio", "qualidade_atendimento", "esforco", "ipc"];

export async function criarMetaPerf(dados: { tipo: string; escopo: string; referencia: string | null; periodicidade: string; inicio: string; fim: string; valor: number }): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!escopo.podeGerirMetas) return { erro: "Só o gestor cadastra metas." };
  if (!TIPOS_META.includes(dados.tipo)) return { erro: "Tipo de meta inválido." };
  if (!["global", "unidade", "equipe", "funcao", "vendedor"].includes(dados.escopo)) return { erro: "Escopo inválido." };
  if (!["dia", "semana", "mes"].includes(dados.periodicidade)) return { erro: "Periodicidade inválida." };
  if (!dataValida(dados.inicio) || !dataValida(dados.fim) || dados.fim < dados.inicio) return { erro: "Período inválido." };
  if (!Number.isFinite(dados.valor) || dados.valor <= 0) return { erro: "Valor da meta precisa ser positivo." };
  if (["conversao", "qualidade_atendimento", "esforco", "ipc"].includes(dados.tipo) && dados.valor > 100) return { erro: "Para esse tipo a meta vai de 0 a 100." };
  if (dados.tipo === "vendas" && dados.periodicidade === "mes") return { erro: "A meta MENSAL de vendas continua em Metas e comissão (a mesma usada no dashboard e na comissão)." };
  if (dados.escopo !== "global" && !dados.referencia) return { erro: "Escolha a quem a meta se aplica." };
  const linha = { ...dados, referencia: dados.escopo === "global" ? null : dados.referencia, criado_por: escopo.usuario.id };
  const { data, error } = await criarClienteAdmin().from("metas_performance").insert(linha).select("id").single();
  if (error) return { erro: error.message };
  await auditar(escopo.usuario.id, "meta_criada", data.id as string, null, linha);
  revalidar();
  return { ok: "Meta cadastrada." };
}

export async function removerMetaPerf(id: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!escopo.podeGerirMetas) return { erro: "Só o gestor remove metas." };
  const admin = criarClienteAdmin();
  const { data: antes } = await admin.from("metas_performance").select("*").eq("id", id).maybeSingle();
  if (!antes) return { erro: "Meta não encontrada." };
  // desativa (não apaga): o histórico de metas anteriores continua consultável
  await admin.from("metas_performance").update({ ativo: false }).eq("id", id);
  await auditar(escopo.usuario.id, "meta_desativada", id, antes, { ...antes, ativo: false });
  revalidar();
  return { ok: "Meta desativada." };
}

export async function registrarIndisponibilidadePerf(dados: { vendedorId: string; inicio: string; fim: string; tipo: string; observacao: string }): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!(escopo.papel === "admin" || escopo.papel === "supervisor" || escopo.papel === "gerente_unidade")) return { erro: "Seu perfil não registra afastamentos." };
  if (!alcanca(escopo, dados.vendedorId)) return { erro: "Vendedor fora do seu escopo." };
  if (!["ferias", "folga", "afastamento", "treinamento", "outro"].includes(dados.tipo)) return { erro: "Tipo inválido." };
  if (!dataValida(dados.inicio) || !dataValida(dados.fim) || dados.fim < dados.inicio) return { erro: "Período inválido." };
  const linha = { vendedor_id: dados.vendedorId, inicio: dados.inicio, fim: dados.fim, tipo: dados.tipo, observacao: dados.observacao.slice(0, 300) || null, criado_por: escopo.usuario.id };
  const { data, error } = await criarClienteAdmin().from("indisponibilidades_vendedor").insert(linha).select("id").single();
  if (error) return { erro: error.message };
  await auditar(escopo.usuario.id, "indisponibilidade_registrada", data.id as string, null, linha);
  revalidar();
  return { ok: "Afastamento registrado: as metas do período ficam proporcionais." };
}

export async function removerIndisponibilidadePerf(id: string): Promise<Resposta> {
  const escopo = await exigirEscopo();
  const admin = criarClienteAdmin();
  const { data: antes } = await admin.from("indisponibilidades_vendedor").select("*").eq("id", id).maybeSingle();
  if (!antes || !alcanca(escopo, antes.vendedor_id as string) || escopo.papel === "vendedor" || escopo.papel === "diretoria") return { erro: "Registro fora do seu escopo." };
  await admin.from("indisponibilidades_vendedor").delete().eq("id", id);
  await auditar(escopo.usuario.id, "indisponibilidade_removida", id, antes, null);
  revalidar();
  return { ok: "Registro removido." };
}

export async function definirAdmissaoPerf(vendedorId: string, data: string | null): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!escopo.podeGerirMetas) return { erro: "Só o gestor altera a data de admissão." };
  if (data && !dataValida(data)) return { erro: "Data inválida." };
  const admin = criarClienteAdmin();
  const { data: antes } = await admin.from("vendedores").select("id, admitido_em").eq("id", vendedorId).maybeSingle();
  if (!antes) return { erro: "Vendedor não encontrado." };
  await admin.from("vendedores").update({ admitido_em: data }).eq("id", vendedorId);
  await auditar(escopo.usuario.id, "admissao", vendedorId, antes, { admitido_em: data });
  revalidar();
  return { ok: "Data de admissão salva." };
}

// ---------------------------------------------------------------------------
// Inteligência das conversas
// ---------------------------------------------------------------------------
/** amostra manual (gestor): roda a análise em N conversas recentes, mesmo com a automática desligada */
export async function analisarAmostraPerf(n: number): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!escopo.podeConfigurar) return { erro: "Só o gestor dispara análises manuais." };
  const { enfileirarAnalises, processarFila } = await import("@/lib/performance/ia/pipeline");
  await enfileirarAnalises({ dias: 3 });
  const r = await processarFila({ limite: Math.max(1, Math.min(10, n)), manual: true, prazoMs: 50_000 });
  await auditar(escopo.usuario.id, "ia_amostra_manual", null, null, r);
  revalidar();
  if (r.parado && r.processadas === 0) return { erro: r.parado };
  return { ok: `${r.processadas} conversa(s) analisada(s) · ${r.sugestoes} sugestão(ões) · custo estimado US$ ${r.custo.toFixed(3)}${r.erros ? ` · ${r.erros} com erro` : ""}` };
}

/** revisão humana de uma classificação da IA (fica registrada ao lado da original) */
export async function revisarAnalisePerf(id: string, revisao: { temperatura: string | null; status_lead: string | null; score: number | null; comentario: string }): Promise<Resposta> {
  const escopo = await exigirEscopo();
  if (!(escopo.papel === "admin" || escopo.papel === "supervisor" || escopo.papel === "gerente_unidade")) return { erro: "Seu perfil não revisa análises." };
  const admin = criarClienteAdmin();
  const { data: a } = await admin.from("analises_conversa").select("id, vendedor_id, temperatura, status_lead, score_atendimento").eq("id", id).maybeSingle();
  if (!a || !alcanca(escopo, a.vendedor_id as string | null)) return { erro: "Análise fora do seu escopo." };
  if (revisao.comentario.trim().length < 5) return { erro: "Explique a revisão em poucas palavras." };
  const temps = ["quente", "morno", "frio", "indeterminado"];
  const status = ["a_fazer", "assinou", "perdido", "sem_cobertura", "em_espera", "atencao", "encerrado"];
  const limpa = {
    temperatura: revisao.temperatura && temps.includes(revisao.temperatura) ? revisao.temperatura : null,
    status_lead: revisao.status_lead && status.includes(revisao.status_lead) ? revisao.status_lead : null,
    score: revisao.score !== null && Number.isFinite(revisao.score) ? Math.max(0, Math.min(100, Math.round(revisao.score))) : null,
    comentario: revisao.comentario.trim().slice(0, 500),
  };
  await admin.from("analises_conversa").update({ revisado_por: escopo.usuario.id, revisado_em: agora(), revisao: limpa }).eq("id", id);
  await auditar(escopo.usuario.id, "revisao_analise_ia", id, { temperatura: a.temperatura, status_lead: a.status_lead, score: a.score_atendimento }, limpa);
  revalidar();
  return { ok: "Revisão registrada. A classificação original da IA fica preservada ao lado." };
}

// ---------------------------------------------------------------------------
// Rotinas sob demanda (gestor) — as mesmas da rotina automática
// ---------------------------------------------------------------------------
export async function rodarRotinaPerf(rotina: "followups" | "alertas" | "recalcular" | "recalcular_todas", cursor?: string): Promise<Resposta & { cursor?: string | null }> {
  const escopo = await exigirEscopo();
  if (!escopo.podeConfigurar) return { erro: "Só o gestor roda rotinas manualmente." };
  let resumo: Record<string, unknown>;
  let texto: string;
  let proximo: string | null = null;
  if (rotina === "followups") {
    const { rodarFollowups } = await import("@/lib/performance/followups/job");
    const r = await rodarFollowups({ desdeDias: 30 });
    resumo = r;
    texto = `Follow-ups: ${r.importados} importado(s) do CRM/Meu Dia, ${r.atualizados} com situação atualizada.`;
  } else if (rotina === "alertas") {
    const { rodarAlertas } = await import("@/lib/performance/alertas/job");
    // rodada manual não notifica ninguém: notificação de crítico é só da rotina automática
    const r = await rodarAlertas({ notificar: false });
    resumo = r;
    texto = `Alertas: ${r.criados} novo(s), ${r.atualizados} atualizado(s), ${r.resolvidos} resolvido(s) sozinhos — sem notificar ninguém.`;
  } else {
    const { recalcularConversas } = await import("@/lib/performance/coleta/recalcular");
    const todas = rotina === "recalcular_todas";
    const r = await recalcularConversas({ todas, prazoMs: 40_000, desdeId: todas ? cursor : undefined });
    resumo = { feitas: r.feitas, restantes: r.restantes };
    proximo = r.restantes && todas ? r.ultimoId : null;
    texto = r.restantes ? `${r.feitas} conversa(s) recalculada(s). Ainda há mais — clique em continuar.` : `${r.feitas} conversa(s) recalculada(s). Concluído.`;
  }
  await auditar(escopo.usuario.id, "rotina_manual", rotina, null, resumo);
  revalidar();
  return { ok: texto, cursor: proximo };
}

/** coleta de um dia do chat de novo (lê o SZ; conversas já coletadas na versão atual são puladas) */
export async function recoletarDiaPerf(dia: string, pagina = 1): Promise<Resposta & { proximaPagina?: number | null }> {
  const escopo = await exigirEscopo();
  if (!escopo.podeConfigurar) return { erro: "Só o gestor roda a coleta manualmente." };
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  if (!dataValida(dia) || dia > hoje || dia < "2026-07-01") return { erro: "Escolha um dia entre 01/07/2026 e hoje." };
  const { abrirSessaoSz } = await import("@/lib/performance/coleta/sz");
  const { coletarDia, montarContextoColeta } = await import("@/lib/performance/coleta/job");
  const sz = await abrirSessaoSz();
  if (!sz) return { erro: "Credencial do robô do SZ não configurada em Integrações." };
  const ctx = await montarContextoColeta();
  const r = await coletarDia(dia, { sz, ctx, prazoMs: 40_000, paginaInicial: Math.max(1, Math.floor(pagina)) });
  await auditar(escopo.usuario.id, "rotina_manual", `coleta:${dia}`, null, { ...r, ultimoErro: r.ultimoErro?.slice(0, 200) });
  revalidar();
  const feitos = `${r.novas} nova(s), ${r.atualizadas} atualizada(s), ${r.puladas} já em dia${r.erros ? `, ${r.erros} com erro` : ""}`;
  if (r.falhouListagem) return { erro: `O SZ não respondeu (página ${r.proximaPagina}). ${feitos}. Tente de novo em alguns minutos.`, proximaPagina: r.proximaPagina };
  return { ok: r.proximaPagina === null ? `Dia ${dia.split("-").reverse().join("/")} lido até o fim: ${feitos}.` : `Parcial: ${feitos}. Clique em continuar (página ${r.proximaPagina}).`, proximaPagina: r.proximaPagina };
}

