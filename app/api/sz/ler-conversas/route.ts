import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { rodarRoboSz } from "@/lib/sz/robo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Robô de leitura noturna das conversas comerciais do SZ (19:30).
 * Autorização: header `Authorization: Bearer <CRON_SECRET>` ou `?secret=`.
 * Responde na hora e roda em segundo plano (o cron externo desconecta em 30s).
 * `?aguardar=1` espera o resultado (uso manual/diagnóstico).
 */
function autorizado(request: Request, url: URL): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${segredo}` || url.searchParams.get("secret") === segredo;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!autorizado(request, url)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const dia = url.searchParams.get("dia") || undefined; // YYYY-MM-DD (padrão: hoje)

  if (url.searchParams.get("aguardar") === "1") {
    const r = await rodarRoboSz(dia);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  }

  waitUntil(
    rodarRoboSz(dia).catch((e) => console.error("robô SZ falhou:", e))
  );
  return NextResponse.json({ resultado: "iniciado", aviso: "leitura em segundo plano" }, { status: 202 });
}
