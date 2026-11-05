import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { sinalDaTv } from "@/lib/tv/comercial";

export const dynamic = "force-dynamic";

/**
 * Sinal de venda nova da TV comercial (05/11/2026): a TV confere aqui a
 * cada 30 s e só relê a tela inteira quando o sinal muda. Mesmo acesso da
 * página da TV (gestor, supervisor e direção).
 */
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario || !usuario.ativo) return NextResponse.json({ erro: "Entre na plataforma." }, { status: 401 });
  if (!["gestor", "supervisor", "direcao"].includes(usuario.perfil)) {
    return NextResponse.json({ erro: "Sem acesso à TV comercial." }, { status: 403 });
  }
  try {
    return NextResponse.json({ sinal: await sinalDaTv() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
