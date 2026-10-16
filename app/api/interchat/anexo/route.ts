import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Abre o anexo de uma mensagem — a RLS só devolve a mensagem para quem participa da conversa. */
export async function GET(req: Request) {
  await exigirUsuario();
  const id = new URL(req.url).searchParams.get("m") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ erro: "inválido" }, { status: 400 });
  const { data: msg } = await criarClienteServidor().from("chat_mensagens").select("anexo_path").eq("id", id).maybeSingle();
  if (!msg?.anexo_path) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const { data } = await criarClienteAdmin().storage.from("interchat").createSignedUrl(msg.anexo_path as string, 3600);
  if (!data?.signedUrl) return NextResponse.json({ erro: "indisponível" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=3000" } });
}
