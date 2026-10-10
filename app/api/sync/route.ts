import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { executarSync } from "@/lib/sync/worker";
import { executarRotinasCrm } from "@/lib/crm/rotinas";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // orçamentos internos somam < 150s; teto menor corta o pior caso

/**
 * Worker de sync (PRD 7.1). Responde IMEDIATAMENTE e continua o trabalho em
 * segundo plano (waitUntil) — assim o disparo do cron externo (que desconecta
 * em 30s) nunca mata o ciclo. `?aguardar=1` espera o resultado (uso manual).
 */
/**
 * Robô do SZ em quase tempo real: os nós de webhook do fluxo não disparam no
 * caminho da LigIA, então o robô roda junto do sync, no máximo a cada 30 min,
 * das 07h às 20h de Santarém — os tickets das conversas do dia nascem ao longo
 * do dia, não só na leitura das 19:30.
 */
async function roboSzSeDevido(orcamentoMs = 90_000) {
  const admin = criarClienteAdmin();
  const agoraStm = new Date(Date.now() - 3 * 3600_000);
  const hora = agoraStm.getUTCHours();

  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "szchat")
    .maybeSingle();
  const cfg = (cfgRow?.config ?? {}) as Record<string, unknown>;
  if (hora < 7 || hora >= 20) return;
  const ultima = typeof cfg.robo_diurno_em === "string" ? Date.parse(cfg.robo_diurno_em) : 0;
  // 9 min: dispara praticamente a cada dois ciclos do sync — o ticket da
  // conversa nova nasce em minutos; o custo por rodada fica baixo porque o
  // robô pula o diálogo de quem já tem ticket com resumo fresco
  if (Date.now() - ultima < 9 * 60_000) return;

  // marca ANTES de rodar para não empilhar execuções concorrentes
  // (merge atômico — nunca apaga outras chaves; ver migração 0086)
  await admin.rpc("mesclar_config", {
    p_sistema: "szchat",
    p_patch: { robo_diurno_em: new Date().toISOString() },
  });
  const { rodarRoboSz } = await import("@/lib/sz/robo");
  // sem backfill de janelas antigas: o filtro do SZ seleciona pela data de
  // ENCERRAMENTO, então conversa aberta não aparece em listagem nenhuma — o
  // atendimento vira ticket na TRANSFERÊNCIA (webhook do fluxo) e o robô
  // fecha o ciclo quando a conversa encerra
  const r = await rodarRoboSz(undefined, Math.min(90_000, orcamentoMs)).catch((e) => ({
    ok: false as const, criados: 0, erro: String(e),
  }));
  // visível em Administração (30/09): sem isso a falha só existia no console
  await admin.from("sync_runs").insert({
    entidade: "robo_comercial",
    finalizado_em: new Date().toISOString(),
    registros: (r as { criados?: number }).criados ?? 0,
    status: (r as { ok?: boolean }).ok ? "sucesso" : "erro",
    erro: (r as { ok?: boolean; erro?: string }).ok ? null : String((r as { erro?: string }).erro ?? "falhou"),
  }).then(({ error }) => { if (error) console.error("log robô comercial:", error.message); });
}

