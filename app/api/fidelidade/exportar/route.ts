import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { exigirUsuario } from "@/lib/auth";
import {
  FAIXAS_FIDELIDADE,
  UNIDADES_FIDELIDADE,
  escopoFidelidade,
  familiasDoFiltro,
  formatarTelefone,
  lerFiltroLista,
  lerListaFidelidade,
  lerResumoFidelidade,
} from "@/lib/sgp/fidelidade";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Planilha da lista nominal da fidelidade (pedido do Paulo, 04/11/2026): os
 * mesmos clientes da tela /fidelidade/lista — faixa, unidade e plano da
 * URL —, com telefone, mensalidade, fim da fidelidade e o link do SGP.
 */

const AZUL = "FF043792";
const MOEDA = '"R$" #,##0.00';
// o Excel não tem fuso: a data vai ao meio-dia para não virar o dia anterior
const dataExcel = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : null);
const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  const escopo = await escopoFidelidade(usuario);
  if (!escopo) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const filtro = lerFiltroLista(
    {
      faixa: searchParams.get("faixa"),
      unidade: searchParams.get("unidade"),
      plano: searchParams.get("plano"),
      outros: searchParams.get("outros"),
    },
    escopo.unidadeFixa
  );
  const resumo = await lerResumoFidelidade();
  const { familias, titulo } = familiasDoFiltro(filtro, resumo);
  const [{ clientes, atualizadoEm }, template] = await Promise.all([
    lerListaFidelidade(filtro.faixa, filtro.pop, familias),
    templateLinkSgp(),
  ]);
  const faixa = FAIXAS_FIDELIDADE.find((f) => f.chave === filtro.faixa)!;
  const unidade = filtro.pop ? UNIDADES_FIDELIDADE.find((u) => u.pop === filtro.pop)?.nome ?? null : null;
  const vencendo = filtro.faixa !== "sem";

  const wb = new ExcelJS.Workbook();
  wb.creator = "Interlig · Plataforma de Inteligência Comercial";
  wb.created = new Date();

  const colunas: { titulo: string; chave: string; largura: number; formato?: string }[] = [
    { titulo: "Cliente", chave: "cliente", largura: 36 },
    { titulo: "Telefone", chave: "telefone", largura: 17 },
    { titulo: "Unidade", chave: "unidade", largura: 16 },
    { titulo: "Plano no SGP", chave: "plano", largura: 32 },
    { titulo: "Grupo do plano", chave: "familia", largura: 22 },
    { titulo: "Mensalidade", chave: "mensalidade", largura: 13, formato: MOEDA },
    { titulo: "Fidelidade", chave: "faixa", largura: 20 },
    ...(vencendo
      ? [
          { titulo: "Fim da fidelidade", chave: "fim", largura: 14, formato: "dd/mm/yyyy" },
          { titulo: "Dias restantes", chave: "dias", largura: 10 },
        ]
      : []),
    { titulo: "ID contrato (SGP)", chave: "contrato", largura: 12 },
    { titulo: "ID cliente (SGP)", chave: "clienteId", largura: 12 },
    { titulo: "SGP", chave: "sgp", largura: 12 },
  ];
  const ws = wb.addWorksheet("Clientes", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = colunas.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura, style: c.formato ? { numFmt: c.formato } : {} }));
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  cab.alignment = { vertical: "middle", wrapText: true };
  cab.height = 30;
  for (const c of clientes) {
    const sgp = aplicarLinkSgp(template, { clienteId: c.clienteId, contratoId: c.contrato });
    ws.addRow({
      cliente: c.cliente,
      telefone: c.telefone ? formatarTelefone(c.telefone) : null,
      unidade: c.unidade,
      plano: c.plano,
      familia: c.familia,
      mensalidade: c.mensalidade,
      faixa: faixa.rotulo,
      fim: dataExcel(c.fim),
      dias: c.dias,
      contrato: Number(c.contrato) || c.contrato,
      clienteId: c.clienteId ? Number(c.clienteId) || c.clienteId : null,
      sgp: sgp ? { text: "Abrir no SGP", hyperlink: sgp } : null,
    });
  }
  const colSgp = ws.getColumn("sgp");
  colSgp.eachCell((cel, linha) => {
    if (linha > 1 && cel.value) cel.font = { color: { argb: "FF047CDD" }, underline: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };

  const sobre = wb.addWorksheet("Sobre");
  sobre.columns = [{ width: 24 }, { width: 70 }];
  sobre.addRow(["Fidelidade da base — lista de clientes"]).font = { bold: true, size: 14, color: { argb: AZUL } };
  sobre.addRow([]);
  const linhas: [string, string][] = [
    ["Plano", titulo],
    ["Fidelidade", faixa.rotulo],
    ["Unidade", unidade ?? "todas"],
    ["Clientes", String(clientes.length)],
    ["Lista do SGP de", atualizadoEm ? new Date(atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Santarem" }) : "—"],
    ["Gerada em", `${new Date().toLocaleString("pt-BR", { timeZone: "America/Santarem" })} por ${usuario.nome}`],
    ["Fora da lista", "Permutas, isentos (mensalidade zero, cortesia, controle interno) e órgãos públicos — os mesmos que o gráfico tira."],
    ["Dado pessoal", "Uso interno para contato de refidelização (LGPD). Não repasse a terceiros."],
  ];
  for (const [k, v] of linhas) {
    const r = sobre.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const partes = ["fidelidade", slug(faixa.rotulo), filtro.plano || filtro.outros ? slug(titulo) : null, unidade ? slug(unidade) : null, hoje];
  const nomeArquivo = `${partes.filter(Boolean).join("-")}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
