import "server-only";
import { createHash } from "node:crypto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarConfig, carregarDiasUteis } from "../config-servidor";
import { somarSegundosUteis } from "../expediente";
import { nomesInformadosNaConversa } from "../mascara";
import { custoEstimadoUsd } from "./custos";
import { montarPrompt, type MensagemPrompt } from "./prompt";
import { provedorConfigurado } from "./provedor";
import { sanearAnalise, VERSAO_ANALISE } from "./schema";

/**
 * Pipeline assíncrono da IA (24/10/2026):
 *  1) enfileira conversas novas ou que ganharam mensagens (hash da entrada —
 *     a mesma conversa não é reprocessada à toa);
 *  2) processa a fila em lote com orçamento de tempo, teto diário de
 *     análises e teto mensal de custo; sem provedor/chave, não processa;
 *  3) valida a saída, grava classificação + versão + custo e, quando há
 *     próximo passo útil, cria SUGESTÃO de follow-up (aceite humano).
 * Falha da IA nunca bloqueia o atendimento nem os indicadores (o módulo
 * segue em modo determinístico).
 */

const hashEntrada = (partes: (string | number)[]) => createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 32);

export async function enfileirarAnalises(opts: { dias?: number } = {}) {
  const admin = criarClienteAdmin();
  const cfg = await carregarConfig();
  const desde = new Date(Date.now() - (opts.dias ?? 3) * 86_400_000).toISOString();
  const { data: conversas } = await admin
    .from("conversas_atendimento")
    .select("id, ticket_id, vendedor_id, msgs_cliente, msgs_agente, cliente_sem_resposta, finalizada_em")
    .gte("finalizada_em", desde)
    .gte("msgs_cliente", cfg.ia.min_msgs_cliente)
    .order("finalizada_em", { ascending: false })
    .limit(2000);
  if (!conversas?.length) return { enfileiradas: 0 };
  // assinatura da entrada: total e última mensagem
  const novas: Record<string, unknown>[] = [];
  for (let i = 0; i < conversas.length; i += 100) {
    const lote = conversas.slice(i, i + 100);
    const { data: ultimas } = await admin.rpc("performance_assinatura_conversas", { p_ids: lote.map((c) => c.id) });
    const assinatura = new Map(((ultimas ?? []) as { conversa_id: string; total: number; ultima: string }[]).map((u) => [u.conversa_id, u]));
    const { data: tickets } = await admin.from("tickets").select("id, etapa, urgencia").in("id", lote.map((c) => c.ticket_id).filter(Boolean) as string[]);
    const tk = new Map((tickets ?? []).map((t) => [t.id as string, t]));
    for (const c of lote) {
      const a = assinatura.get(c.id as string);
      if (!a) continue;
      const t = c.ticket_id ? tk.get(c.ticket_id as string) : undefined;
      const prioridade = c.cliente_sem_resposta || t?.urgencia === "alta" ? 1 : t && t.etapa !== "fechado" ? 3 : 7;
      novas.push({
        conversa_id: c.id,
        ticket_id: c.ticket_id,
        vendedor_id: c.vendedor_id,
        versao: VERSAO_ANALISE,
        hash_entrada: hashEntrada([VERSAO_ANALISE, String(c.id), a.total, a.ultima]),
        status: "pendente",
        prioridade,
      });
    }
  }
  let enfileiradas = 0;
  for (let i = 0; i < novas.length; i += 200) {
    const { data, error } = await admin.from("analises_conversa").upsert(novas.slice(i, i + 200), { onConflict: "conversa_id,versao,hash_entrada", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`enfileirar análises: ${error.message}`);
    enfileiradas += data?.length ?? 0;
  }
  return { enfileiradas };
}

export type ResumoProcessamento = { processadas: number; erros: number; sugestoes: number; custo: number; parado?: string };

export async function processarFila(opts: { limite?: number; prazoMs?: number; manual?: boolean } = {}): Promise<ResumoProcessamento> {
  const admin = criarClienteAdmin();
  const cfg = await carregarConfig();
  const resumo: ResumoProcessamento = { processadas: 0, erros: 0, sugestoes: 0, custo: 0 };
  if (!cfg.modulo_ativo) return { ...resumo, parado: "módulo desativado" };
  if (!cfg.ia.habilitada && !opts.manual) return { ...resumo, parado: "análise por IA desligada nas Configurações" };
  const provedor = await provedorConfigurado(cfg.ia.modelo || null);
  if (!provedor) return { ...resumo, parado: "sem chave da Anthropic em Integrações" };

  // tetos: análises do dia e custo do mês
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const [{ count: hojeFeitas }, { data: doMes }] = await Promise.all([
    admin.from("analises_conversa").select("id", { count: "exact", head: true }).eq("status", "concluida").gte("concluido_em", `${hoje}T00:00:00-03:00`),
    admin.from("analises_conversa").select("custo_estimado").gte("concluido_em", `${hoje.slice(0, 7)}-01T00:00:00-03:00`).not("custo_estimado", "is", null).limit(20_000),
  ]);
  const custoMes = (doMes ?? []).reduce((s, a) => s + Number(a.custo_estimado ?? 0), 0);
  if (custoMes >= cfg.ia.custo_max_mensal_usd) return { ...resumo, parado: `teto mensal de custo atingido (US$ ${custoMes.toFixed(2)})` };
  const restantesHoje = Math.max(0, cfg.ia.limite_diario - (hojeFeitas ?? 0));
  if (restantesHoje === 0) return { ...resumo, parado: "limite diário de análises atingido" };

  const limite = Math.min(opts.limite ?? 10, restantesHoje);
  const prazo = opts.prazoMs ? Date.now() + opts.prazoMs : null;
  const { data: run } = await admin.from("analise_runs").insert({ data_referencia: hoje, status: "rodando" }).select("id").single();
  const [{ data: planosBrutos }, { data: argumentos }, ehDiaUtil, { data: bairros }] = await Promise.all([
    admin.from("planos").select("nome, velocidade, valor_referencia").eq("ativo", true).gt("valor_referencia", 0).order("valor_referencia"),
    admin.from("config_comercial").select("valor").eq("chave", "argumentos_valor").maybeSingle(),
    carregarDiasUteis(hoje, new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)),
    admin.from("bairros_geo").select("bairro"),
  ]);
  // rede de privacidade: nomes de bairro conhecidos nunca ficam no texto da análise
  const nomesBairro = [...new Set((bairros ?? []).map((b) => String(b.bairro ?? "").replace(/^bairro\s+/i, "").trim()).filter((b) => b.length >= 4))];
  const planos = (planosBrutos ?? []).map((p) => ({ nome: p.nome as string, velocidade: (p.velocidade as string | null) ?? null, preco: Number(p.valor_referencia ?? 0) || null }));
  const argumentosTexto = typeof argumentos?.valor === "string" ? (argumentos.valor as string) : argumentos?.valor ? JSON.stringify(argumentos.valor).slice(0, 1500) : null;

  try {
    for (let i = 0; i < limite; i++) {
      if (prazo && Date.now() > prazo) break;
      if (resumo.custo + custoMes >= cfg.ia.custo_max_mensal_usd) {
        resumo.parado = "teto mensal de custo atingido";
        break;
      }
      // pega 1 pendente e marca "processando" (evita duas execuções pegarem a mesma)
      const { data: candidatas } = await admin
        .from("analises_conversa")
        .select("id, conversa_id, ticket_id, vendedor_id, tentativas")
        .eq("status", "pendente")
        .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${new Date().toISOString()}`)
        .order("prioridade")
        .order("criado_em")
        .limit(1);
      const alvo = candidatas?.[0];
      if (!alvo) break;
      const { data: travada } = await admin
        .from("analises_conversa")
        .update({ status: "processando", iniciado_em: new Date().toISOString(), tentativas: Number(alvo.tentativas) + 1 })
        .eq("id", alvo.id)
        .eq("status", "pendente")
        .select("id");
      if (!travada?.length) continue;

      const [{ data: msgs }, { data: conv }, { data: tk }] = await Promise.all([
        admin.from("conversas_mensagens").select("externo_id, autor, agente_nome, enviada_em, texto, tipo").eq("conversa_id", alvo.conversa_id).order("ordem").limit(2000),
        admin.from("conversas_atendimento").select("equipe").eq("id", alvo.conversa_id).maybeSingle(),
        alvo.ticket_id ? admin.from("tickets").select("cliente_nome").eq("id", alvo.ticket_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const tokensCliente = String((tk as { cliente_nome?: string } | null)?.cliente_nome ?? "").split(/\s+/).filter((t) => t.length >= 4);
      const mensagens: MensagemPrompt[] = (msgs ?? []).map((m) => ({
        id: m.externo_id as string,
        autor: m.autor as MensagemPrompt["autor"],
        agente: (m.agente_nome as string | null) ?? null,
        em: m.enviada_em as string,
        texto: (m.texto as string | null) ?? null,
        tipo: (m.tipo as string | null) ?? null,
      }));
      if (!mensagens.some((m) => m.texto)) {
        await admin.from("analises_conversa").update({ status: "descartada", erro: "texto das mensagens expirado pela retenção" }).eq("id", alvo.id);
        continue;
      }
      const prompt = montarPrompt({ mensagens, planos, equipe: (conv?.equipe as string | null) ?? null, argumentos: argumentosTexto });
      const r = await provedor.analisar({ system: prompt.system, user: prompt.user });
      const custo = custoEstimadoUsd(provedor.modelo, r.tokensEntrada, r.tokensSaida);
      resumo.custo += custo;
      if (!r.ok) {
        resumo.erros++;
        const definitivo = !r.tentarDeNovo || Number(alvo.tentativas) + 1 >= 3;
        await admin
          .from("analises_conversa")
          .update({
            status: definitivo ? (r.motivo === "recusa" ? "descartada" : "erro") : "pendente",
            erro: `${r.motivo}: ${r.detalhe}`,
            proxima_tentativa_em: definitivo ? null : new Date(Date.now() + 15 * 60_000 * (Number(alvo.tentativas) + 1)).toISOString(),
            tokens_entrada: r.tokensEntrada || null,
            tokens_saida: r.tokensSaida || null,
            custo_estimado: custo || null,
            provedor: provedor.nome,
            modelo: provedor.modelo,
          })
          .eq("id", alvo.id);
        if (r.motivo === "credencial") {
          resumo.parado = r.detalhe;
          break;
        }
        continue;
      }
      const a = sanearAnalise(r.json, {
        totalMensagens: prompt.totalMensagens,
        planos: planos.map((p) => p.nome),
        houveAtendimentoHumano: mensagens.some((m) => m.autor === "agente"),
        pesos: cfg.ia.rubrica,
        termosProibidos: [...nomesBairro, ...tokensCliente, ...nomesInformadosNaConversa(mensagens.map((m) => ({ autor: m.autor, texto: m.texto })))],
      });
      if (!a) {
        resumo.erros++;
        await admin.from("analises_conversa").update({ status: "erro", erro: "saída reprovada na validação", provedor: provedor.nome, modelo: r.modelo, tokens_entrada: r.tokensEntrada, tokens_saida: r.tokensSaida, custo_estimado: custo }).eq("id", alvo.id);
        continue;
      }
      // evidência: número da mensagem → id, para destacar na tela
      const resultado = { ...a, evidencias: a.evidencias.map((e) => ({ ...e, mensagem_id: prompt.ids[e.mensagem - 1] ?? null })) };
      await admin
        .from("analises_conversa")
        .update({
          status: "concluida",
          resultado,
          temperatura: a.temperatura,
          intencao_compra: a.intencao_compra,
          objecoes: a.objecoes,
          status_lead: a.status_lead,
          prioridade_lead: a.prioridade,
          score_atendimento: a.score_atendimento,
          confianca: a.confianca,
          provedor: provedor.nome,
          modelo: r.modelo,
          tokens_entrada: r.tokensEntrada,
          tokens_saida: r.tokensSaida,
          custo_estimado: custo,
          erro: null,
          concluido_em: new Date().toISOString(),
        })
        .eq("id", alvo.id);
      resumo.processadas++;

      // sugestão de follow-up: só lead aberto e sem tarefa equivalente
      if (a.followup_sugerido && alvo.ticket_id && a.status_lead === "a_fazer") {
        const [{ data: t }, { data: abertos }] = await Promise.all([
          admin.from("tickets").select("etapa, vendedor_id").eq("id", alvo.ticket_id).maybeSingle(),
          admin.from("followups").select("id").eq("ticket_id", alvo.ticket_id).in("status", ["sugerido", "programado", "pendente"]).limit(1),
        ]);
        if (t && t.etapa !== "fechado" && !abertos?.length) {
          const base = new Date().toISOString();
          const prazo = somarSegundosUteis(base, Math.max(1, a.followup_sugerido.em_dias_uteis) * 10 * 3600, cfg.expediente, ehDiaUtil);
          const { data: f } = await admin
            .from("followups")
            .upsert(
              {
                chave: `ia:${alvo.id}`,
                ticket_id: alvo.ticket_id,
                vendedor_id: (t.vendedor_id as string | null) ?? alvo.vendedor_id,
                tipo: "retorno",
                motivo: a.followup_sugerido.motivo,
                proximo_passo: a.followup_sugerido.acao,
                onde_parou: a.onde_parou,
                prioridade: a.prioridade,
                origem: "ia",
                status: "sugerido",
                prazo,
                data_referencia: prazo.slice(0, 10),
                analise_id: alvo.id,
              },
              { onConflict: "chave", ignoreDuplicates: true }
            )
            .select("id");
          if (f?.[0]) {
            resumo.sugestoes++;
            await admin.from("followups_historico").insert({ followup_id: f[0].id, evento: "sugerido", dados: { analise_id: alvo.id } });
          }
        }
      }
    }
  } finally {
    if (run?.id)
      await admin
        .from("analise_runs")
        .update({ finalizado_em: new Date().toISOString(), conversas_analisadas: resumo.processadas, followups_gerados: resumo.sugestoes, custo_estimado: resumo.custo, status: resumo.parado ? "parcial" : "concluido", erro: resumo.parado ?? null })
        .eq("id", run.id);
  }
  return resumo;
}

/** apaga o TEXTO das mensagens além da retenção (metadados e tempos ficam) */
export async function purgarTextosExpirados() {
  const cfg = await carregarConfig();
  // piso de 7 dias: uma configuração errada (0) não apaga o texto de tudo de uma vez
  const corte = new Date(Date.now() - Math.max(7, cfg.ia.retencao_texto_dias) * 86_400_000).toISOString();
  const { data, error } = await criarClienteAdmin().from("conversas_mensagens").update({ texto: null }).lt("enviada_em", corte).not("texto", "is", null).select("id");
  if (error) throw new Error(`retenção: ${error.message}`);
  return { apagados: data?.length ?? 0 };
}
