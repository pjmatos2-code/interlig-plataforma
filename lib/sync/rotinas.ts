import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { mesAtras } from "@/lib/datas";
import {
  cancelamentosNaVez,
  fidelidadeNaVez,
  janelaOcorrencias,
  meuDiaNaVez,
  noExpediente,
  ocorrenciasNaVez,
  relogioSantarem,
  retencaoNaVez,
  roboComercialNaVez,
} from "@/lib/sync/agenda";

/**
 * Rotinas que saíram do fim do /api/sync (24/10/2026) — cron e relógio
 * próprios em /api/sync/rotinas, a cada 5 min. No fim do sync elas quase
 * nunca tinham vez: só o SGP (varredura da URA + cadastros novos +
 * assinaturas + OS) gasta ~150 s dos 172 s do ciclo. Resultado medido em
 * sync_runs: robô comercial "sem orçamento" em ~97% dos ciclos, retenção 1–3
 * vezes por dia e cancelamentos/ocorrências do SGP sem rodar nenhuma vez
 * desde 10/10.
 *
 * Cada etapa grava em sync_runs só o resultado final, com o início real —
 * nunca "executando": o /api/sync trata essa linha como ciclo em andamento e
 * pularia a vez dele.
 */

type Admin = ReturnType<typeof criarClienteAdmin>;

async function registrar(
  admin: Admin,
  entidade: string,
  inicio: number,
  r: { ok: boolean; registros?: number; erro?: string | null }
) {
  const { error } = await admin.from("sync_runs").insert({
    entidade,
    iniciado_em: new Date(inicio).toISOString(),
    finalizado_em: new Date().toISOString(),
    registros: r.registros ?? 0,
    status: r.ok ? "sucesso" : "erro",
    erro: r.erro ?? null,
  });
  if (error) console.error(`log ${entidade}:`, error.message);
}

