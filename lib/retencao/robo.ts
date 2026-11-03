import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { carregarDialogo, telefoneBr, type Conversa } from "@/lib/sz/conversas";
import { casarContratoRetencao } from "./casar";
import { casoDoMesmoCliente, dataDaConversa, documentosDaConversa, type CasoRecente } from "./vinculo";

/**
 * Robô do canal de cancelamento (SZ → casos de retenção).
 *
 * Toda conversa que entra na campanha "Cancelamento Altamira" vira um caso —
 * é isso que torna o denominador da taxa auditável: a agente não escolhe o
 * que registra. Dedup por protocolo e pelo mesmo cliente em 15 dias
 * (contrato, telefone ou nome completo — vinculo.ts): se a agente já abriu o
 * caso à mão, a conversa completa esse caso. Reincidência depois dos 15 dias;
 * contrato casado pelo CPF/CNPJ da conversa, telefone ou nome (casar.ts).
 *
 * O id da campanha fica em integracoes_config.szchat.campanha_retencao —
 * descoberto em 30/08 pelas conversas da Sandryne (65d4f9c6c8d5e2eb380ac588).
 */

const CAMPANHA_RETENCAO_PADRAO = "65d4f9c6c8d5e2eb380ac588";

export type ResultadoRoboRetencao = {
  ok: boolean;
  lidas: number;
  criados: number;
  reincidentes: number;
  /** casos abertos à mão pela agente que ganharam a conversa do SZ */
  completados?: number;
  /** false = orçamento de tempo esgotado antes do fim (o próximo ciclo continua) */
  completo?: boolean;
  erro?: string;
};

async function listarConversasCancelamento(
  sz: SessaoSz,
  campanha: string,
  inicio: string,
  fim: string,
  prazoMs?: number,
  paginaInicial = 1
): Promise<Conversa[] & { truncada?: boolean; proximaPagina?: number | null }> {
  const achadas: Conversa[] & { truncada?: boolean; proximaPagina?: number | null } = [];
  achadas.proximaPagina = null; // null = varredura da janela concluída
  const limite = prazoMs ? Date.now() + prazoMs : null;
  const dateParam = encodeURIComponent(JSON.stringify({ start: inicio, end: fim }));
  for (let p = paginaInicial; p <= paginaInicial + 60; p++) {
    if (limite && Date.now() > limite) {
      achadas.truncada = true;
      achadas.proximaPagina = p; // o próximo ciclo CONTINUA daqui
      break;
    }
    const r = await sz.api(
      `/reports/messages/filter?page=${p}&channel=&contact=&protocol=&agent=&contactName=&attendance=&platform_id=&options_conversations=all&view_conversation=default&data_privacy=hidden&typeStatus=all&copilot_score=&attendance_classification=&closing_reason=&finalCampaign=&finalAgent=&date=${dateParam}`
    );
    if (!r.ok) break;
    const j = (await r.json()) as { data?: Record<string, unknown>[]; has_next?: boolean };
    for (const c of j.data ?? []) {
      if (String(c.campaign_id ?? "") !== campanha) continue;
      achadas.push({
        id: String(c._id),
        equipe: "Cancelamento Altamira",
        nome: String(c.name ?? "Sem nome"),
        telefone:
          telefoneBr(c.platform_id as string) ??
          telefoneBr((c.contact as { number?: string } | undefined)?.number) ??
          ((c.platform_id as string) || null),
        agente: (c.agent as { name?: string } | undefined)?.name ?? null,
        protocolo: (c.protocol as string) || null,
        quando: (c.dateFormatted as string) || null,
        finalizada: Boolean(c.finished_at),
        dialogo: [],
      });
    }
    if (!j.has_next) break;
  }
  return achadas;
}

