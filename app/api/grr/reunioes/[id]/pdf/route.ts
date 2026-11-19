import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { lerReuniao } from "@/lib/grr/reunioes-dados";
import { assinarPdf, VALIDADE_PDF_MS } from "@/lib/relatorio-semanal/assinatura";
import { imprimirPagina, origemDoSite } from "@/lib/relatorio-semanal/pdf";

export const dynamic = "force-dynamic";
// abrir o Chromium e imprimir leva de 5 a 20 s
export const maxDuration = 90;

/**
 * Relatório da reunião de resultados em PDF (Etapa 4): a mesma ata da tela,
 * impressa pelo Chromium do servidor a partir da página de impressão com
 * link assinado (o mesmo mecanismo do Relatório da diretoria). Só reunião
 * encerrada; quem pede precisa enxergar a reunião (permissão por linha).
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuario = await usuarioAtual();
  if (!usuario || !usuario.ativo) return NextResponse.json({ erro: "Entre na plataforma para baixar o relatório." }, { status: 401 });
  if (!["gestor", "direcao", "supervisor"].includes(usuario.perfil)) return NextResponse.json({ erro: "Sem acesso ao GRR." }, { status: 403 });
  const lida = await lerReuniao(params.id);
  if (!lida || lida.reuniao.modalidade !== "diretoria") return NextResponse.json({ erro: "Reunião não encontrada." }, { status: 404 });
  if (lida.reuniao.situacao !== "encerrada") return NextResponse.json({ erro: "O relatório em PDF sai depois do encerramento da reunião." }, { status: 409 });
  const expiraEm = Date.now() + VALIDADE_PDF_MS;
  const assinatura = assinarPdf(`grr-reuniao:${params.id}`, expiraEm);
  try {
    const pdf = await imprimirPagina(`${origemDoSite(request.url)}/reuniao-pdf/${params.id}?exp=${expiraEm}&sig=${assinatura}`, "Reunião de resultados · GRR Comercial · Interlig");
    const nome = `Reuniao de resultados ${lida.reuniao.data_reuniao}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("GRR: PDF da reunião falhou:", e);
    return NextResponse.json({ erro: `Não foi possível gerar o PDF: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
