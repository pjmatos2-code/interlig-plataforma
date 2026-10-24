import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularConversa } from "./calculo";
import { montarContextoColeta } from "./job";
import type { ConversaNormalizada, EventoCiclo, MensagemNormalizada } from "./modelo";
import { VERSAO_CALCULO } from "./persistir";
import { vincularTicketPuro } from "./vinculo";

/**
 * Reprocessamento das métricas por conversa a partir do que já está no
 * banco — sem chamar o SZ (24/10/2026). Usado quando a regra de cálculo
 * muda de versão, quando o gestor altera o expediente ou o vínculo de
 * agentes, ou para revincular conversas a tickets criados depois.
 * Mensagens com texto já expirado pela retenção usam só o tamanho original.
 */
export async function recalcularConversas(opts: { todas?: boolean; prazoMs?: number; ids?: string[]; /** retoma o modo "todas" de onde parou */ desdeId?: string } = {}) {
  const admin = criarClienteAdmin();
  const ctx = await montarContextoColeta();
  const limite = opts.prazoMs ? Date.now() + opts.prazoMs : null;
  let feitas = 0;
  let restantes = false;
  let ultimoId = opts.desdeId ?? "00000000-0000-0000-0000-000000000000";
  for (let rodada = 0; rodada < 200; rodada++) {
    if (limite && Date.now() > limite) {
      restantes = true;
      break;
    }
    let q = admin
      .from("conversas_atendimento")
      .select("id, provedor, externo_id, protocolo, equipe, canal, agente_nome, telefone, status_final, finalizada_em, eventos, versao_calculo")
      .order("id")
      .limit(50);
    if (opts.ids?.length) q = q.in("id", opts.ids);
    else if (!opts.todas) q = q.lt("versao_calculo", VERSAO_CALCULO);
    else q = q.gt("id", ultimoId);
    const { data: lote } = await q;
    if (!lote?.length) break;
    for (const c of lote) {
      // prazo conferido a cada conversa: uma rodada inteira passaria do limite da função
      if (limite && Date.now() > limite) {
        restantes = true;
        break;
      }
      const { data: msgs } = await admin
        .from("conversas_mensagens")
        .select("externo_id, autor, agente_nome, enviada_em, tipo, categoria, texto, tamanho")
        .eq("conversa_id", c.id)
        .order("ordem");
      const mensagens: MensagemNormalizada[] = (msgs ?? []).map((m) => ({
        externoId: String(m.externo_id),
        autor: m.autor as MensagemNormalizada["autor"],
        agenteNome: (m.agente_nome as string | null) ?? null,
        em: new Date(m.enviada_em as string).toISOString(),
        tipo: (m.tipo as string | null) ?? null,
        categoria: (m.categoria as string | null) ?? null,
        // a regra de "cortesia" só olha o tamanho: texto expirado vira placeholder
        texto: (m.texto as string | null) ?? "x".repeat(Number(m.tamanho ?? 0)),
      }));
      const conversa: ConversaNormalizada = {
        provedor: "szchat",
        externoId: String(c.externo_id),
        protocolo: (c.protocolo as string | null) ?? null,
        equipe: (c.equipe as string | null) ?? null,
        canal: (c.canal as string | null) ?? null,
        agenteNome: (c.agente_nome as string | null) ?? null,
        agenteExternoId: null,
        contatoNome: null,
        telefone: (c.telefone as string | null) ?? null,
        statusFinal: (c.status_final as string | null) ?? null,
        finalizadaEm: c.finalizada_em ? new Date(c.finalizada_em as string).toISOString() : null,
        eventos: ((c.eventos as EventoCiclo[]) ?? []).map((e) => ({ ...e, em: new Date(e.em).toISOString() })),
        mensagens,
      };
      const calc = calcularConversa(conversa, ctx.resolverVendedor, ctx.cfg.expediente, ctx.ehDiaUtil);
      const ticketId = vincularTicketPuro(conversa.protocolo, conversa.telefone, calc.iniciada_em, calc.finalizada_em, ctx.ticketsPorProtocolo, ctx.ticketsPorTelefone);
      const { error: eUp } = await admin
        .from("conversas_atendimento")
        .update({
          ticket_id: ticketId,
          vendedor_id: calc.vendedor_principal_id,
          agente_nome: calc.agente_principal,
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
          versao_calculo: VERSAO_CALCULO,
          atualizada_em: new Date().toISOString(),
        })
        .eq("id", c.id);
      if (eUp) throw new Error(`recalcular ${c.id}: ${eUp.message}`);
      // a análise da IA acompanha o vínculo novo (atendente mapeado depois, lead criado depois)
      await admin.from("analises_conversa").update({ vendedor_id: calc.vendedor_principal_id, ticket_id: ticketId }).eq("conversa_id", c.id);
      // vínculo dos agentes nas mensagens também pode ter mudado: uma
      // atualização por agente da conversa, não por mensagem
      const nomes = new Set(mensagens.filter((x) => x.autor === "agente" && x.agenteNome).map((x) => x.agenteNome!));
      for (const nome of nomes) {
        await admin
          .from("conversas_mensagens")
          .update({ vendedor_id: ctx.resolverVendedor(nome) })
          .eq("conversa_id", c.id)
          .eq("agente_nome", nome);
      }
      feitas++;
      ultimoId = c.id as string;
    }
    if (opts.ids?.length || restantes) break;
  }
  return { feitas, restantes, ultimoId };
}
