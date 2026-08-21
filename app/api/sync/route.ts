import { NextResponse } from "next/server";
import { executarSync } from "@/lib/sync/worker";
import { executarRotinasCrm } from "@/lib/crm/rotinas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rota do worker de sync (PRD 7.1) — chamada pelo cron (Vercel Cron a cada
 * 10 min, vercel.json) ou manualmente pelo gestor no admin.
 * Protegida por CRON_SECRET (Authorization: Bearer <segredo>).
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
    }
  }

  const resultado = await executarSync();
  // reconciliação + fechamento por inatividade logo após o sync: a atribuição
  // venda→vendedora acontece no mesmo ciclo (critério D5, tempo quase real)
  const rotinas = await executarRotinasCrm();
  const houveErro = resultado.execucoes.some((e) => e.status === "erro");
  return NextResponse.json({ ...resultado, rotinas }, { status: houveErro ? 500 : 200 });
}

export const POST = GET;
