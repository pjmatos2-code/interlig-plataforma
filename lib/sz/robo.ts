import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { listarConversasComerciais, carregarDialogo, EQUIPES_CRM } from "@/lib/sz/conversas";
import { resumirPorRegras, type PlanoRef } from "@/lib/sz/resumo";

function soDigitos(t: string | null): string | null {
  if (!t) return null;
  let d = t.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d || null;
}

function hojeSantarem(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export type ResultadoRobo = {
  ok: boolean;
  lidas: number;
  criados: number;
  atualizados: number;
  /** false = o orçamento de tempo acabou antes de processar tudo (o próximo ciclo continua) */
  completo?: boolean;
  erro?: string;
  janela?: string;
};

/**
 * Rotina noturna: lê as conversas comerciais do dia no SZ, resume cada uma e
 * grava no CRM (cria ticket em "Contato inicial" ou atualiza o existente),
 * com resumo, próxima abordagem, urgência e follow-up para a manhã seguinte.
 */
export async function rodarRoboSz(dia?: string, orcamentoMs = 90_000): Promise<ResultadoRobo> {
  // orçamento de tempo: o ciclo roda em serverless (maxDuration 300s) junto
  // com o sync — sem teto, a janela de 5 dias estourava o limite e a função
  // morria sem criar nada. O dedup (telefone/protocolo) e o pulo de resumo
  // fresco fazem o próximo ciclo continuar exatamente de onde este parou.
  const limite = Date.now() + orcamentoMs;
  const cred = await lerCredenciaisSz();
  if (!cred) return { ok: false, lidas: 0, criados: 0, atualizados: 0, erro: "credencial do robô SZ não configurada" };

  const admin = criarClienteAdmin();
  const alvo = dia ?? hojeSantarem();
  try {
    const sz = new SessaoSz(cred);
    await sz.login();

    // frase de fechamento configurável (integracoes_config.szchat.frase_fechamento)
    const { data: cfgRow } = await admin
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "szchat")
      .maybeSingle();
    const marcadorFechamento =
      ((cfgRow?.config as Record<string, unknown>)?.frase_fechamento as string) || "venda concluída";

    // janela de 5 dias: o filtro do SZ pega a conversa pela DATA DE INÍCIO,
    // então a conversa que segue ativa dias depois sumia da leitura diária
    // (cliente respondia e o CRM nunca ficava sabendo)
    const inicioJanela = new Date(Date.parse(`${alvo}T00:00:00Z`) - 4 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    // metade do orçamento para listar, o resto para processar
    const conversas = await listarConversasComerciais(sz, inicioJanela, alvo, 60, orcamentoMs / 2);
    const { data: equipes } = await admin
      .from("sz_equipes_habilitadas")
      .select("nome, pop_id, ativo");
    const popPorEquipe = new Map(
      (equipes ?? []).filter((e) => e.ativo).map((e) => [e.nome, e.pop_id as string | null])
    );
    const { data: vends } = await admin.from("vendedores").select("id, nome, pop_id").eq("ativo", true);
    const { data: mapaAtendentes } = await admin
      .from("sz_atendentes_map")
      .select("sz_atendente_nome, vendedor_id");
    const { data: planosData } = await admin
      .from("planos")
      .select("id, nome, velocidade")
      .eq("ativo", true)
      .gt("valor_referencia", 0);
    const planos = (planosData ?? []) as PlanoRef[];
    const semAcento = (t: string) =>
      t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const acharVendedora = (agente: string | null, popId: string | null) => {
      if (!agente) return null;
      // 1º: mapa explícito atendente→vendedora do Administração (D1)
      const doMapa = (mapaAtendentes ?? []).find(
        (m) => m.sz_atendente_nome && semAcento(m.sz_atendente_nome) === semAcento(agente)
      );
      if (doMapa?.vendedor_id) return doMapa.vendedor_id as string;
      // 2º: heurística pelo primeiro nome, ignorando acentos ("Dâmely"≈"Damely")
      const primeiro = semAcento(agente).split(/\s+/)[0];
      if (!primeiro) return null;
      const cands = (vends ?? []).filter((v) => semAcento(v.nome).includes(primeiro));
      return (cands.find((v) => v.pop_id === popId) ?? cands[0])?.id ?? null;
    };

    const amanha09 = new Date(Date.parse(`${alvo}T00:00:00-03:00`) + 33 * 3600_000).toISOString();

    // dedup: abertos E fechados nos últimos 15 dias, carregados UMA vez — sem
    // isso o robô recriava o ticket depois que a venda fechava (duplicata que
    // depois travava a liberação da comissão). Match por telefone e, para
    // conversa sem telefone, pelo protocolo do SZ.
    const corteDedup = new Date(Date.now() - 15 * 86_400_000).toISOString();
    const { data: candidatos } = await admin
      .from("tickets")
      .select("id, telefone, vendedor_id, etapa, fechado_em, sz_conversa_id, resumo_em")
      .or(`etapa.neq.fechado,fechado_em.gte.${corteDedup}`)
      .limit(3000);
    const porTelefone = new Map<string, (typeof candidatos & object)[number]>();
    const porProtocolo = new Map<string, (typeof candidatos & object)[number]>();
    for (const t of candidatos ?? []) {
      const dt = soDigitos(t.telefone);
      if (dt && !porTelefone.has(dt)) porTelefone.set(dt, t);
      if (t.sz_conversa_id && !porProtocolo.has(String(t.sz_conversa_id)))
        porProtocolo.set(String(t.sz_conversa_id), t);
    }

    let criados = 0;
    let atualizados = 0;
    let completo = !conversas.truncada;
    for (const c of conversas) {
      if (Date.now() > limite) {
        completo = false;
        break;
      }
      const tel = soDigitos(c.telefone);
      const popId = popPorEquipe.get(c.equipe) ?? null;
      const vendedorId = acharVendedora(c.agente, popId);

      const achado =
        (tel ? porTelefone.get(tel) : undefined) ??
        (c.protocolo ? porProtocolo.get(String(c.protocolo)) : undefined) ??
        null;
      // ticket já fechado (venda concluída): não recria nem reabre — e nem
      // gasta chamada baixando o diálogo
      if (achado && achado.etapa === "fechado") continue;
      // ticket aberto com resumo fresco: nada novo a fazer nesta rodada —
      // evita baixar o diálogo de toda a janela a cada 9 minutos
      if (
        achado &&
        typeof achado.resumo_em === "string" &&
        Date.now() - Date.parse(achado.resumo_em) < 25 * 60_000
      )
        continue;
      const existente: string | null = achado?.id ?? null;

      await carregarDialogo(sz, c, { inicio: inicioJanela, fim: alvo });
      if (c.dialogo.length === 0) continue;
      const r = resumirPorRegras(c, planos, { marcadorFechamento });

      // quem atende no SZ é a responsável pelo cliente: preenche quando vazio
      if (achado && !achado.vendedor_id && vendedorId) {
        await admin
          .from("tickets")
          .update({ vendedor_id: vendedorId, pop_id: popId })
          .eq("id", achado.id)
          .is("vendedor_id", null);
      }
      // ticket nascido na TRANSFERÊNCIA (webhook do fluxo) vem sem telefone —
      // a variável do SZ não resolve ali; completa quando a conversa aparece
      if (achado && !achado.telefone && tel) {
        await admin.from("tickets").update({ telefone: tel }).eq("id", achado.id).is("telefone", null);
      }

      const base = {
        resumo_tratativa: r.resumo,
        proxima_abordagem: r.proxima,
        resumo_em: new Date().toISOString(),
        sz_conversa_id: c.protocolo,
        atualizado_em: new Date().toISOString(),
      };
      // venda fechada no chat → sai da fila de follow-up.
      // Com plano detectado, fecha como Vendida; sem plano, vai para
      // "Criação do contrato" aguardando a reconciliação com o SGP.
      // contrato citado na frase de fechamento → reconcilia com o SGP
      let reconc: Record<string, unknown> = {};
      let planoFinal = r.planoId;
      if (r.vendaFechada && r.contratoSgpId) {
        const { data: ct } = await admin
          .from("contratos")
          .select("id, plano_id, valor_mensalidade")
          .eq("sgp_contrato_id", r.contratoSgpId)
          .maybeSingle();
        if (ct) {
          reconc = { contrato_id: ct.id, reconciliado_em: new Date().toISOString(), valor_estimado: ct.valor_mensalidade };
          planoFinal = (ct.plano_id as string | null) ?? planoFinal;
        }
      }
      const desfechoVenda = r.vendaFechada
        ? planoFinal && tel
          ? {
              etapa: "fechado" as const,
              desfecho: "convertido" as const,
              fechado_por: "vendedora" as const,
              fechado_em: new Date().toISOString(),
              plano_id: planoFinal,
              origem_cadastro: "outro" as const,
              urgencia: null,
              followup_em: null,
              ...reconc,
            }
          : { etapa: "aguardando" as const, urgencia: null, followup_em: null, ...reconc }
        : { etapa: "em_atendimento" as const, urgencia: r.urgencia, followup_em: amanha09 };

      const campos: Record<string, unknown> = { ...base, ...desfechoVenda };
      // com a janela de 5 dias o robô revisita a conversa por vários ciclos:
      // não regride ticket que a vendedora já avançou no funil (proposta,
      // criação do contrato…) de volta para "em atendimento"
      if (
        existente &&
        !r.vendaFechada &&
        achado &&
        achado.etapa !== "novo" &&
        achado.etapa !== "em_atendimento"
      ) {
        delete campos.etapa;
        delete campos.urgencia;
        delete campos.followup_em;
      }

      if (existente) {
        await admin.from("tickets").update(campos).eq("id", existente);
        atualizados++;
      } else {
        const { data: novo } = await admin
          .from("tickets")
          .insert({
            origem_criacao: "sz_auto",
            cliente_nome: c.nome,
            telefone: tel,
            vendedor_id: vendedorId,
            pop_id: popId,
            primeira_tratativa_em: new Date().toISOString(),
            ...campos,
          })
          .select("id")
          .single();
        if (novo) {
          criados++;
          const registro = {
            id: novo.id as string, telefone: tel, vendedor_id: vendedorId,
            etapa: "em_atendimento", fechado_em: null, sz_conversa_id: c.protocolo,
          } as NonNullable<typeof candidatos>[number];
          if (tel && !porTelefone.has(tel)) porTelefone.set(tel, registro);
          if (c.protocolo && !porProtocolo.has(String(c.protocolo))) porProtocolo.set(String(c.protocolo), registro);
        }
      }
    }

    return { ok: true, lidas: conversas.length, criados, atualizados, completo, janela: alvo };
  } catch (e) {
    return { ok: false, lidas: 0, criados: 0, atualizados: 0, erro: e instanceof Error ? e.message : String(e), janela: alvo };
  }
}

export { EQUIPES_CRM };
