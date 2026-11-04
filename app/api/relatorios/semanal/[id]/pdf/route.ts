import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gerarPdfRelatorio, origemDoSite } from "@/lib/relatorio-semanal/pdf";
import { montarEmailRelatorio } from "@/lib/relatorio-semanal/email";
import type { DadosRelatorio } from "@/lib/relatorio-semanal/tipos";

export const dynamic = "force-dynamic";
// abrir o Chromium e imprimir leva de 5 a 20 s
export const maxDuration = 90;

/** "Baixar PDF": o mesmo PDF que vai no e-mail (gestor e direção) */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuario = await usuarioAtual();
  if (!usuario || !usuario.ativo) return NextResponse.json({ erro: "Entre na plataforma para baixar o relatório." }, { status: 401 });
  if (!["gestor", "direcao"].includes(usuario.perfil)) return NextResponse.json({ erro: "Sem acesso ao relatório da diretoria." }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return NextResponse.json({ erro: "Relatório inválido." }, { status: 404 });
  const { data } = await criarClienteAdmin().from("relatorios_semanais").select("semana_inicio, semana_fim, dados").eq("id", params.id).maybeSingle();
  if (!data) return NextResponse.json({ erro: "Relatório não encontrado." }, { status: 404 });
  try {
    const pdf = await gerarPdfRelatorio(params.id, origemDoSite(request.url));
    const { arquivo } = montarEmailRelatorio({
      semana: { inicio: data.semana_inicio as string, fim: data.semana_fim as string },
      dados: data.dados as DadosRelatorio,
      textos: null,
      saudacao: null,
      link: "",
      comPdf: true,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(arquivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("relatório semanal: PDF falhou:", e);
    return NextResponse.json({ erro: `Não foi possível gerar o PDF: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
