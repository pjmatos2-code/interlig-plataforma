import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { avisosPendentes } from "@/lib/avisos/dados";

export const dynamic = "force-dynamic";

/** O popup consulta a cada minuto: aviso novo aparece sem recarregar a página. */
export async function GET() {
  const usuario = await exigirUsuario();
  return NextResponse.json({ avisos: await avisosPendentes(usuario.id) }, { headers: { "Cache-Control": "no-store" } });
}