export async function rodarRotinas(orcamentoMs = 172_000) {
  const inicioCiclo = Date.now();
  const restante = () => orcamentoMs - (Date.now() - inicioCiclo);
  // segundos por etapa, no log da Vercel — o que roda aqui não pode voltar a
  // sumir sem ninguém ver
  const tempos: Record<string, number> = {};
  const medir = (etapa: string, desde: number) => {
    tempos[etapa] = Math.round((Date.now() - desde) / 100) / 10;
  };
  const admin = criarClienteAdmin();
  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "szchat")
    .maybeSingle();
  const cfgSz = (cfgRow?.config ?? {}) as Record<string, unknown>;

  // robô comercial PRIMEIRO: os nós de webhook do fluxo não disparam no
  // caminho da LigIA, então é ele que fecha o ciclo das conversas encerradas
  // ao longo do dia (07h–20h, no máximo a cada 9 min). O custo por rodada
  // fica baixo porque ele pula o diálogo de quem já tem ticket com resumo fresco
  if (roboComercialNaVez(Date.now(), cfgSz.robo_diurno_em as string | undefined)) {
    // marca ANTES de rodar para não empilhar execuções concorrentes
    // (merge atômico — nunca apaga outras chaves; ver migração 0086)
    await admin.rpc("mesclar_config", {
      p_sistema: "szchat",
      p_patch: { robo_diurno_em: new Date().toISOString() },
    });
    const ini = Date.now();
    const { rodarRoboSz } = await import("@/lib/sz/robo");
    // sem backfill de janelas antigas: o filtro do SZ seleciona pela data de
    // ENCERRAMENTO, então conversa aberta não aparece em listagem nenhuma — o
    // atendimento vira ticket na TRANSFERÊNCIA (webhook do fluxo) e o robô
    // fecha o ciclo quando a conversa encerra
    const r = await rodarRoboSz(undefined, Math.min(90_000, restante() - 15_000)).catch((e) => ({
      ok: false as const, criados: 0, erro: String(e),
    }));
    await registrar(admin, "robo_comercial", ini, {
      ok: r.ok,
      registros: r.criados,
      erro: r.ok ? null : String(r.erro ?? "falhou"),
    });
    medir("robo_comercial", ini);
  }

  // instalação concluída → confere a ativação no SGP na hora (card da TV)
  if (restante() > 50_000) {
    const ini = Date.now();
    const { conferirAtivacoesDaEsteira } = await import("@/lib/sgp/atualizar");
    await conferirAtivacoesDaEsteira(8).catch((e) => console.error("ativações da esteira:", e));
    medir("ativacoes", ini);
  }

  // retenção com cadência própria (economia 18/09): ~9 min no expediente,
  // ~28 min fora — a paginação rotativa cobre a janela do mês
  retencao: {
    if (restante() < 30_000) break retencao; // sem tempo: fica para o próximo ciclo
    if (!retencaoNaVez(Date.now(), cfgSz.retencao_robo_em as string | undefined)) break retencao;
    await admin.rpc("mesclar_config", {
      p_sistema: "szchat",
      p_patch: { retencao_robo_em: new Date().toISOString() },
    });
    const ini = Date.now();
    const { rodarRoboRetencao } = await import("@/lib/retencao/robo");
    const r = await rodarRoboRetencao(undefined, Math.min(45_000, restante() - 10_000)).catch((e) => ({
      ok: false as const, lidas: 0, criados: 0, reincidentes: 0, erro: String(e),
    }));
    await registrar(admin, "robo_retencao", ini, {
      ok: r.ok,
      registros: r.criados,
      erro: r.ok ? (r.completo === false ? "parcial: orçamento esgotado" : null) : r.erro,
    });
    if (!r.ok) console.error("robô retenção falhou:", r.erro);
    medir("robo_retencao", ini);
  }

  // Meu Dia (14/10/2026): pós-venda dos ativados ontem e pendentes 90+ —
  // uma vez por dia, a partir das 00h05 de Santarém
  meuDia: {
    if (restante() < 30_000) break meuDia;
    const hojeStm = relogioSantarem(Date.now()).dia;
    const { data: ja } = await admin
      .from("sync_runs")
      .select("finalizado_em")
      .eq("entidade", "meu_dia")
      .eq("status", "sucesso")
      .gte("finalizado_em", `${hojeStm}T00:00:00-03:00`)
      .limit(1);
    if (!meuDiaNaVez(Date.now(), Boolean(ja?.length))) break meuDia;
    const ini = Date.now();
    const { rodarJobMeuDia } = await import("@/lib/meu-dia/job");
    const r = await rodarJobMeuDia({ hoje: hojeStm }).catch((e) => ({ erro: String(e) }));
    await registrar(admin, "meu_dia", ini, {
      ok: !("erro" in r),
      registros: "posvenda" in r ? r.posvenda : 0,
      erro: "erro" in r ? r.erro : null,
    });
    medir("meu_dia", ini);
  }

  // cancelamentos oficiais (10/10/2026): relatório "Cancelados" do SGP do mês
  // anterior até hoje — corrige data e motivo que a URA não informa. Leve
  // (~2s por página de 100), 1x a cada 6h para o dia de hoje não ficar errado
  cancelamentos: {
    if (restante() < 45_000) break cancelamentos;
    const { data: ultima } = await admin
      .from("sync_runs")
      .select("finalizado_em")
      .eq("entidade", "cancelamentos")
      .eq("status", "sucesso")
      .order("finalizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cancelamentosNaVez(Date.now(), ultima?.finalizado_em as string | undefined)) break cancelamentos;
    const ini = Date.now();
    const hojeC = relogioSantarem(ini).dia;
    const { atualizarCancelamentos } = await import("@/lib/sgp/cancelados");
    const c = await atualizarCancelamentos(mesAtras(hojeC, 1), hojeC);
    await registrar(admin, "cancelamentos", ini, {
      ok: c.ok,
      registros: c.corrigidos,
      erro: c.ok ? null : c.erro ?? "falhou",
    });
    medir("cancelamentos", ini);
  }

  // ocorrências de atendimento (10/10/2026): suporte, cobrança, pedidos de
  // cancelamento — base do risco de cancelamento. Pela data de cadastro (pega
  // também o status/encerramento das recentes), a cada 3h; a janela recua até
  // a última leitura boa quando a etapa ficou dias sem rodar
  ocorrencias: {
    if (restante() < 45_000) break ocorrencias;
    const { data: ultima } = await admin
      .from("sync_runs")
      .select("finalizado_em")
      .eq("entidade", "ocorrencias")
      .eq("status", "sucesso")
      .order("finalizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ultimoSucesso = ultima?.finalizado_em as string | undefined;
    if (!ocorrenciasNaVez(Date.now(), ultimoSucesso)) break ocorrencias;
    const ini = Date.now();
    const { de, ate } = janelaOcorrencias(ini, ultimoSucesso);
    const { atualizarOcorrencias } = await import("@/lib/sgp/ocorrencias");
    const o = await atualizarOcorrencias(de, ate);
    await registrar(admin, "ocorrencias", ini, {
      ok: o.ok,
      registros: o.lidas,
      erro: o.ok ? null : o.erro ?? "falhou",
    });
    medir("ocorrencias", ini);
  }

  // fidelidade da base (01/10/2026): relatório pesado no SGP (~70s para as
  // três unidades) — roda fora do expediente, 1x/dia, continuando de onde parou
  fidelidade: {
    if (noExpediente(Date.now()) || restante() < 60_000) break fidelidade;
    const { data: maisAntiga } = await admin
      .from("fidelidade_resumo")
      .select("atualizado_em")
      .order("atualizado_em", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!fidelidadeNaVez(Date.now(), maisAntiga?.atualizado_em as string | undefined)) break fidelidade;
    const ini = Date.now();
    const { atualizarResumoFidelidade } = await import("@/lib/sgp/fidelidade");
    const f = await atualizarResumoFidelidade(restante() - 10_000);
    await registrar(admin, "fidelidade", ini, {
      ok: f.ok,
      registros: f.lidas,
      erro: f.ok ? null : f.erro ?? "falhou",
    });
    medir("fidelidade", ini);
  }

  medir("total", inicioCiclo);
  console.log("rotinas: tempos (s)", JSON.stringify(tempos));
  return { tempos };
}
