import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { executarSync } from "@/lib/sync/worker";
import { executarRotinasCrm } from "@/lib/crm/rotinas";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
async function roboSzSeDevido() {
  const admin = criarClienteAdmin();
  const agoraStm = new Date(Date.now() - 3 * 3600_000);
  const hora = agoraStm.getUTCHours();
  if (hora < 7 || hora >= 20) return;

  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "szchat")
    .maybeSingle();
  const cfg = (cfgRow?.config ?? {}) as Record<string, unknown>;
  const ultima = typeof cfg.robo_diurno_em === "string" ? Date.parse(cfg.robo_diurno_em) : 0;
  // 9 min: dispara praticamente a cada dois ciclos do sync — o ticket da
  // conversa nova nasce em minutos; o custo por rodada fica baixo porque o
  // robô pula o diálogo de quem já tem ticket com resumo fresco
  if (Date.now() - ultima < 9 * 60_000) return;

  // marca ANTES de rodar para não empilhar execuções concorrentes
  await admin.from("integracoes_config").upsert({
    sistema: "szchat",
    config: { ...cfg, robo_diurno_em: new Date().toISOString() },
    atualizado_em: new Date().toISOString(),
  });
  const { rodarRoboSz } = await import("@/lib/sz/robo");
  const r = await rodarRoboSz();
  console.log("robô SZ diurno:", JSON.stringify(r));

  // backfill do estoque: o filtro do SZ pega a conversa pela data de INÍCIO,
  // então atendimento aberto semanas atrás nunca entra na janela corrente.
  // A cada ciclo processa UMA fatia antiga de 5 dias (comercial + retenção)
  // até cobrir 35 dias — termina sozinho em ~1h e não roda de novo.
  const feito = Number(cfg.backfill_sz_dias ?? 0) || 0;
  if (feito < 35) {
    const alvoAntigo = new Date(Date.now() - 3 * 3600_000 - (feito + 5) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const rAntigo = await rodarRoboSz(alvoAntigo).catch((e) => ({ ok: false, erro: String(e) }));
    console.log(`backfill SZ (janela até ${alvoAntigo}):`, JSON.stringify(rAntigo));
    const { rodarRoboRetencao } = await import("@/lib/retencao/robo");
    const rRet = await rodarRoboRetencao(alvoAntigo).catch((e) => ({ ok: false, erro: String(e) }));
    console.log(`backfill retenção (janela até ${alvoAntigo}):`, JSON.stringify(rRet));
    const { data: cfgAtual } = await admin
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "szchat")
      .maybeSingle();
    await admin.from("integracoes_config").upsert({
      sistema: "szchat",
      config: { ...((cfgAtual?.config as Record<string, unknown>) ?? {}), backfill_sz_dias: feito + 5 },
      atualizado_em: new Date().toISOString(),
    });
  }
}

async function cicloCompleto() {
  const resultado = await executarSync();
  const rotinas = await executarRotinasCrm();
  await roboSzSeDevido().catch((e) => console.error("robô SZ diurno falhou:", e));
  // canal de cancelamento: mesmo ciclo diurno do comercial — todo mundo que
  // entra no canal vira caso de retenção, sem depender de registro manual
  {
    const { rodarRoboRetencao } = await import("@/lib/retencao/robo");
    await rodarRoboRetencao().catch((e) => console.error("robô retenção falhou:", e));
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
