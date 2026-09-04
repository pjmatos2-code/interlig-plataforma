import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { apuracaoEmAndamento, competenciaFinanceiro } from "@/lib/comissao/financeiro";
import { RelatorioPdf, moedaPdf } from "@/lib/pdf/relatorio";

export const dynamic = "force-dynamic";

const mesBr = (iso: string) => {
  const m = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${m[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
};
const SETOR: Record<string, string> = {
  comercial: "Comercial",
  refidelizacao: "Refidelização",
  retencao: "Retenção",
  gerencia: "Gerência",
};
const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Santarem" });

/** PDF geral dos times comerciais: agentes, resultado e valores — sem vendas. */
export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  if (!["gestor", "financeiro", "direcao"].includes(usuario.perfil))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(mes))
    return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

  // origem=fechado gera o PDF geral da competência já fechada (valores congelados)
  if (searchParams.get("origem") === "fechado") return pdfFechado(mes);

  const d = await apuracaoEmAndamento(mes);
  const r = await RelatorioPdf.criar(
    "Apuração Geral de Comissões",
    `Agentes, resultado e valores · competência ${mesBr(mes)} · prévia para provisão`
  );

  r.secao("Resultado por agente");
  r.tabela(
    [
      { titulo: "Agente", largura: 0.24 },
      { titulo: "Setor", largura: 0.13 },
      { titulo: "Liberadas", largura: 0.1, direita: true },
      { titulo: "Pendentes", largura: 0.1, direita: true },
      { titulo: "Ating.", largura: 0.1, direita: true },
      { titulo: "Faixa", largura: 0.15 },
      { titulo: "Comissão", largura: 0.18, direita: true },
    ],
    [...d.linhas]
      .sort((a, b) => b.parcial - a.parcial)
      .map((l) => [
        l.vendedora,
        SETOR[l.setor] ?? l.setor,
        String(l.vendasLiberadas),
        l.vendasPendentes > 0 ? String(l.vendasPendentes) : "-",
        `${l.atingimentoPct.toFixed(1).replace(".", ",")}%`,
        l.faixa,
        moedaPdf(l.parcial),
      ]),
    [
      `TOTAL (${d.linhas.length} agentes)`,
      "",
      String(d.linhas.reduce((s, l) => s + l.vendasLiberadas, 0)),
      String(d.totais.pendentes),
      "",
      "",
      moedaPdf(d.totais.parcial),
    ]
  );

  r.secao("Consolidado");
  r.linha("Comissão liberada (prévia)", moedaPdf(d.totais.parcial), true);
  r.linha("Projeção se liberar as pendências", moedaPdf(d.totais.seLiberarPendentes));
  r.destaqueValor("CUSTO COMERCIAL PROJETADO DA COMPETÊNCIA", moedaPdf(d.totais.seLiberarPendentes));
  r.nota(
    "Documento sem detalhamento de vendas — a memória de cálculo por agente e a lista nominal de contratos ficam na plataforma (Financeiro > Em apuração) e nos demonstrativos individuais emitidos no fechamento."
  );

  const bytes = await r.bytes();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="apuracao-geral-${mes.slice(0, 7)}.pdf"`,
    },
  });
}

/** PDF geral do fechamento: valores congelados de comissoes_fechadas. */
async function pdfFechado(mes: string) {
  const d = await competenciaFinanceiro(mes);
  if (!d.fechada)
    return NextResponse.json({ erro: "Competência ainda não fechada." }, { status: 404 });

  const r = await RelatorioPdf.criar(
    "Fechamento Geral de Comissões",
    `Agentes, resultado e valores · competência ${mesBr(mes)} · valores congelados no fechamento`
  );

  r.secao("Comissões a pagar");
  r.tabela(
    [
      { titulo: "Agente", largura: 0.24 },
      { titulo: "Setor", largura: 0.13 },
      { titulo: "Vendas", largura: 0.08, direita: true },
      { titulo: "Meta", largura: 0.08, direita: true },
      { titulo: "Ating.", largura: 0.1, direita: true },
      { titulo: "Faixa", largura: 0.14 },
      { titulo: "A pagar", largura: 0.15, direita: true },
      { titulo: "Pgto.", largura: 0.08 },
    ],
    d.linhas.map((l) => [
      l.vendedora,
      SETOR[l.setorFechado] ?? l.setorFechado,
      String(l.vendasLiberadas),
      l.metaEfetiva > 0 ? String(l.metaEfetiva) : "-",
      `${(l.atingimentoPct * 100).toFixed(1).replace(".", ",")}%`,
      l.faixa,
      moedaPdf(l.total),
      l.pagoEm ? "PAGO" : "-",
    ]),
    [
      `TOTAL (${d.totais.agentes} agentes)`,
      "",
      String(d.linhas.reduce((s, l) => s + l.vendasLiberadas, 0)),
      "",
      "",
      "",
      moedaPdf(d.totais.valor),
      "",
    ]
  );

  r.secao("Consolidado do fechamento");
  if (d.fechadoEm)
    r.linha("Fechado em", `${dataBr(d.fechadoEm)}${d.fechadoPor ? ` por ${d.fechadoPor}` : ""}`);
  r.linha("Já pagos", `${d.totais.pagos}/${d.totais.agentes} (${moedaPdf(d.totais.valorPago)})`);
  r.linha("Falta pagar", moedaPdf(d.totais.valor - d.totais.valorPago), true);
  r.destaqueValor("TOTAL DA FOLHA DE COMISSOES DA COMPETENCIA", moedaPdf(d.totais.valor));
  r.nota(
    "Documento sem detalhamento de vendas — somente agentes, resultado e valores, congelados no fechamento. A memória de cálculo de cada agente está no demonstrativo individual (coluna Doc. na plataforma), validável pelo código de verificação."
  );

  const bytes = await r.bytes();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="fechamento-geral-${mes.slice(0, 7)}.pdf"`,
    },
  });
}
