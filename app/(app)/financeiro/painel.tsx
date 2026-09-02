"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoeda, formatarPercentual } from "@/lib/format";
import type { CompetenciaFinanceiro, LinhaPagamento } from "@/lib/comissao/financeiro";
import { marcarPago, desmarcarPago } from "./acoes";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function Linha({
  l,
  mes,
  podeMarcar,
}: {
  l: LinhaPagamento;
  mes: string;
  podeMarcar: boolean;
}) {
  const router = useRouter();
  const [obs, setObs] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(fn: () => Promise<{ erro?: string }>) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setAbrindo(false);
    setObs("");
    router.refresh();
  }

  return (
    <tr className={`border-t align-top ${l.pagoEm ? "bg-emerald-50/40" : ""}`}>
      <td className="px-3 py-2">
        <span className="flex items-center gap-2">
          <AvatarAgente nome={l.vendedora} foto={l.foto} tamanho="sm" />
          <p className="font-medium">{l.vendedora}</p>
        </span>
        <p className="text-xs text-muted-foreground">
          {l.pop ?? "—"} · cód. {l.codigo}
          {l.versao > 1 && ` · v${l.versao}`}
        </p>
        {erro && <p className="text-xs text-farol-vermelho">{erro}</p>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">
        {l.vendasLiberadas}
        {l.vendasAprovadasGestao > 0 && (
          <span
            className="ml-1 text-xs text-muted-foreground"
            title={`${l.vendasAprovadasGestao} liberada(s) manualmente pela gestão`}
          >
            ({l.vendasAprovadasGestao}*)
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">
        {l.meta}
        {l.metaEfetiva !== l.meta && (
          <span className="text-xs text-muted-foreground"> → {l.metaEfetiva}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">
        {formatarPercentual(l.atingimentoPct, 1)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs text-muted-foreground">
        {l.faixa}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
        {formatarMoeda(l.total)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center">
        <a
          href={`/api/comissao/demonstrativo?vendedor=${l.vendedorId}&mes=${mes}`}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          PDF
        </a>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {l.pagoEm ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-medium text-farol-verde">
              ✓ pago {dataBr(l.pagoEm)}
            </span>
            {l.pagoPor && <span className="text-[11px] text-muted-foreground">{l.pagoPor}</span>}
            {l.pagamentoObs && (
              <span className="text-[11px] text-muted-foreground">{l.pagamentoObs}</span>
            )}
            {podeMarcar && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => executar(() => desmarcarPago(l.vendedorId, mes))}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                desfazer
              </button>
            )}
          </div>
        ) : !podeMarcar ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : abrindo ? (
          <div className="flex items-center justify-end gap-1">
            <input
              autoFocus
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="obs. (opcional)"
              className="h-8 w-36 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={() => executar(() => marcarPago(l.vendedorId, mes, obs))}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setAbrindo(false)}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAbrindo(true)}
            className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            Marcar pago
          </button>
        )}
      </td>
    </tr>
  );
}

export function PainelFinanceiro({
  dados,
  podeMarcar,
}: {
  dados: CompetenciaFinanceiro;
  podeMarcar: boolean;
}) {
  function exportarPlanilha() {
    const esc = (v: string | number) => {
      const t = String(v ?? "");
      return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const br = (n: number) => n.toFixed(2).replace(".", ",");
    const cab = [
      "Agente", "POP", "Meta", "Meta efetiva", "Vendas liberadas",
      "Liberadas pela gestão", "Atingimento", "Faixa", "Base (R$)",
      "A PAGAR (R$)", "Código", "Versão", "Pago em",
    ];
    const linhas = dados.linhas.map((l) => [
      l.vendedora, l.pop ?? "", l.meta, l.metaEfetiva, l.vendasLiberadas,
      l.vendasAprovadasGestao, `${(l.atingimentoPct * 100).toFixed(1).replace(".", ",")}%`,
      l.faixa, br(l.valorBase), br(l.total), l.codigo, l.versao,
      l.pagoEm ? dataBr(l.pagoEm) : "",
    ]);
    linhas.push(["TOTAL", "", "", "", "", "", "", "", "", br(dados.totais.valor), "", "", ""]);
    const csv =
      "﻿" + [cab.map(esc).join(";"), ...linhas.map((l) => l.map(esc).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagamento-comissao-${dados.competencia.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle>Comissões a pagar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fechado em {dados.fechadoEm ? dataBr(dados.fechadoEm) : "—"}
            {dados.fechadoPor && ` por ${dados.fechadoPor}`} · valores congelados no fechamento
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/apuracao/pdf?mes=${dados.competencia}&origem=fechado`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            ⬇ Exportar PDF geral
          </a>
          <button
            type="button"
            onClick={exportarPlanilha}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            ↓ Planilha da competência
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left">Agente</th>
                <th className="px-3 py-2 text-center">Vendas</th>
                <th className="px-3 py-2 text-center">Meta</th>
                <th className="px-3 py-2 text-center">Ating.</th>
                <th className="px-3 py-2 text-center">Faixa</th>
                <th className="px-3 py-2 text-right">A pagar</th>
                <th className="px-3 py-2 text-center">Doc.</th>
                <th className="px-3 py-2 text-right">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((l) => (
                <Linha key={l.vendedorId} l={l} mes={dados.competencia} podeMarcar={podeMarcar} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-3 pt-3 text-xs text-muted-foreground">
          (*) vendas liberadas manualmente pela gestão — o motivo está no Anexo II do PDF.
        </p>
      </CardContent>
    </Card>
  );
}
