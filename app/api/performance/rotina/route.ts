import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { rodarRotinaPerformance } from "@/lib/performance/rotina";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // orçamento interno de 100 s

/**
 * Cron da Performance Comercial (vercel.json, a cada 10 min): coleta do
 * chat, follow-ups, alertas, IA e fotografias diárias. Mesma autenticação do
 * /api/sync (CRON_SECRET). Responde na hora e segue em segundo plano;
 * `?aguardar=1` espera o resultado (uso manual).
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (new URL(request.url).searchParams.get("aguardar") === "1") {
    const resultado = await rodarRotinaPerformance();
    return NextResponse.json(resultado);
  }
  waitUntil(rodarRotinaPerformance().catch((e) => console.error("rotina da performance falhou:", e)));
  return NextResponse.json({ resultado: "disparado" }, { status: 202 });
}
