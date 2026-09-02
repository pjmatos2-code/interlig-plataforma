import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { overrideDoMes, NOME_NIVEL } from "@/lib/gerencia/dados";
import { RelatorioPdf, moedaPdf, VERMELHO } from "@/lib/pdf/relatorio";

export const dynamic = "force-dynamic";

const mesBr = (iso: string) => {
  const m = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${m[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
};

/** PDF do fechamento da Gerência: pilares, trava, base global e override. */
export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  if (!["gestor", "financeiro"].includes(usuario.perfil))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(mes))
    return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

  const d = await overrideDoMes(mes);
  const r = await RelatorioPdf.criar(
    "Fechamento — Comissão da Gerência",
    `Override sobre a base global · competência ${mesBr(mes)} · ${d.regra}`
  );

  r.secao("Pilares do mês");
  r.tabela(
    [
      { titulo: "Pilar", largura: 0.3 },
      { titulo: "Resultado", largura: 0.25, direita: true },
      { titulo: "Atingimento", largura: 0.25, direita: true },
      { titulo: "Nível", largura: 0.2, direita: true },
    ],
    d.pilares.map((p) => [
      p.rotulo,
      p.meta !== null ? `${p.volume} / ${p.meta}` : `${p.volume} retenções`,
      p.atingimentoPct !== null ? `${p.atingimentoPct.toFixed(1).replace(".", ",")}%` : "faixa absoluta",
      `N${p.nivel} - ${NOME_NIVEL[p.nivel]}`,
    ])
  );
  r.linha(
    "Trava pelo menor pilar",
    `MIN(${d.pilares.map((p) => `N${p.nivel}`).join(", ")}) = N${d.nivelFinal}${d.pilarLimitante && d.nivelFinal < 4 ? ` (limitante: ${d.pilarLimitante.rotulo})` : ""}`,
    true
  );

  r.secao("Base global do mês");
  r.linha("VTV Vendas Novas — todas as unidades", moedaPdf(d.base.vtvVendas));
  r.linha("VTV Refidelização", moedaPdf(d.base.vtvRefi));
  r.linha("VTV Retido", moedaPdf(d.base.vtvRetido));
  r.linha("LIGCHIP (compõe o valor, fora do volume)", moedaPdf(d.base.vtvLigchip));
  r.linha("BASE GLOBAL TOTAL", moedaPdf(d.base.total), true);

  r.secao("Comissão da gestão");
  if (d.bloqueado) {
    r.destaqueValor("CÁLCULO BLOQUEADO", d.bloqueado, VERMELHO);
  } else {
    r.destaqueValor(
      `Override aplicado: ${d.overridePct.toFixed(1).replace(".", ",")}% (nível N${d.nivelFinal})`,
      moedaPdf(d.comissao)
    );
  }
  r.nota(
    `Flags da competência: early churn ${d.flags.earlyChurn ? "ON" : "OFF"} · clawback ${d.flags.clawback ? "ON" : "OFF"}${d.flags.observacao ? ` (${d.flags.observacao})` : ""}. Risco de zerar: qualquer pilar abaixo da entrada (vendas < 60%, refidelização < 60%, retenção < 16) zera o override do mês inteiro.`
  );
  r.nota("Valor oficial de pagamento: snapshot gravado no fechamento da competência (módulo Financeiro).");

  const bytes = await r.bytes();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="gerencia-${mes.slice(0, 7)}.pdf"`,
    },
  });
}
