import { NextResponse } from "next/server";
import { fecharSemanaAutomaticamente } from "@/lib/grr/fotos-dados";

export const dynamic = "force-dynamic";
// ler a base da semana e montar todos os recortes leva de 10 a 60 s
export const maxDuration = 120;

/**
 * Fechamento automático do GRR (vercel.json: segunda às 10:00 UTC = 07:00 em
 * Santarém, antes do Relatório da diretoria). Congela a última semana
 * completa com origem "rotina"; se ela já tem foto, não faz nada. Só o cron
 * entra: exige o CRON_SECRET e recusa quando ele não está configurado.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  try {
    const r = await fecharSemanaAutomaticamente();
    console.log("GRR: fechamento automático", r);
    return NextResponse.json(r);
  } catch (e) {
    console.error("GRR: fechamento automático falhou:", e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
