import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { rodarRotinas } from "@/lib/sync/rotinas";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // relógio interno de 172 s, como o /api/sync

/**
 * Cron das rotinas que saíram do fim do /api/sync (vercel.json, a cada 5 min):
 * robô comercial e robô de retenção do SZ, ativações da esteira, Meu Dia e
 * relatórios do SGP (cancelamentos, ocorrências, fidelidade). Cada uma segue a
 * própria cadência (lib/sync/agenda.ts) — na maioria dos disparos só confere
 * que não é a vez. Mesma autenticação do /api/sync (CRON_SECRET) e mesmo
 * prefixo público no middleware; responde na hora e segue em segundo plano.
 * `?aguardar=1` espera o resultado (uso manual).
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (new URL(request.url).searchParams.get("aguardar") === "1") {
    return NextResponse.json(await rodarRotinas());
  }
  waitUntil(rodarRotinas().catch((e) => console.error("rotinas em segundo plano falharam:", e)));
  return NextResponse.json({ resultado: "disparado" }, { status: 202 });
}

export const POST = GET;