async function cicloCompleto() {
  // relógio do ciclo (30/09/2026): a função tem 180s; medindo o restante,
  // nenhum módulo do fim fica sem vez — o robô comercial passava DIAS sem
  // rodar porque a soma dos anteriores estourava o teto antes dele
  const inicioCiclo = Date.now();
  const restante = () => 172_000 - (Date.now() - inicioCiclo);
  const resultado = await executarSync();
  const rotinas = await executarRotinasCrm();
  // ticket nasce quando a agente ASSUME a conversa (01/10/2026): lê o painel
  // de Monitoramento do SZ (conversas em atendimento) — independe do fluxo
  {
    const { sincronizarAtendimentosAbertos } = await import("@/lib/sz/monitor");
    const m = await sincronizarAtendimentosAbertos().catch((e) => ({
      ok: false, abertas: 0, criados: 0, vinculados: 0, erro: String(e),
    }));
    await criarClienteAdmin().from("sync_runs").insert({
      entidade: "sz_atendimentos",
      finalizado_em: new Date().toISOString(),
      registros: m.criados,
      status: m.ok ? "sucesso" : "erro",
      erro: m.ok ? null : (m as { erro?: string }).erro ?? "falhou",
    }).then(({ error }) => { if (error) console.error("log sz_atendimentos:", error.message); });
  }
  // enriquecimento DURANTE a conversa (leve: até 8 tickets/ciclo): telefone,
  // vendedora e resumo frescos sem esperar o encerramento nem o horário do
  // robô — negociação longa não pode depender da memória da vendedora
  {
    const { enriquecerTicketsAbertos } = await import("@/lib/sz/enriquecer");
    const e = await enriquecerTicketsAbertos(25_000).catch((err) => ({
      ok: false, verificados: 0, atualizados: 0, erro: String(err),
    }));
    console.log("enriquecimento SZ:", JSON.stringify(e));
  }
  // instalação concluída → confere a ativação no SGP na hora (card da TV)
  if (restante() > 50_000) {
    const { conferirAtivacoesDaEsteira } = await import("@/lib/sgp/atualizar");
    await conferirAtivacoesDaEsteira(8).catch((e) => console.error("ativações da esteira:", e));
  }

  // robô comercial ANTES da retenção (30/09): no fim do ciclo ele nunca
  // alcançava o orçamento; o gate de 9 min segue valendo
  if (restante() > 40_000) {
    await roboSzSeDevido(restante() - 15_000).catch((e) =>
      console.error("robô SZ diurno falhou:", e)
    );
  } else {
    // sem orçamento também é informação — aparece na Administração
    const admin = criarClienteAdmin();
    await admin.from("sync_runs").insert({
      entidade: "robo_comercial",
      finalizado_em: new Date().toISOString(),
      registros: 0,
      status: "erro",
      erro: `sem orçamento no ciclo (restavam ${Math.round(restante() / 1000)}s)`,
    }).then(({ error }) => { if (error) console.error("log robô comercial:", error.message); });
  }
  // retenção com cadência própria (economia 18/09): ~9 min no expediente,
  // ~28 min fora — a paginação rotativa cobre a janela do mês
  retencao: {
    if (restante() < 30_000) break retencao; // sem tempo: fica para o próximo ciclo
    const admin = criarClienteAdmin();
    const { data: cfgRet } = await admin
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "szchat")
      .maybeSingle();
    const cfgR = (cfgRet?.config ?? {}) as Record<string, unknown>;
    const horaR = new Date(Date.now() - 3 * 3600_000).getUTCHours();
    const intervaloRet = horaR >= 7 && horaR < 20 ? 9 * 60_000 : 28 * 60_000;
    const ultimaRet = typeof cfgR.retencao_robo_em === "string" ? Date.parse(cfgR.retencao_robo_em) : 0;
    if (Date.now() - ultimaRet < intervaloRet) break retencao;
    await admin.rpc("mesclar_config", {
      p_sistema: "szchat",
      p_patch: { retencao_robo_em: new Date().toISOString() },
    });
    const { rodarRoboRetencao } = await import("@/lib/retencao/robo");
    const r = await rodarRoboRetencao(undefined, Math.min(45_000, restante() - 10_000)).catch((e) => ({
      ok: false as const, lidas: 0, criados: 0, reincidentes: 0, erro: String(e),
    }));
    // registra em sync_runs — sem isso a falha só aparecia no console da Vercel
    await admin.from("sync_runs").insert({
      entidade: "robo_retencao",
      finalizado_em: new Date().toISOString(),
      registros: r.criados,
      status: r.ok ? "sucesso" : "erro",
      erro: r.ok ? (r.completo === false ? "parcial: orçamento esgotado" : null) : r.erro,
    }).then(({ error }) => { if (error) console.error("log robô retenção:", error.message); });
    if (!r.ok) console.error("robô retenção falhou:", r.erro);
  }
  // cancelamentos oficiais (10/10/2026): relatório "Cancelados" do SGP do mês
  // anterior até hoje — corrige data e motivo que a URA não informa. Leve
  // (~2s por página de 100), 1x a cada 6h para o dia de hoje não ficar errado
  cancelamentos: {
    if (restante() < 45_000) break cancelamentos;
    const admin = criarClienteAdmin();
    const { data: ultima } = await admin
      .from("sync_runs")
      .select("finalizado_em")
      .eq("entidade", "cancelamentos")
      .eq("status", "sucesso")
      .order("finalizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima && Date.now() - Date.parse(ultima.finalizado_em as string) < 6 * 3600_000) break cancelamentos;
    const hojeC = new Date(Date.now() - 3 * 3600_000);
    const deC = new Date(Date.UTC(hojeC.getUTCFullYear(), hojeC.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    const { atualizarCancelamentos } = await import("@/lib/sgp/cancelados");
    const c = await atualizarCancelamentos(deC, hojeC.toISOString().slice(0, 10));
    await admin.from("sync_runs").insert({
      entidade: "cancelamentos",
      finalizado_em: new Date().toISOString(),
      registros: c.corrigidos,
      status: c.ok ? "sucesso" : "erro",
      erro: c.ok ? null : c.erro ?? "falhou",
    }).then(({ error }) => { if (error) console.error("log cancelamentos:", error.message); });
  }
  // ocorrências de atendimento (10/10/2026): suporte, cobrança, pedidos de
  // cancelamento — base do risco de cancelamento. Últimos 3 dias pela data de
  // cadastro (pega também o status/encerramento das recentes), a cada 3h
  ocorrencias: {
    if (restante() < 45_000) break ocorrencias;
    const admin = criarClienteAdmin();
    const { data: ultima } = await admin
      .from("sync_runs")
      .select("finalizado_em")
      .eq("entidade", "ocorrencias")
      .eq("status", "sucesso")
      .order("finalizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima && Date.now() - Date.parse(ultima.finalizado_em as string) < 3 * 3600_000) break ocorrencias;
    const hojeO = new Date(Date.now() - 3 * 3600_000);
    const { atualizarOcorrencias } = await import("@/lib/sgp/ocorrencias");
    const o = await atualizarOcorrencias(
      new Date(hojeO.getTime() - 3 * 86_400_000).toISOString().slice(0, 10),
      hojeO.toISOString().slice(0, 10)
    );
    await admin.from("sync_runs").insert({
      entidade: "ocorrencias",
      finalizado_em: new Date().toISOString(),
      registros: o.lidas,
      status: o.ok ? "sucesso" : "erro",
      erro: o.ok ? null : o.erro ?? "falhou",
    }).then(({ error }) => { if (error) console.error("log ocorrências:", error.message); });
  }
  // fidelidade da base (01/10/2026): relatório pesado no SGP (~70s para as
  // três unidades) — roda fora do expediente, 1x/dia, continuando de onde parou
  fidelidade: {
    const horaF = new Date(Date.now() - 3 * 3600_000).getUTCHours();
    if ((horaF >= 7 && horaF < 20) || restante() < 60_000) break fidelidade;
    const admin = criarClienteAdmin();
    const { data: maisAntiga } = await admin
      .from("fidelidade_resumo")
      .select("atualizado_em")
      .order("atualizado_em", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (maisAntiga && Date.now() - Date.parse(maisAntiga.atualizado_em as string) < 20 * 3600_000) break fidelidade;
    const { atualizarResumoFidelidade } = await import("@/lib/sgp/fidelidade");
    const f = await atualizarResumoFidelidade(restante() - 10_000);
    await admin.from("sync_runs").insert({
      entidade: "fidelidade",
      finalizado_em: new Date().toISOString(),
      registros: f.lidas,
      status: f.ok ? "sucesso" : "erro",
      erro: f.ok ? null : f.erro ?? "falhou",
    }).then(({ error }) => { if (error) console.error("log fidelidade:", error.message); });
  }
  return { ...resultado, rotinas };
}

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
    }
  }

  // trava de concorrência: não empilha ciclos (janela de 4 min)
  const admin = criarClienteAdmin();
  const corte = new Date(Date.now() - 4 * 60_000).toISOString();
  const { data: emAndamento } = await admin
    .from("sync_runs")
    .select("id")
    .eq("status", "executando")
    .gte("iniciado_em", corte)
    .limit(1);
  if ((emAndamento ?? []).length > 0) {
    return NextResponse.json({ resultado: "ja_em_andamento" });
  }
  // runs zumbis (função morta no meio) são marcadas como erro
  await admin
    .from("sync_runs")
    .update({ status: "erro", erro: "interrompido", finalizado_em: new Date().toISOString() })
    .eq("status", "executando")
    .lt("iniciado_em", corte);

  const url = new URL(request.url);

  // modo econômico (18/09/2026, pós-upgrade Pro): fora do expediente
  // (07-20h Santarém) o ciclo pleno roda a cada ~15 min, não a cada 5 —
  // venda e atendimento não acontecem de madrugada; o cron externo continua
  // chamando e a rota se autorregula. `aguardar=1` (uso manual) ignora.
  const horaStm = new Date(Date.now() - 3 * 3600_000).getUTCHours();
  if ((horaStm < 7 || horaStm >= 20) && url.searchParams.get("aguardar") !== "1") {
    const { data: ultimoCiclo } = await admin
      .from("sync_runs")
      .select("iniciado_em")
      .eq("entidade", "clientes")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimoCiclo && Date.now() - Date.parse(ultimoCiclo.iniciado_em as string) < 14 * 60_000) {
      return NextResponse.json({ resultado: "economia_noturna" });
    }
  }
  if (url.searchParams.get("aguardar") === "1") {
    const resultado = await cicloCompleto();
    const houveErro = resultado.execucoes.some((e) => e.status === "erro");
    return NextResponse.json(resultado, { status: houveErro ? 500 : 200 });
  }

  waitUntil(
    cicloCompleto().catch((e) => {
      console.error("sync em segundo plano falhou:", e);
    })
  );
  return NextResponse.json({ resultado: "disparado" }, { status: 202 });
}

export const POST = GET;
