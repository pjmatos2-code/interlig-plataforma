"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { formatarMoeda } from "@/lib/format";
import type { HistoricoFinanceiro } from "@/lib/comissao/financeiro";

/**
 * Aba Histórico do Financeiro: agentes ativos à esquerda; ao selecionar,
 * gráfico das últimas competências pagas, análise rápida entre os meses e
 * alerta quando a variação foge do padrão (±40%).
 */

const LIMIAR_ALERTA = 40; // % de variação entre meses que acende o alerta

const mesCurto = (iso: string) => {
  const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${m[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
};

export type AgenteAtivo = { id: string; nome: string; foto: string | null };

export function HistoricoTab({
  dados,
  ativos,
}: {
  dados: HistoricoFinanceiro;
  ativos: AgenteAtivo[];
}) {
  const porId = useMemo(() => new Map(dados.agentes.map((a) => [a.vendedorId, a])), [dados.agentes]);
  const lista = useMemo(
    () =>
      [...ativos]
        .map((v) => ({ ...v, hist: porId.get(v.id) ?? null }))
        .sort((a, b) => (b.hist?.total ?? 0) - (a.hist?.total ?? 0) || a.nome.localeCompare(b.nome)),
    [ativos, porId]
  );
  const [selecionado, setSelecionado] = useState<string | null>(
    lista.find((l) => l.hist)?.id ?? lista[0]?.id ?? null
  );
  const sel = lista.find((l) => l.id === selecionado) ?? null;

  const serie = useMemo(() => {
    if (!sel) return [];
    return dados.meses.map((m) => ({
      mes: m,
      valor: sel.hist?.valores[m]?.total ?? null,
      pagoEm: sel.hist?.valores[m]?.pagoEm ?? null,
    }));
  }, [sel, dados.meses]);

  const analise = useMemo(() => {
    const presentes = serie.filter((s) => s.valor !== null) as { mes: string; valor: number; pagoEm: string | null }[];
    if (presentes.length === 0) return null;
    const media = presentes.reduce((s, x) => s + x.valor, 0) / presentes.length;
    const deltas: { de: string; para: string; pct: number | null }[] = [];
    for (let i = 1; i < presentes.length; i++) {
      const a = presentes[i - 1].valor, b = presentes[i].valor;
      deltas.push({
        de: presentes[i - 1].mes,
        para: presentes[i].mes,
        pct: a > 0 ? ((b - a) / a) * 100 : null,
      });
    }
    const alertas = deltas.filter((d) => d.pct !== null && Math.abs(d.pct) >= LIMIAR_ALERTA);
    const faltantes = serie.filter((s) => s.valor === null).map((s) => s.mes);
    return { media, deltas, alertas, faltantes, presentes };
  }, [serie]);

  const max = Math.max(1, ...serie.map((s) => s.valor ?? 0));

  if (dados.meses.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma competência fechada ainda — o histórico começa no primeiro fechamento
          (agosto entra aqui assim que a Administração fechar o mês).
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      {/* agentes ativos */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Agentes ativos</p>
        <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
          {lista.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelecionado(v.id)}
              className={`flex w-full items-center gap-2 rounded-xl border bg-card p-2.5 text-left transition ${
                selecionado === v.id ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
              }`}
            >
              <AvatarAgente nome={v.nome} foto={v.foto} tamanho="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.nome}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {v.hist ? formatarMoeda(v.hist.total) : "—"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* detalhe do agente */}
      {sel && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2.5">
                <AvatarAgente nome={sel.nome} foto={sel.foto} />
                <div>
                  <CardTitle className="text-base">{sel.nome}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    últimas {dados.meses.length} competência(s) fechada(s)
                    {analise ? ` · total ${formatarMoeda(analise.presentes.reduce((s, x) => s + x.valor, 0))}` : ""}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* gráfico de barras dos pagamentos */}
              <div className="flex h-44 items-end justify-around gap-6 border-b pb-1 pt-2">
                {serie.map((s) => (
                  <div key={s.mes} className="flex h-full w-24 flex-col items-center justify-end gap-1">
                    <span className="text-xs font-semibold tabular-nums">
                      {s.valor !== null ? formatarMoeda(s.valor) : "sem fechamento"}
                    </span>
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height: s.valor !== null ? `${Math.max(4, (s.valor / max) * 100)}%` : "4px",
                        backgroundColor: s.valor === null ? "#e2e8f0" : s.pagoEm ? "#059669" : "#2563eb",
                      }}
                      title={s.pagoEm ? `pago em ${s.pagoEm.slice(0, 10)}` : s.valor !== null ? "fechado, pagamento não registrado" : "sem fechamento neste mês"}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-around pt-1">
                {serie.map((s) => (
                  <span key={s.mes} className="w-24 text-center text-xs text-muted-foreground">
                    {mesCurto(s.mes)}
                    {s.pagoEm && <span className="ml-1 text-emerald-700">✓</span>}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#059669]" />pago</span>
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#2563eb]" />fechado sem registro de pagamento</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#e2e8f0]" />sem fechamento</span>
              </p>
            </CardContent>
          </Card>

          {/* análise rápida */}
          {analise && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Análise rápida</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Média do período: <strong className="tabular-nums">{formatarMoeda(analise.media)}</strong>
                </p>
                {analise.deltas.map((d) => (
                  <p key={`${d.de}-${d.para}`} className="text-muted-foreground">
                    {mesCurto(d.de)} → {mesCurto(d.para)}:{" "}
                    {d.pct === null ? (
                      "—"
                    ) : (
                      <strong className={`tabular-nums ${d.pct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {d.pct >= 0 ? "+" : ""}
                        {d.pct.toFixed(1).replace(".", ",")}%
                      </strong>
                    )}
                  </p>
                ))}
                {analise.faltantes.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sem fechamento em: {analise.faltantes.map(mesCurto).join(", ")}.
                  </p>
                )}
                {analise.alertas.length > 0 ? (
                  analise.alertas.map((a) => (
                    <p key={`${a.de}-${a.para}`} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      ⚠ Variação atípica de{" "}
                      <strong className="tabular-nums">
                        {a.pct! >= 0 ? "+" : ""}
                        {a.pct!.toFixed(0)}%
                      </strong>{" "}
                      entre {mesCurto(a.de)} e {mesCurto(a.para)} — vale conferir o demonstrativo
                      dos dois meses antes de pagar (mudança de faixa, débito ou estorno costumam explicar).
                    </p>
                  ))
                ) : (
                  analise.deltas.length > 0 && (
                    <p className="text-xs text-emerald-700">✓ Variação dentro do padrão (abaixo de {LIMIAR_ALERTA}%).</p>
                  )
                )}
              </CardContent>
            </Card>
          )}
          {!sel.hist && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                {sel.nome} ainda não tem competência fechada no período.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
