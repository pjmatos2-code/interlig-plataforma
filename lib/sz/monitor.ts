import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { EQUIPES_CRM, telefoneBr } from "@/lib/sz/conversas";
import { normalizarTelefone } from "@/lib/indicadores/crm";

/**
 * Ticket nasce quando a agente ASSUME a conversa (decisão do gestor,
 * 01/10/2026). O filtro de entrada (consulta Consult Center, adiantamento de
 * fatura) acontece DURANTE a negociação — se o ticket só nascesse no
 * encerramento, não haveria mais como falar com o cliente.
 *
 * O relatório do SZ só lista conversas ENCERRADAS e o painel de Monitoramento
 * recebe as abertas por websocket — mas a mesma tela carrega o estado inicial
 * por POST /monitoring/session/all (attendance / navigating / wait). A cada
 * ciclo, toda conversa EM ATENDIMENTO nas equipes comerciais, com agente
 * atribuída, ganha ticket — sem depender do nó do fluxo do 0800.
 */

export type ResultadoMonitor = {
  ok: boolean;
  abertas: number;
  criados: number;
  vinculados: number;
  erro?: string;
};

type Sessao = {
  _id: string;
  name?: string | null;
  protocol?: string | null;
  campaign_id?: string | null;
  agent_id?: string | null;
  wa_id?: string | null;
  platform_id?: string | null;
  status?: string | null;
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function sincronizarAtendimentosAbertos(): Promise<ResultadoMonitor> {
  const cred = await lerCredenciaisSz();
  if (!cred) return { ok: false, abertas: 0, criados: 0, vinculados: 0, erro: "credencial SZ ausente" };

  const admin = criarClienteAdmin();
  try {
    const sz = new SessaoSz(cred);
    await sz.login();

    const rSess = await sz.api("/monitoring/session/all", { method: "POST", body: {} });
    if (!rSess.ok) return { ok: false, abertas: 0, criados: 0, vinculados: 0, erro: `monitoramento HTTP ${rSess.status}` };
    const estado = (await rSess.json()) as { attendance?: Sessao[] };
    const comerciais = (estado.attendance ?? []).filter(
      (x) => x.campaign_id && EQUIPES_CRM[x.campaign_id] && x.agent_id && x.protocol
    );
    if (comerciais.length === 0) return { ok: true, abertas: 0, criados: 0, vinculados: 0 };

    // ---------- agente → vendedora (mapa aprendido + nome) ----------
    const [{ data: mapa }, { data: vends }, { data: equipes }] = await Promise.all([
      admin.from("sz_atendentes_map").select("sz_atendente_id, vendedor_id"),
      admin.from("vendedores").select("id, nome, pop_id").eq("ativo", true),
      admin.from("sz_equipes_habilitadas").select("nome, pop_id, ativo"),
    ]);
    const porAgenteId = new Map(
      (mapa ?? []).filter((m) => m.sz_atendente_id).map((m) => [String(m.sz_atendente_id), m.vendedor_id as string | null])
    );
    const popDaVendedora = new Map((vends ?? []).map((v) => [v.id as string, (v.pop_id as string | null) ?? null]));

    const idsSemMapa = [...new Set(comerciais.map((x) => String(x.agent_id)))].filter((id) => !porAgenteId.has(id));
    if (idsSemMapa.length > 0) {
      const rAg = await sz.api("/monitoring/online-agents", { method: "POST", body: {} });
      const ags = rAg.ok ? ((await rAg.json()) as { _id?: string; name?: string }[]) : [];
      for (const ag of Array.isArray(ags) ? ags : []) {
        const id = String(ag._id ?? "");
        if (!idsSemMapa.includes(id) || !ag.name) continue;
        // casa pelo primeiro nome — só quando inequívoco
        const primeiro = semAcento(ag.name).split(/\s+/)[0];
        const cands = (vends ?? []).filter((v) => semAcento(v.nome as string).split(/\s+/)[0] === primeiro);
        const vendedorId = cands.length === 1 ? (cands[0].id as string) : null;
        porAgenteId.set(id, vendedorId);
        // aprendizado: as próximas rodadas casam direto pelo id
        if (vendedorId)
          await admin.from("sz_atendentes_map").insert({
            sz_atendente_id: id,
            sz_atendente_nome: ag.name,
            vendedor_id: vendedorId,
          });
      }
    }

    const popDaEquipe = (campanhaId: string): string | null => {
      const nome = semAcento(EQUIPES_CRM[campanhaId] ?? "");
      return (
        ((equipes ?? []).find((e) => semAcento(String(e.nome)) === nome && e.ativo)?.pop_id as string | null) ?? null
      );
    };

    // ---------- anti-duplicidade: protocolo e telefone ----------
    const protocolos = comerciais.map((x) => String(x.protocol));
    const { data: porProtocolo } = await admin
      .from("tickets")
      .select("sz_conversa_id")
      .in("sz_conversa_id", protocolos);
    const jaTem = new Set((porProtocolo ?? []).map((t) => String(t.sz_conversa_id)));
    const { data: abertos } = await admin
      .from("tickets")
      .select("id, telefone, sz_conversa_id, vendedor_id")
      .neq("etapa", "fechado")
      .not("telefone", "is", null)
      .limit(3000);
    const abertoPorTelefone = new Map(
      (abertos ?? []).map((t) => [normalizarTelefone(t.telefone as string), t])
    );

    let criados = 0;
    let vinculados = 0;
    const agora = new Date().toISOString();
    for (const x of comerciais) {
      const protocolo = String(x.protocol);
      if (jaTem.has(protocolo)) continue;

      const telefone = telefoneBr(x.wa_id ?? null) ?? telefoneBr(x.platform_id ?? null);
      const vendedorId = porAgenteId.get(String(x.agent_id)) ?? null;
      const popId = (vendedorId ? popDaVendedora.get(vendedorId) : null) ?? popDaEquipe(String(x.campaign_id));

      // mesmo cliente com ticket aberto: amarra a conversa nele
      const existente = telefone ? abertoPorTelefone.get(normalizarTelefone(telefone)) : undefined;
      if (existente) {
        const upd: Record<string, unknown> = { atualizado_em: agora };
        if (!existente.sz_conversa_id) upd.sz_conversa_id = protocolo;
        if (!existente.vendedor_id && vendedorId) upd.vendedor_id = vendedorId;
        await admin.from("tickets").update(upd).eq("id", existente.id);
        vinculados += 1;
        continue;
      }

      const { data: novo, error } = await admin
        .from("tickets")
        .insert({
          origem_criacao: "sz_auto",
          sz_conversa_id: protocolo,
          cliente_nome: (x.name ?? "").trim() || "Sem nome",
          telefone,
          vendedor_id: vendedorId,
          pop_id: popId,
          // a agente já assumiu e está conversando: Contato inicial
          etapa: "em_atendimento",
          primeira_tratativa_em: agora,
        })
        .select("id")
        .single();
      if (error || !novo) continue;
      jaTem.add(protocolo);
      criados += 1;
      await admin.from("ticket_eventos").insert({
        ticket_id: novo.id,
        tipo: "webhook_sz",
        dados: {
          origem: "monitoramento",
          texto: `Ticket criado quando a agente assumiu a conversa no SZ (protocolo ${protocolo}, ${EQUIPES_CRM[String(x.campaign_id)]}).`,
        },
      });
    }

    return { ok: true, abertas: comerciais.length, criados, vinculados };
  } catch (e) {
    return { ok: false, abertas: 0, criados: 0, vinculados: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}
