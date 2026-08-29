"use client";

import type { ComissaoVendedora } from "@/lib/comissao/dados";

/** CSV com BOM e ';' — abre direto no Excel pt-BR sem passo de importação. */
function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number)[][]) {
  const esc = (v: string | number) => {
    const t = String(v ?? "");
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv =
    "﻿" +
    [cabecalho.map(esc).join(";"), ...linhas.map((l) => l.map(esc).join(";"))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** número no formato que o Excel pt-BR entende como número (vírgula decimal) */
const br = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * Relatório de fechamento da competência: uma linha por vendedora com meta,
 * débito, faixa aplicada e o valor a pagar. É o documento que sai do sistema
 * para o financeiro.
 */
export function RelatorioFechamento({
  comissoes,
  competencia,
  debitoAplicado,
}: {
  comissoes: ComissaoVendedora[];
  competencia: string;
  /** false: o mês fechou sem débito — a planilha precisa dizer isso */
  debitoAplicado: boolean;
}) {
  const mes = competencia.slice(0, 7);
  const comRegra = comissoes.filter((c) => c.resultado !== null);
  const totalPagar = comRegra.reduce((s, c) => s + (c.resultado?.total ?? 0), 0);

  function exportar() {
    const linhas = comRegra.map((c) => {
      const r = c.resultado!;
      return [
        c.nome,
        c.metaMensal ?? 0,
        r.debitoMeta,
        r.metaEfetiva,
        r.vendasComissionaveis,
        r.vendasPendentes,
        r.estornos,
        `${(r.atingimentoPct * 100).toFixed(1).replace(".", ",")}%`,
        r.degrau ? `${r.degrau.valor}${r.degrau.tipo === "valor_por_venda" ? " R$/venda" : "% VTV"}` : "sem faixa",
        br(r.valorBase),
        br(r.bonusFixo),
        br(r.gatilhos.reduce((s, g) => s + g.adicional, 0)),
        br(r.total),
        br(r.totalSeLiberar),
      ];
    });
    linhas.push([
      "TOTAL",
      "", "", "",
      comRegra.reduce((s, c) => s + (c.resultado?.vendasComissionaveis ?? 0), 0),
      comRegra.reduce((s, c) => s + (c.resultado?.vendasPendentes ?? 0), 0),
      comRegra.reduce((s, c) => s + (c.resultado?.estornos ?? 0), 0),
      "", "", "", "", "",
      br(totalPagar),
      br(comRegra.reduce((s, c) => s + (c.resultado?.totalSeLiberar ?? 0), 0)),
    ]);

    baixarCsv(
      `fechamento-comissao-${mes}.csv`,
      [
        "Vendedora",
        "Meta",
        debitoAplicado ? "Débito na meta" : "Débito na meta (NÃO aplicado)",
        "Meta efetiva",
        "Vendas liberadas",
        "Vendas pendentes",
        "Estornos",
        "Atingimento",
        "Faixa aplicada",
        "Base (R$)",
        "Bônus fixo (R$)",
        "Gatilhos (R$)",
        "A PAGAR (R$)",
        "Se liberar as pendentes (R$)",
      ],
      linhas
    );
  }

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={comRegra.length === 0}
      className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      title="Planilha por vendedora com meta, faixa e valor a pagar"
    >
      ↓ Relatório de fechamento ({mes}){debitoAplicado ? "" : " · sem débito"}
    </button>
  );
}
