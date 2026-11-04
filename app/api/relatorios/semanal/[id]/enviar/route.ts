import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/auth";
import { enviarRelatorio } from "@/lib/relatorio-semanal/envio";
import { MAX_DESTINATARIOS, lerDestinatarios } from "@/lib/relatorio-semanal/email";
import { origemDoSite } from "@/lib/relatorio-semanal/pdf";

export const dynamic = "force-dynamic";
// PDF (até 20 s) + envio pelo SMTP
export const maxDuration = 120;

/** "Enviar por e-mail": manda o relatório agora para os destinatários informados */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuario = await usuarioAtual();
  if (!usuario || !usuario.ativo) return NextResponse.json({ erro: "Entre na plataforma para enviar o relatório." }, { status: 401 });
  if (!["gestor", "direcao"].includes(usuario.perfil)) return NextResponse.json({ erro: "Sem acesso ao relatório da diretoria." }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return NextResponse.json({ erro: "Relatório inválido." }, { status: 404 });
  const corpo = (await request.json().catch(() => null)) as { para?: unknown } | null;
  const { validos, invalidos } = lerDestinatarios(typeof corpo?.para === "string" ? corpo.para : "");
  if (invalidos.length) return NextResponse.json({ erro: `E-mail inválido: ${invalidos.join(", ")}` }, { status: 400 });
  if (!validos.length) return NextResponse.json({ erro: "Informe ao menos um destinatário." }, { status: 400 });
  if (validos.length > MAX_DESTINATARIOS) return NextResponse.json({ erro: `No máximo ${MAX_DESTINATARIOS} destinatários por envio.` }, { status: 400 });

  const r = await enviarRelatorio(params.id, { para: validos, usuarioId: usuario.id, automatico: false, origem: origemDoSite(request.url) });
  revalidatePath("/relatorios");
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
  return NextResponse.json({ ok: true, para: validos, comPdf: r.comPdf, aviso: r.aviso });
}
