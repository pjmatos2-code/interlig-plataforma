import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { apuracaoEmAndamento } from "@/lib/comissao/financeiro";
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
};

/** PDF geral dos times comerciais: agentes, resultado e valores — sem vendas. */
export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  if (!["gestor", "financeiro"].includes(usuario.perfil))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(mes))
    return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

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
