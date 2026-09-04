import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { carregarDialogo, type Conversa } from "@/lib/sz/conversas";
import { resumirPorRegras, type PlanoRef } from "@/lib/sz/resumo";

/**
 * Enriquecimento de tickets ABERTOS durante a conversa (pedido do gestor,
 * 03/09/2026): negociação longa não pode esperar o encerramento — a vendedora
 * esquece o que foi tratado, principalmente nas não convertidas.
 *
 * O relatório do SZ não lista conversas abertas, mas a BUSCA POR PROTOCOLO
 * (~600ms) devolve a conversa com id interno, telefone e agente. A cada ciclo,
 * os tickets abertos nascidos do SZ (webhook da transferência ou robô) têm
 * telefone/vendedora completados e o resumo + próxima abordagem atualizados
 * com o diálogo até aqui.
 */

const soDigitos = (t: string | null): string | null => {
  if (!t) return null;
  let d = t.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d || null;
};

export type ResultadoEnriquecimento = {
  ok: boolean;
  verificados: number;
  atualizados: number;
  erro?: string;
};

export async function enriquecerTicketsAbertos(orcamentoMs = 40_000): Promise<ResultadoEnriquecimento> {
  const limite = Date.now() + orcamentoMs;
  const cred = await lerCredenciaisSz();
  if (!cred) return { ok: false, verificados: 0, atualizados: 0, erro: "credencial SZ ausente" };

  const admin = criarClienteAdmin();
  const corte2h = new Date(Date.now() - 2 * 3600_000).toISOString();
  const corte30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

  // prioridade: sem telefone primeiro (identidade), depois resumo mais velho
  const { data: pendentes } = await admin
    .from("tickets")
    .select("id, sz_conversa_id, telefone, vendedor_id, pop_id, criado_em, resumo_em")
    .neq("etapa", "fechado")
    .not("sz_conversa_id", "is", null)
    .gte("criado_em", corte30d)
    .or(`telefone.is.null,resumo_em.is.null,resumo_em.lt.${corte2h}`)
    .order("resumo_em", { ascending: true, nullsFirst: true })
    .limit(10);
  if (!pendentes?.length) return { ok: true, verificados: 0, atualizados: 0 };

  try {
    const sz = new SessaoSz(cred);
    await sz.login();

    const [{ data: planosData }, { data: mapaAtendentes }, { data: vends }, { data: cfgRow }] =
      await Promise.all([
        admin.from("planos").select("id, nome, velocidade").eq("ativo", true).gt("valor_referencia", 0),
        admin.from("sz_atendentes_map").select("sz_atendente_nome, vendedor_id"),
        admin.from("vendedores").select("id, nome, pop_id").eq("ativo", true),
        admin.from("integracoes_config").select("config").eq("sistema", "szchat").maybeSingle(),
      ]);
    const planos = (planosData ?? []) as PlanoRef[];
    const marcadorFechamento =
      ((cfgRow?.config as Record<string, unknown>)?.frase_fechamento as string) || "venda concluída";
    const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const acharVendedora = (agente: string | null) => {
      if (!agente) return null;
      const doMapa = (mapaAtendentes ?? []).find(
        (m) => m.sz_atendente_nome && semAcento(m.sz_atendente_nome) === semAcento(agente)
      );
      if (doMapa?.vendedor_id) return doMapa.vendedor_id as string;
      const primeiro = semAcento(agente).split(/\s+/)[0];
      if (!primeiro) return null;
      const cands = (vends ?? []).filter((v) => semAcento(v.nome).includes(primeiro));
      return cands.length === 1 ? cands[0].id : null;
    };

    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    let verificados = 0;
    let atualizados = 0;

    for (const t of pendentes) {
      if (Date.now() > limite) break;
      const proto = String(t.sz_conversa_id);
      // a janela vem da DATA DO PROTOCOLO (AAAAMMDD...): o ticket pode ter
      // sido criado dias depois da conversa começar (webhook reprocessado) e
      // a janela pela criação do ticket ficava invertida → busca vazia
      const doProto = proto.match(/^(\d{4})(\d{2})(\d{2})/);
      const inicio = doProto
        ? `${doProto[1]}-${doProto[2]}-${doProto[3]}`
        : String(t.criado_em).slice(0, 10);
      const dateParam = encodeURIComponent(JSON.stringify({ start: inicio, end: hoje }));
      const r = await sz.api(
        `/reports/messages/filter?page=1&channel=&contact=&protocol=${proto}&agent=&contactName=&attendance=&platform_id=&options_conversations=all&view_conversation=default&data_privacy=hidden&typeStatus=all&copilot_score=&attendance_classification=&closing_reason=&finalCampaign=&finalAgent=&date=${dateParam}`
      );
      if (!r.ok) continue;
      const j = (await r.json()) as { data?: Record<string, unknown>[] };
      const cv = (j.data ?? [])[0];
      verificados += 1;
      if (!cv) continue; // conversa fora da janela ou ainda não indexada

      const atualizacao: Record<string, unknown> = {};
      const tel = soDigitos((cv.platform_id as string) ?? null);
      if (!t.telefone && tel) atualizacao.telefone = tel;
      const agente = (cv.agent as { name?: string } | undefined)?.name ?? null;
      const vendedorId = acharVendedora(agente);
      if (!t.vendedor_id && vendedorId) atualizacao.vendedor_id = vendedorId;

      // transcript até aqui → resumo e próxima abordagem sempre frescos
      const conversa: Conversa = {
        id: String(cv._id),
        equipe: "",
        nome: String(cv.name ?? ""),
        telefone: (cv.platform_id as string) || null,
        agente,
        protocolo: proto,
        quando: (cv.dateFormatted as string) || null,
        finalizada: Boolean(cv.finished_at),
        dialogo: [],
      };
      await carregarDialogo(sz, conversa, { inicio, fim: hoje });
      if (conversa.dialogo.length > 0) {
        const resumo = resumirPorRegras(conversa, planos, { marcadorFechamento });
        atualizacao.resumo_tratativa = resumo.resumo;
        atualizacao.proxima_abordagem = resumo.proxima;
        atualizacao.resumo_em = new Date().toISOString();
      } else if (Object.keys(atualizacao).length === 0) {
        // nada novo e sem diálogo: carimba a verificação para não repetir já
        atualizacao.resumo_em = new Date().toISOString();
      }

      const { error } = await admin.from("tickets").update(atualizacao).eq("id", t.id);
      if (!error) atualizados += 1;
    }

    return { ok: true, verificados, atualizados };
  } catch (e) {
    return { ok: false, verificados: 0, atualizados: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}
