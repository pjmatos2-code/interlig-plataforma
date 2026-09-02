import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { tecnicaDoMes } from "@/lib/tecnica/dados";
import { RelatorioPdf, moedaPdf, VERMELHO } from "@/lib/pdf/relatorio";

export const dynamic = "force-dynamic";

const mesBr = (iso: string) => {
  const m = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${m[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
};
const UNIDADE: Record<string, string> = { atm: "Altamira", bn: "Brasil Novo", vtx: "VTX" };

/** PDF geral da Equipe Técnica: técnicos, resultado e valores — sem OS a OS. */
export async function GET(req: Request) {
  const usuario = await exigirUsuario();
  if (!["gestor", "financeiro", "gestor_tecnico"].includes(usuario.perfil))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(mes))
    return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

  const d = await tecnicaDoMes(mes);
  const r = await RelatorioPdf.criar(
    "Fechamento — Equipe Técnica",
    `Comissão por OS encerrada · competência ${mesBr(mes)}`
  );

  r.secao("Regras aplicadas");
  r.nota(
    "Só OS encerrada no mês pontua. Ativação/mudança de endereço: Altamira R$ 30 · Brasil Novo e VTX R$ 15. Suporte (técnicos habilitados): R$ 10. Retorno em até 72h no mesmo contrato anula a OS de origem. Auxiliar pontua igual ao responsável."
  );

  r.secao("Resultado por técnico");
  r.tabela(
    [
      { titulo: "Técnico", largura: 0.26 },
      { titulo: "Unidade", largura: 0.13 },
      { titulo: "Ativ.", largura: 0.08, direita: true },
      { titulo: "Suportes", largura: 0.1, direita: true },
      { titulo: "Retornos (-R$)", largura: 0.15, direita: true },
      { titulo: "Ajuste", largura: 0.12, direita: true },
      { titulo: "Comissão", largura: 0.16, direita: true },
    ],
    d.tecnicos.map((t) => [
      t.nome,
      UNIDADE[t.unidade] ?? t.unidade,
      String(t.ativacoes),
      t.suportes > 0 ? String(t.suportes) : "-",
      t.anuladasRetorno > 0 ? `${t.anuladasRetorno} (-${moedaPdf(t.valorAnuladoRetorno)})` : "-",
      t.ajuste ? `${t.ajuste.modo === "substituir" ? "=" : "+"} ${moedaPdf(t.ajuste.valor)}` : "-",
      moedaPdf(t.comissao),
    ]),
    [
      `TOTAL (${d.tecnicos.length} técnicos)`,
      "",
      String(d.totais.ativacoes),
      String(d.totais.suportes),
      `${d.totais.anuladasRetorno} (-${moedaPdf(d.totais.impactoRetornos)})`,
      "",
      moedaPdf(d.totais.comissao),
    ]
  );

  r.secao("Quebra por categoria");
  r.linha(`Ativações + mudanças (${d.totais.ativacoes})`, moedaPdf(d.totais.quebra.valorAtivacoes));
  r.linha(`Suportes (${d.totais.suportes})`, moedaPdf(d.totais.quebra.valorSuportes));
  if (d.totais.quebra.ajustes !== 0) r.linha("Ajustes da gestão", moedaPdf(d.totais.quebra.ajustes));
  r.destaqueValor("COMISSÃO TOTAL DO SETOR", moedaPdf(d.totais.comissao));
  if (d.totais.anuladasRetorno > 0)
    r.destaqueValor(
      "Impacto dos retornos <72h (OS anuladas)",
      `-${moedaPdf(d.totais.impactoRetornos)} em ${d.totais.anuladasRetorno} OS`,
      VERMELHO
    );
  r.nota("Detalhamento OS a OS disponível no módulo Equipe Técnica da plataforma, com o vínculo de cada ordem no SGP.");

  const bytes = await r.bytes();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="equipe-tecnica-${mes.slice(0, 7)}.pdf"`,
    },
  });
}
