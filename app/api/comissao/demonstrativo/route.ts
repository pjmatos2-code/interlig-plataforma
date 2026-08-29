import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gerarDemonstrativoPdf } from "@/lib/comissao/demonstrativo-pdf";
import type { SnapshotComissao } from "@/lib/comissao/snapshot";

export const dynamic = "force-dynamic";

/**
 * Demonstrativo em PDF de uma competência FECHADA.
 *
 * Quem pode baixar: gestor e financeiro (qualquer agente) e a própria agente
 * (só o dela). O documento sai do snapshot gravado no fechamento — nunca de um
 * recálculo — para que o papel entregue continue batendo com o que foi pago.
 */
export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  const { searchParams } = new URL(req.url);
  const vendedorId = searchParams.get("vendedor") ?? "";
  const mes = searchParams.get("mes") ?? "";

  if (!/^[0-9a-f-]{36}$/i.test(vendedorId) || !/^\d{4}-\d{2}-01$/.test(mes)) {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const podeTudo = usuario.perfil === "gestor" || usuario.perfil === "financeiro";
  const ehDela = usuario.vendedor_id === vendedorId;
  if (!podeTudo && !ehDela) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("comissoes_fechadas")
    .select("snapshot, versao, pago_em, vendedores(nome)")
    .eq("vendedor_id", vendedorId)
    .eq("mes_ano", mes)
    .maybeSingle();

  if (!data) {
    return NextResponse.json(
      { erro: "Competência ainda não fechada para esta agente." },
      { status: 404 }
    );
  }

  const snap = data.snapshot as unknown as SnapshotComissao;
  if (!snap?.resultado) {
    return NextResponse.json(
      { erro: "Fechamento antigo, sem demonstrativo detalhado. Reabra e feche a competência novamente." },
      { status: 409 }
    );
  }

  const pdf = await gerarDemonstrativoPdf(snap, {
    vendedorId,
    versao: (data.versao as number) ?? 1,
    pagoEm: (data.pago_em as string | null) ?? null,
  });

  const nome = `demonstrativo-${snap.vendedora.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mes.slice(0, 7)}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
