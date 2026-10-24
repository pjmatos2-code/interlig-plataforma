import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { resolverEscopo } from "@/lib/performance/escopo";
import { resolverPeriodoPerf } from "@/lib/performance/periodo";
import { montarRelatorio, RELATORIOS } from "@/lib/performance/relatorios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Exportação dos relatórios da Performance Comercial (XLSX/CSV). Autorização
 * no servidor pelo mesmo escopo das telas; vendedor não exporta (PRD 2).
 * Cada exportação fica na trilha de auditoria.
 */
export async function GET(req: NextRequest) {
  const usuario = await usuarioAtual();
  if (!usuario?.ativo) return NextResponse.json({ erro: "Faça login." }, { status: 401 });
  const escopo = await resolverEscopo(usuario);
  if (!escopo?.podeExportar) return NextResponse.json({ erro: "Seu perfil não exporta relatórios." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const chave = sp.get("relatorio") ?? "";
  if (!RELATORIOS[chave]) return NextResponse.json({ erro: "Relatório desconhecido." }, { status: 400 });
  const formato = sp.get("formato") === "csv" ? "csv" : "xlsx";
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const filtrado = resolverPeriodoPerf({ periodo: sp.get("periodo") ?? undefined, de: sp.get("de") ?? undefined, ate: sp.get("ate") ?? undefined }, hoje);
  // performance diária/semanal/mensal: janelas fixas que terminam no fim do período filtrado
  const ref = filtrado.ate;
  const janela = (preset: string, de: string) => (ref === hoje ? resolverPeriodoPerf({ periodo: preset }, hoje) : resolverPeriodoPerf({ periodo: "personalizado", de, ate: ref }, hoje));
  const somaDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
  const periodo =
    chave === "performance_diaria"
      ? janela("hoje", ref)
      : chave === "performance_semanal"
        ? janela("7d", somaDias(ref, -6))
        : chave === "performance_mensal"
          ? janela("mes", `${ref.slice(0, 7)}-01`)
          : filtrado;
  // filtros: só valores dentro do escopo (a apuração já limita os vendedores)
  const ap = await apurarPerformance(escopo, periodo, {
    popId: sp.get("pop"),
    setor: sp.get("setor"),
    coordenadorId: sp.get("coord"),
    vendedorId: sp.get("vendedor"),
  });
  const rel = await montarRelatorio(chave, ap, escopo);
  if (!rel) return NextResponse.json({ erro: "Relatório indisponível." }, { status: 400 });
  await criarClienteAdmin().from("auditoria_performance").insert({ usuario_id: usuario.id, acao: "exportar", alvo: `${chave}.${formato}`, depois: { periodo: periodo.rotulo, linhas: rel.linhas.length } });

  const arquivo = `performance-${chave}-${periodo.de}_a_${periodo.ate}`;
  if (formato === "csv") {
    // Excel em português: vírgula decimal (o separador de colunas é ;). Texto
    // que começa com = + - @ vira texto (nome de perfil do WhatsApp não executa fórmula)
    const esc = (v: unknown) => {
      const bruto = v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
      const s = typeof v === "string" && /^[=+\-@\t\r]/.test(bruto) ? `'${bruto}` : bruto;
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const corpo = ["sep=;", `# ${rel.titulo} — documento interno restrito (LGPD)`, rel.colunas.map(esc).join(";"), ...rel.linhas.map((l) => l.map(esc).join(";"))].join("\r\n");
    return new NextResponse("﻿" + corpo, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${arquivo}.csv"` } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma Interlig — Performance Comercial";
  const ws = wb.addWorksheet("Relatório");
  ws.addRow([rel.titulo]).font = { bold: true, size: 13 };
  ws.addRow(["Documento interno restrito (LGPD). Indicadores de apoio à gestão — não usar isoladamente para decisões trabalhistas ou disciplinares."]).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  ws.addRow([]);
  const cab = ws.addRow(rel.colunas);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF043792" } }));
  for (const l of rel.linhas) ws.addRow(l);
  ws.columns.forEach((c, i) => (c.width = Math.min(48, Math.max(12, (rel.colunas[i] ?? "").length + 4))));
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${arquivo}.xlsx"` },
  });
}
