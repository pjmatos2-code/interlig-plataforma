import { NextResponse } from "next/server";
import { fecharSemanaAutomaticamente } from "@/lib/grr/fotos-dados";
import { fecharSemanaTecnicoAutomaticamente } from "@/lib/grr/tecnico/fotos";

export const dynamic = "force-dynamic";
// ler a base da semana e montar todos os recortes leva de 10 a 60 s por setor
export const maxDuration = 180;

/**
 * Fechamento automático do GRR (vercel.json: segunda às 10:00 UTC = 07:00 em
 * Santarém, antes do Relatório da diretoria). Congela a última semana
 * completa com origem "rotina", no comercial e no técnico (desde 21/11/2026);
 * o setor que já tem foto fica como está, e a falha de um não impede o outro.
 * Só o cron entra: exige o CRON_SECRET e recusa quando ele não está configurado.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const resultado: Record<string, unknown> = {};
  let falhou = false;
  const setores: [string, () => Promise<unknown>][] = [
    ["comercial", fecharSemanaAutomaticamente],
    ["tecnico", fecharSemanaTecnicoAutomaticamente],
  ];
  for (const [setor, fechar] of setores) {
    try {
      resultado[setor] = await fechar();
    } catch (e) {
      falhou = true;
      console.error(`GRR: fechamento automático (${setor}) falhou:`, e);
      resultado[setor] = { erro: e instanceof Error ? e.message : String(e) };
    }
  }
  console.log("GRR: fechamento automático", resultado);
  return NextResponse.json(resultado, { status: falhou ? 500 : 200 });
}
