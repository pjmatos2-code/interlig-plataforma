"use client";

import { useState } from "react";
import {
  calcularComissao,
  simularMaisVendas,
  proximoDegrau,
  type DegrauComissao,
  type GatilhoComissao,
  type VendaComissao,
} from "@/lib/indicadores/comissao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Simulador de comissão da vendedora (PRD 3.7 + seção 6). Cálculo 100% local. */
export function SimuladorComissao({
  entrada,
}: {
  entrada: {
    vendas: VendaComissao[];
    metaMensal: number;
    degraus: DegrauComissao[];
    gatilhos: GatilhoComissao[];
  };
}) {
  const [maisN, setMaisN] = useState(0);

  const atual = calcularComissao(entrada);
  const { simulado, delta } = simularMaisVendas(entrada, maisN);
  const proximo = proximoDegrau(entrada);

  return (
    <Card className="border-interlig-ceu/40">
      <CardHeader className="pb-2">
        <CardTitle>Simulador de comissão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Comissão acumulada no mês</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(atual.total)}</p>
            <p className="text-xs text-muted-foreground">
              {formatarNumero(atual.vendasComissionaveis)} venda(s) ·{" "}
              {atual.atingimentoPct.toFixed(0)}% da meta
              {atual.estornos > 0 && ` · ${atual.estornos} estornada(s)`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Se eu vender mais…</p>
            <div className="mt-1 flex items-center gap-2">
              {[1, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaisN(maisN === n ? 0 : n)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium",
                    maisN === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-interlig-ceu"
                  )}
                >
                  +{n}
                </button>
              ))}
            </div>
            {maisN > 0 && (
              <p className="mt-1.5 text-sm">
                <span className="font-semibold tabular-nums">{formatarMoeda(simulado.total)}</span>{" "}
                <span
                  className={cn(
                    "text-xs font-medium",
                    delta > 0 ? "text-farol-verde" : "text-muted-foreground"
                  )}
                >
                  (+{formatarMoeda(delta)})
                </span>
              </p>
            )}
          </div>
        </div>

        {proximo && (
          <div className="rounded-md border border-farol-amarelo/50 bg-farol-amarelo/10 px-3 py-2 text-sm">
            🎯 Faltam <strong>{proximo.faltamVendas} venda(s)</strong> para o degrau de{" "}
            {proximo.degrau.atingimento_min}% — sua comissão passa a{" "}
            <strong>{formatarMoeda(proximo.totalLa)}</strong>
            {proximo.degrau.bonus_fixo ? (
              <> (inclui bônus de {formatarMoeda(proximo.degrau.bonus_fixo)})</>
            ) : null}
          </div>
        )}
        {!proximo && atual.degrau && (
          <div className="rounded-md border border-farol-verde/50 bg-farol-verde/10 px-3 py-2 text-sm">
            🏆 Você está no degrau máximo ({atual.degrau.atingimento_min}%+) — cada venda vale{" "}
            {atual.degrau.tipo === "valor_por_venda"
              ? formatarMoeda(atual.degrau.valor)
              : `${atual.degrau.valor}% da mensalidade`}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {atual.gatilhos.length > 0 && (
            <p>Extras ativos: {atual.gatilhos.map((g) => `${g.descricao} (+${formatarMoeda(g.adicional)})`).join(" · ")}</p>
          )}
          <p className="mt-0.5">
            Estimativa em andamento — o valor oficial sai no fechamento do mês pelo gestor.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
