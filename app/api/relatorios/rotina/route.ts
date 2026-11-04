import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { rotinaDeSegunda } from "@/lib/relatorio-semanal/envio";
import { gerarPdfRelatorio, origemDoSite } from "@/lib/relatorio-semanal/pdf";

export const dynamic = "force-dynamic";
// gerar (números + textos do Claude, 1 a 3 min) + PDF + envio
export const maxDuration = 300;

/**
 * Cron do relatório da diretoria (vercel.json, segunda às 11h UTC = 8h de
 * Santarém): gera o relatório da semana que acabou e manda por e-mail, se o
 * envio automático estiver ligado em Relatório da diretoria. Mesma
 * autenticação dos outros crons (CRON_SECRET).
 *
 * `?pdf=<id>` devolve só o PDF de um relatório, sem e-mail — para conferir
 * o gerador de PDF em produção.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const origem = origemDoSite(request.url);
  const pdfDe = new URL(request.url).searchParams.get("pdf");
  if (pdfDe) {
    if (!/^[0-9a-f-]{36}$/.test(pdfDe)) return NextResponse.json({ erro: "id inválido" }, { status: 400 });
    const { data } = await criarClienteAdmin().from("relatorios_semanais").select("id").eq("id", pdfDe).maybeSingle();
    if (!data) return NextResponse.json({ erro: "relatório não encontrado" }, { status: 404 });
    const inicio = Date.now();
    try {
      const pdf = await gerarPdfRelatorio(pdfDe, origem);
      return new Response(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "X-Tempo-Ms": String(Date.now() - inicio) },
      });
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : String(e), tempoMs: Date.now() - inicio }, { status: 500 });
    }
  }
  try {
    return NextResponse.json(await rotinaDeSegunda(origem));
  } catch (e) {
    console.error("relatório da diretoria: rotina de segunda falhou:", e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