export async function rodarRoboRetencao(dia?: string, orcamentoMs = 60_000): Promise<ResultadoRoboRetencao> {
  const limite = Date.now() + orcamentoMs;
  const cred = await lerCredenciaisSz();
  if (!cred) return { ok: false, lidas: 0, criados: 0, reincidentes: 0, erro: "credencial SZ não configurada" };

  const admin = criarClienteAdmin();
  const alvo =
    dia ??
    new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santarem" }).format(new Date());

  try {
    const { data: cfgRow } = await admin
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "szchat")
      .maybeSingle();
    const campanha =
      ((cfgRow?.config as Record<string, unknown>)?.campanha_retencao as string) ||
      CAMPANHA_RETENCAO_PADRAO;

    const sz = new SessaoSz(cred);
    await sz.login();
    // janela de 5 dias PRESA AO MÊS CORRENTE: o filtro do SZ seleciona pela
    // data de ENCERRAMENTO da conversa, então "chamados do mês" = conversas
    // encerradas dentro do mês (inclui as iniciadas no fim do mês anterior —
    // conferido com a tela do gestor em 02/09/2026). Cancelamento encerrado em
    // mês anterior fica fora: já foi resolvido no SGP.
    const inicioMes = `${alvo.slice(0, 7)}-01`;
    const inicioCalc = new Date(Date.parse(`${alvo}T00:00:00Z`) - 4 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const inicioJanela = inicioCalc > inicioMes ? inicioCalc : inicioMes;

    // cursor de página rotativo: a listagem vem da mais recente para a mais
    // antiga e a janela do mês tem dezenas de páginas — um ciclo só não cobre
    // tudo, então cada ciclo continua a paginação de onde o anterior parou
    const paginaInicial = Number((cfgRow?.config as Record<string, unknown>)?.retencao_pagina ?? 1) || 1;
    const conversas = await listarConversasCancelamento(
      sz, campanha, inicioJanela, alvo, orcamentoMs / 2, paginaInicial
    );
    await admin.rpc("mesclar_config", {
      p_sistema: "szchat",
      p_patch: { retencao_pagina: conversas.proximaPagina ?? 1 },
    });

    // agente responsável: quem atendeu no SZ, se for do setor retenção
    const { data: agentes } = await admin
      .from("vendedores")
      .select("sgp_login, nome")
      .eq("setor", "retencao")
      .eq("ativo", true);
    const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const loginDe = (nomeSz: string | null) => {
      if (!nomeSz) return (agentes ?? [])[0]?.sgp_login ?? null;
      const primeiro = semAcento(nomeSz).split(/\s+/)[0];
      const a = (agentes ?? []).find((x) => semAcento(x.nome).includes(primeiro));
      return (a?.sgp_login ?? (agentes ?? [])[0]?.sgp_login ?? null) as string | null;
    };

    let criados = 0;
    let reincidentes = 0;
    let completados = 0;
    let completo = !conversas.truncada;

    // casos já registrados, para reconhecer o mesmo cliente: o caso manual da
    // agente não tem protocolo e quase nunca tem telefone (repetidos de
    // 31/10/2026), então valem também o contrato e o nome completo
    const { data: recentes } = await admin
      .from("casos_retencao")
      .select("id, criado_em, telefone, cliente_nome, sgp_contrato_id, protocolo_sz, analisado_em, resumo")
      .order("criado_em", { ascending: false })
      .limit(1000);
    const casos = (recentes ?? []) as (CasoRecente & {
      protocolo_sz: string | null;
      analisado_em: string | null;
      resumo: string | null;
    })[];

    // análise automática da conversa (a IA já era do módulo, mas exigia
    // colar o transcript à mão — o robô tem o diálogo em mãos e analisa:
    // motivo real, trilha e resumo prontos para a agente)
    const analisar = async (casoId: string, c: Conversa, comResumo: boolean) => {
      if (c.dialogo.length === 0 || Date.now() > limite) return;
      try {
        const transcript = c.dialogo
          .map((m) => `${m.quem === "CLIENTE" ? "CLI" : m.quem === "AGENTE" ? "AGE" : m.quem}: ${m.texto}`)
          .join("\n");
        if (transcript.length < 40) return;
        const { analisarConversaRetencao } = await import("@/lib/ia/analista");
        const analise = await analisarConversaRetencao(transcript, {});
        if (!analise) return;
        await admin
          .from("casos_retencao")
          .update({
            analise,
            analisado_em: new Date().toISOString(),
            ...(comResumo ? { resumo: (analise as { resumo?: string }).resumo ?? null } : {}),
          })
          .eq("id", casoId);
      } catch (e) {
        console.error("análise automática de retenção falhou:", e);
      }
    };

    for (const c of conversas) {
      if (Date.now() > limite) {
        completo = false;
        break;
      }
      // dedup por protocolo (índice único)
      if (c.protocolo) {
        const { data: jaExiste } = await admin
          .from("casos_retencao")
          .select("id")
          .eq("protocolo_sz", c.protocolo)
          .maybeSingle();
        if (jaExiste) continue;
      }
      // mesmo cliente nos últimos 15 dias = a MESMA solicitação continuando;
      // se o caso já tem conversa própria, nem abre o diálogo
      const janela = { agoraMs: Date.now(), dias: 15 };
      let repetido = casoDoMesmoCliente({ sgpContratoId: null, telefone: c.telefone, nome: c.nome }, casos, janela);
      if (repetido?.protocolo_sz) continue;

      // transcript: o CPF/CNPJ citado na conversa é o jeito mais seguro de
      // achar o titular (o WhatsApp muitas vezes é de outra pessoa da casa).
      // Diálogo que não carrega não derruba o ciclo: casa por telefone/nome.
      await carregarDialogo(sz, c, { inicio: inicioJanela, fim: alvo }).catch((e) =>
        console.error("diálogo da retenção não carregou:", c.protocolo, e)
      );
      const texto = c.dialogo.map((m) => m.texto).join(" ");
      const vinculo = await casarContratoRetencao(admin, {
        documentos: documentosDaConversa(texto),
        telefone: c.telefone,
        nome: c.nome,
        dataConversa: dataDaConversa(c.protocolo, alvo),
      });
      const cliente = {
        sgpContratoId: vinculo?.sgpContratoId ?? null,
        telefone: c.telefone,
        nome: vinculo?.clienteNome ?? c.nome,
      };
      repetido ??= casoDoMesmoCliente(cliente, casos, janela);
      if (repetido?.protocolo_sz) continue;

      if (repetido) {
        // caso que a agente abriu à mão: a conversa completa esse caso em vez
        // de abrir outro (protocolo, telefone e análise da IA)
        await admin
          .from("casos_retencao")
          .update({ protocolo_sz: c.protocolo, ...(repetido.telefone ? {} : { telefone: c.telefone }) })
          .eq("id", repetido.id);
        repetido.protocolo_sz = c.protocolo;
        repetido.telefone ??= c.telefone;
        if (!repetido.analisado_em) await analisar(repetido.id, c, !repetido.resumo);
        completados++;
        continue;
      }

      // reincidência: o mesmo cliente já teve caso antes dos 15 dias
      const anterior = casoDoMesmoCliente(cliente, casos);

      const { data: novoCaso, error } = await admin
        .from("casos_retencao")
        .insert({
          origem: "sz_auto",
          protocolo_sz: c.protocolo,
          telefone: c.telefone,
          cliente_nome: cliente.nome,
          contrato_id: vinculo?.contratoId ?? null,
          sgp_contrato_id: cliente.sgpContratoId,
          valor_mensal: vinculo?.vtv ?? 0,
          agente_login: loginDe(c.agente),
          etapa: "novo",
          reincidente_de: anterior?.id ?? null,
        })
        .select("id, criado_em")
        .single();
      if (!error && novoCaso) {
        criados++;
        if (anterior) reincidentes++;
        // a próxima conversa do mesmo cliente, neste ciclo, já o encontra
        casos.unshift({
          id: novoCaso.id as string,
          criado_em: novoCaso.criado_em as string,
          telefone: c.telefone,
          cliente_nome: cliente.nome,
          sgp_contrato_id: cliente.sgpContratoId,
          protocolo_sz: c.protocolo,
          analisado_em: null,
          resumo: null,
        });
        await analisar(novoCaso.id as string, c, true);
      }
    }

    return { ok: true, lidas: conversas.length, criados, reincidentes, completados, completo };
  } catch (e) {
    return { ok: false, lidas: 0, criados: 0, reincidentes: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}
