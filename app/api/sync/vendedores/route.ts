import { NextResponse } from "next/server";
import { identificarVendedoresPainel } from "@/lib/sgp/painel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Roda o leitor de vendedor do painel SGP sob demanda (diagnóstico/backfill).
 * Autorização: Bearer CRON_SECRET ou ?secret=. Parâmetro ?limite= (padrão 15).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const segredo = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (segredo && auth !== `Bearer ${segredo}` && url.searchParams.get("secret") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const limite = Math.min(60, Math.max(1, Number(url.searchParams.get("limite")) || 15));
  const r = await identificarVendedoresPainel(limite);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
