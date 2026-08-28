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
  if (Date.now() - ultima < 28 * 60_000) return;

  // marca ANTES de rodar para não empilhar execuções concorrentes
  await admin.from("integracoes_config").upsert({
    sistema: "szchat",
    config: { ...cfg, robo_diurno_em: new Date().toISOString() },
    atualizado_em: new Date().toISOString(),
  });
  const { rodarRoboSz } = await import("@/lib/sz/robo");
  const r = await rodarRoboSz();
  console.log("robô SZ diurno:", JSON.stringify(r));
}

async function cicloCompleto() {
  const resultado = await executarSync();
  const rotinas = await executarRotinasCrm();
  await roboSzSeDevido().catch((e) => console.error("robô SZ diurno falhou:", e));
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
