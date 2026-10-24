import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarConfig, gravarEstado, lerEstado } from "./config-servidor";

/**
 * Rotina automática da Performance Comercial (24/10/2026) — cron próprio
 * (/api/performance/rotina, a cada 10 min), FORA do ciclo do /api/sync: o
 * sync já não tem folga (o robô comercial perde a vez por orçamento) e não
 * pode pagar por este módulo.
 *
 * Cada etapa grava o resultado em sync_runs (entidade performance_*) com
 * status final — nunca "executando": o /api/sync trata qualquer linha
 * "executando" como ciclo em andamento e pularia a vez dele.
 */
const minutosDesde = async (entidade: string): Promise<number> => {
  const { data } = await criarClienteAdmin()
    .from("sync_runs")
    .select("finalizado_em")
    .eq("entidade", entidade)
    .neq("status", "erro")
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.finalizado_em ? (Date.now() - Date.parse(data.finalizado_em as string)) / 60_000 : Infinity;
};

async function registrar(entidade: string, inicio: number, r: { ok: boolean; registros?: number; erro?: string | null; parcial?: boolean }) {
  const { error } = await criarClienteAdmin()
    .from("sync_runs")
    .insert({
      entidade,
      iniciado_em: new Date(inicio).toISOString(),
      finalizado_em: new Date().toISOString(),
      registros: r.registros ?? 0,
      status: !r.ok ? "erro" : r.parcial ? "parcial" : "sucesso",
      erro: r.erro ? r.erro.slice(0, 500) : null,
    });
  if (error) console.error(`log ${entidade}:`, error.message);
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function rodarRotinaPerformance(
  orcamentoMs = 100_000,
  /** só para teste local: o cron usa a configuração (coleta ligada, notificação conforme o gestor) */
  opts: { coleta?: boolean; notificar?: boolean } = {}
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const restante = () => orcamentoMs - (Date.now() - t0);
  const cfg = await carregarConfig();
  if (!cfg.modulo_ativo) return { pulou: "módulo desativado" };

  // trava simples contra execuções sobrepostas (5 min de validade)
  const trava = await lerEstado<{ desde?: string }>("performance_rotina_trava");
  if (trava.desde && Date.now() - Date.parse(trava.desde) < 5 * 60_000) return { pulou: "outra execução em andamento" };
  await gravarEstado("performance_rotina_trava", { desde: new Date().toISOString() });

  const agoraStm = new Date(Date.now() - 3 * 3_600_000);
  const hora = agoraStm.getUTCHours();
  const diurno = hora >= 7 && hora < 20;
  const resumo: Record<string, unknown> = {};
  try {
    // 1) coleta do chat (lê o SZ com a conta robô): 20 em 20 min no expediente, 60 fora
    if (cfg.coleta.habilitada && opts.coleta !== false && restante() > 60_000 && (await minutosDesde("performance_coleta")) >= (diurno ? 19 : 59)) {
      const ini = Date.now();
      try {
        const { rodarColetaIncremental } = await import("./coleta/job");
        const r = await rodarColetaIncremental(Math.min(45_000, restante() - 50_000));
        resumo.coleta = r.map((x) => ({ dia: x.dia, novas: x.novas, atualizadas: x.atualizadas, puladas: x.puladas, erros: x.erros }));
        await registrar("performance_coleta", ini, {
          ok: !r.some((x) => x.falhouListagem),
          registros: r.reduce((s, x) => s + x.novas + x.atualizadas, 0),
          parcial: r.some((x) => x.proximaPagina !== null || x.erros > 0),
          erro: r.find((x) => x.ultimoErro)?.ultimoErro ?? null,
        });
      } catch (e) {
        resumo.coleta = { erro: msg(e) };
        await registrar("performance_coleta", ini, { ok: false, erro: msg(e) });
      }
    }

    // 2) conversas gravadas numa regra de cálculo antiga → regra atual (sem SZ)
    if (restante() > 45_000) {
      const ini = Date.now();
      try {
        const { recalcularConversas } = await import("./coleta/recalcular");
        const r = await recalcularConversas({ prazoMs: Math.min(15_000, restante() - 35_000) });
        if (r.feitas) {
          resumo.recalculo = r.feitas;
          await registrar("performance_recalculo", ini, { ok: true, registros: r.feitas, parcial: r.restantes });
        }
      } catch (e) {
        await registrar("performance_recalculo", ini, { ok: false, erro: msg(e) });
      }
    }

    // 3) follow-ups: importa do CRM/Meu Dia e avalia prazos (só banco)
    if (restante() > 30_000) {
      const ini = Date.now();
      try {
        const { rodarFollowups } = await import("./followups/job");
        const r = await rodarFollowups({ desdeDias: Math.max(3, cfg.coleta.dias_retroativos) });
        resumo.followups = r;
        await registrar("performance_followups", ini, { ok: true, registros: r.importados + r.atualizados });
      } catch (e) {
        await registrar("performance_followups", ini, { ok: false, erro: msg(e) });
      }
    }

    // 4) alertas: a cada ~15 min; notifica só críticos novos (com teto diário)
    if (restante() > 30_000 && (await minutosDesde("performance_alertas")) >= 14) {
      const ini = Date.now();
      try {
        const { rodarAlertas } = await import("./alertas/job");
        const r = await rodarAlertas({ notificar: opts.notificar ?? cfg.alertas.notificar_criticos });
        resumo.alertas = r;
        await registrar("performance_alertas", ini, { ok: true, registros: r.criados + r.atualizados + r.resolvidos });
      } catch (e) {
        await registrar("performance_alertas", ini, { ok: false, erro: msg(e) });
      }
    }

    // 5) IA: só com a análise automática ligada; lote pequeno por rodada
    if (cfg.ia.habilitada && restante() > 30_000) {
      const ini = Date.now();
      try {
        const { enfileirarAnalises, processarFila } = await import("./ia/pipeline");
        const f = await enfileirarAnalises({ dias: 2 });
        const r = await processarFila({ limite: 8, prazoMs: Math.min(40_000, restante() - 15_000) });
        resumo.ia = { ...f, ...r };
        await registrar("performance_ia", ini, { ok: r.erros === 0 || r.processadas > 0, registros: r.processadas, parcial: r.erros > 0, erro: r.parado ?? null });
      } catch (e) {
        await registrar("performance_ia", ini, { ok: false, erro: msg(e) });
      }
    }

    // 6) uma vez por dia, depois da 1h: fotografias de ontem e limpeza dos textos vencidos
    if (hora >= 1 && restante() > 30_000) {
      const hoje = agoraStm.toISOString().slice(0, 10);
      const { data: ja } = await criarClienteAdmin()
        .from("sync_runs")
        .select("id")
        .eq("entidade", "performance_diaria")
        .eq("status", "sucesso")
        .gte("finalizado_em", `${hoje}T00:00:00-03:00`)
        .limit(1);
      if (!ja?.length) {
        const ini = Date.now();
        try {
          const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
          const { gravarSnapshots } = await import("./snapshots");
          const { purgarTextosExpirados } = await import("./ia/pipeline");
          const s = await gravarSnapshots(ontem);
          const p = await purgarTextosExpirados();
          resumo.diaria = { fotografias: s.linhas, textosApagados: p.apagados, analisesEnxutas: p.analisesEnxutas };
          await registrar("performance_diaria", ini, { ok: true, registros: s.linhas });
        } catch (e) {
          await registrar("performance_diaria", ini, { ok: false, erro: msg(e) });
        }
      }
    }
  } finally {
    await gravarEstado("performance_rotina_trava", {});
  }
  return resumo;
}
