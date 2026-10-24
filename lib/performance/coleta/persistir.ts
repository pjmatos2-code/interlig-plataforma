import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfigPerformance } from "../config";
import { mascararTexto } from "../mascara";
import type { CalculoConversa } from "./calculo";
import type { ConversaNormalizada } from "./modelo";
import { vincularTicketPuro, type TicketRef } from "./vinculo";

/** sobe quando a regra de cálculo por conversa mudar (força recálculo na próxima coleta) */
export const VERSAO_CALCULO = 2;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type ContextoColeta = {
  cfg: ConfigPerformance;
  ehDiaUtil: (dia: string) => boolean;
  resolverVendedor: (agenteNome: string) => string | null;
  popPorEquipe: Map<string, string | null>;
  ticketsPorProtocolo: Map<string, string>;
  ticketsPorTelefone: Map<string, TicketRef[]>;
  agentesSemVinculo: Set<string>;
};

/**
 * Vínculo agente do SZ → vendedor, sem chute: 1º o mapa explícito da
 * Administração (sz_atendentes_map), 2º nome completo idêntico ao cadastro.
 * Sem isso o agente fica "não mapeado" (aparece para o gestor vincular) —
 * nunca atribuímos esforço a alguém pelo primeiro nome.
 */
export async function carregarResolverVendedor(admin: SupabaseClient) {
  const [{ data: mapa }, { data: vends }] = await Promise.all([
    admin.from("sz_atendentes_map").select("sz_atendente_nome, vendedor_id"),
    admin.from("vendedores").select("id, nome"),
  ]);
  const porNome = new Map<string, string>();
  for (const v of vends ?? []) porNome.set(semAcento(String(v.nome)), v.id as string);
  for (const m of mapa ?? []) if (m.sz_atendente_nome && m.vendedor_id) porNome.set(semAcento(m.sz_atendente_nome), m.vendedor_id as string);
  return (nome: string) => porNome.get(semAcento(nome)) ?? null;
}

export async function carregarIndiceTickets(admin: SupabaseClient, desdeIso: string) {
  const porProtocolo = new Map<string, string>();
  const porTelefone = new Map<string, TicketRef[]>();
  for (let off = 0; off < 50_000; off += 1000) {
    const { data } = await admin
      .from("tickets")
      .select("id, telefone, sz_conversa_id, criado_em, fechado_em")
      .gte("criado_em", desdeIso)
      .order("id")
      .range(off, off + 999);
    for (const t of data ?? []) {
      if (t.sz_conversa_id) porProtocolo.set(String(t.sz_conversa_id), t.id as string);
      const tel = String(t.telefone ?? "").replace(/\D/g, "");
      if (tel.length >= 10) {
        const lista = porTelefone.get(tel) ?? [];
        lista.push({ id: t.id as string, criado: Date.parse(t.criado_em as string), fechado: t.fechado_em ? Date.parse(t.fechado_em as string) : null });
        porTelefone.set(tel, lista);
      }
    }
    if (!data || data.length < 1000) break;
  }
  for (const lista of porTelefone.values()) lista.sort((a, b) => a.criado - b.criado);
  return { porProtocolo, porTelefone };
}

const DIA = 86_400_000;

export async function gravarConversa(
  admin: SupabaseClient,
  ctx: ContextoColeta,
  conversa: ConversaNormalizada,
  calc: CalculoConversa
): Promise<string> {
  const ticketId = vincularTicketPuro(
    conversa.protocolo,
    conversa.telefone,
    calc.iniciada_em,
    calc.finalizada_em,
    ctx.ticketsPorProtocolo,
    ctx.ticketsPorTelefone
  );
  for (const m of conversa.mensagens)
    if (m.autor === "agente" && m.agenteNome && !ctx.resolverVendedor(m.agenteNome)) ctx.agentesSemVinculo.add(m.agenteNome);

  const agora = new Date().toISOString();
  const { data: linha, error } = await admin
    .from("conversas_atendimento")
    .upsert(
      {
        provedor: conversa.provedor,
        externo_id: conversa.externoId,
        protocolo: conversa.protocolo,
        ticket_id: ticketId,
        vendedor_id: calc.vendedor_principal_id,
        agente_nome: calc.agente_principal,
        equipe: conversa.equipe,
        pop_id: conversa.equipe ? (ctx.popPorEquipe.get(conversa.equipe) ?? null) : null,
        canal: conversa.canal,
        telefone: conversa.telefone,
        status_final: conversa.statusFinal,
        iniciada_em: calc.iniciada_em,
        iniciada_por: calc.iniciada_por,
        espera_inicio_em: calc.espera_inicio_em,
        humano_inicio_em: calc.humano_inicio_em,
        finalizada_em: calc.finalizada_em,
        encerrada_por_tempo: calc.encerrada_por_tempo,
        primeira_msg_cliente_em: calc.primeira_msg_cliente_em,
        primeira_resposta_em: calc.primeira_resposta_em,
        primeira_resposta_vendedor_id: calc.primeira_resposta_vendedor_id,
        primeira_resposta_seg: calc.primeira_resposta_seg,
        primeira_resposta_util_seg: calc.primeira_resposta_util_seg,
        cliente_sem_resposta: calc.cliente_sem_resposta,
        transferencias: calc.transferencias,
        msgs_cliente: calc.msgs_cliente,
        msgs_agente: calc.msgs_agente,
        msgs_automacao: calc.msgs_automacao,
        msgs_sistema: calc.msgs_sistema,
        cliente_por_dia: calc.cliente_por_dia,
        por_agente: calc.por_agente,
        eventos: conversa.eventos,
        versao_calculo: VERSAO_CALCULO,
        atualizada_em: agora,
      },
      { onConflict: "provedor,externo_id" }
    )
    .select("id")
    .single();
  if (error || !linha) throw new Error(`gravar conversa ${conversa.externoId}: ${error?.message ?? "sem retorno"}`);

  // texto mascarado; além da retenção configurada, nem grava o conteúdo
  const corteRetencao = Date.now() - ctx.cfg.ia.retencao_texto_dias * DIA;
  const nomes = [conversa.contatoNome];
  const mensagens = conversa.mensagens.map((m, i) => ({
    conversa_id: linha.id as string,
    externo_id: m.externoId,
    ordem: i,
    autor: m.autor,
    agente_nome: m.agenteNome,
    vendedor_id: m.agenteNome ? ctx.resolverVendedor(m.agenteNome) : null,
    enviada_em: m.em,
    tipo: m.tipo,
    categoria: m.categoria,
    tamanho: m.texto.length,
    texto: Date.parse(m.em) >= corteRetencao && m.texto ? mascararTexto(m.texto, nomes).slice(0, 2000) : null,
  }));
  for (let i = 0; i < mensagens.length; i += 500) {
    const { error: e2 } = await admin
      .from("conversas_mensagens")
      .upsert(mensagens.slice(i, i + 500), { onConflict: "conversa_id,externo_id", ignoreDuplicates: true });
    if (e2) throw new Error(`gravar mensagens ${conversa.externoId}: ${e2.message}`);
  }
  return linha.id as string;
}
