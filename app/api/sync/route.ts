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
async function cicloCompleto() {
  const resultado = await executarSync();
  const rotinas = await executarRotinasCrm();
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
