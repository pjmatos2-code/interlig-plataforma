"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarCheck2, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Evolução de vendas do Dashboard (redesenho 03/10/2026, modelo do gestor):
 * número em cima de cada barra, dia embaixo de todas, eixo com grade, meta
 * tracejada com etiqueta, mês inteiro (dias que faltam ficam vazios),
 * domingo esmaecido, hoje destacado, detalhe ao passar o mouse/tocar e
 * rodapé com melhor/pior período, média e períodos na meta. Os totais do mês
 * já estão nos cartões do Dashboard — aqui não se repetem.
 */

export type PontoDia = { dia: string; vendas: number };

type Visao = "diario" | "semanal" | "mensal";

type Barra = {
  chave: string;
  rotulo: string; // embaixo da barra
  titulo: string; // no detalhe
  valor: number | null; // null = período que ainda não chegou
  destaque: boolean; // hoje / semana / mês corrente
  esmaecido: boolean; // domingo
};
type BarraComValor = Barra & { valor: number };

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const num = (v: number, casas = 0) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** passo "redondo" do eixo (1, 2, 5 × 10ⁿ) para ~4 linhas de grade */
function passoEixo(max: number): number {
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  const n = bruto / pot;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pot;
}

export function EvolucaoVendas({
  serie,
  metaMensal,
  diasUteisMes,
}: {
  /** vendas por dia (últimos ~6 meses, ordenado) */
  serie: PontoDia[];
  /** meta total (soma das metas) do mês corrente */
  metaMensal: number;
  diasUteisMes: number;
}) {
  const [visao, setVisao] = useState<Visao>("diario");
  const [sel, setSel] = useState<number | null>(null);
  const hoje = serie[serie.length - 1]?.dia ?? isoDia(new Date());
  const mesAtual = hoje.slice(0, 7);
  const metaDiaria = diasUteisMes > 0 && metaMensal > 0 ? metaMensal / diasUteisMes : null;

  const dados = useMemo(() => {
    const porDia = new Map(serie.map((p) => [p.dia, p.vendas]));

    if (visao === "diario") {
      const [a, m] = mesAtual.split("-").map(Number);
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const barras: Barra[] = Array.from({ length: ultimo }, (_, i) => {
        const d = new Date(Date.UTC(a, m - 1, i + 1));
        const dia = isoDia(d);
        return {
          chave: dia,
          rotulo: String(i + 1).padStart(2, "0"),
          titulo: `${String(i + 1).padStart(2, "0")} de ${MES_CURTO[m - 1]} (${DIA_SEMANA[d.getUTCDay()]})`,
          valor: dia > hoje ? null : porDia.get(dia) ?? 0,
          destaque: dia === hoje,
          esmaecido: d.getUTCDay() === 0,
        };
      });
      // estatísticas: dias trabalhados (seg–sáb) que já chegaram
      const trabalhados = barras.filter((b) => b.valor !== null && !b.esmaecido);
      return {
        titulo: "Vendas diárias",
        subtitulo: `${MES_CURTO[m - 1]}/${a} · desempenho de cada dia em relação à meta diária`,
        barras,
        meta: metaDiaria,
        rotuloMeta: metaDiaria ? `Meta ${num(metaDiaria, 1)}/dia` : "",
        unidade: "dia",
        base: trabalhados,
        // hoje ainda está em andamento: não concorre a "pior dia"
        baseMinimo: trabalhados.filter((b) => !b.destaque),
        larguraMin: 22,
      };
    }

    if (visao === "semanal") {
      const porSemana = new Map<string, number>();
      for (const p of serie) {
        const d = new Date(`${p.dia}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        porSemana.set(isoDia(d), (porSemana.get(isoDia(d)) ?? 0) + p.vendas);
      }
      const semanas = [...porSemana.entries()].sort().slice(-12);
      const atual = semanas[semanas.length - 1]?.[0];
      const barras: Barra[] = semanas.map(([seg, v]) => ({
        chave: seg,
        rotulo: `${seg.slice(8, 10)}/${seg.slice(5, 7)}`,
        titulo: `semana de ${seg.slice(8, 10)} de ${MES_CURTO[Number(seg.slice(5, 7)) - 1]}`,
        valor: v,
        destaque: seg === atual,
        esmaecido: false,
      }));
      const meta = metaDiaria ? metaDiaria * 6 : null;
      return {
        titulo: "Vendas semanais",
        subtitulo: "últimas 12 semanas (segunda a domingo) · a semana atual ainda está em andamento",
        barras,
        meta,
        rotuloMeta: meta ? `Meta ${num(meta, 0)}/semana` : "",
        unidade: "semana",
        base: barras,
        baseMinimo: barras.filter((b) => !b.destaque),
        larguraMin: 44,
      };
    }

    const porMes = new Map<string, number>();
    for (const p of serie) porMes.set(p.dia.slice(0, 7), (porMes.get(p.dia.slice(0, 7)) ?? 0) + p.vendas);
    const meses = [...porMes.entries()].sort().slice(-6);
    const barras: Barra[] = meses.map(([mm, v]) => ({
      chave: mm,
      rotulo: `${MES_CURTO[Number(mm.slice(5, 7)) - 1]}/${mm.slice(2, 4)}`,
      titulo: `${MES_CURTO[Number(mm.slice(5, 7)) - 1]}/${mm.slice(0, 4)}`,
      valor: v,
      destaque: mm === mesAtual,
      esmaecido: false,
    }));
    return {
      titulo: "Vendas mensais",
      subtitulo: "últimos 6 meses · o mês atual ainda está em andamento",
      barras,
      meta: metaMensal || null,
      rotuloMeta: metaMensal ? `Meta do mês atual: ${num(metaMensal)}` : "",
      unidade: "mês",
      base: barras,
      baseMinimo: barras.filter((b) => !b.destaque),
      larguraMin: 56,
    };
  }, [visao, serie, hoje, mesAtual, metaDiaria, metaMensal]);

  // ---------- escala ----------
  const maiorValor = Math.max(...dados.barras.map((b) => b.valor ?? 0), dados.meta ?? 0, 1) * 1.15;
  const passo = passoEixo(maiorValor);
  const topo = Math.max(passo, Math.ceil(maiorValor / passo) * passo);
  const linhas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const pct = (v: number) => (v / topo) * 100;

  // ---------- destaques do rodapé ----------
  const comValor = dados.base.filter((b): b is BarraComValor => b.valor !== null);
  const minimos = dados.baseMinimo.filter((b): b is BarraComValor => b.valor !== null);
  const melhor = comValor.reduce<BarraComValor | null>((m, b) => (!m || b.valor > m.valor ? b : m), null);
  const pior = minimos.reduce<BarraComValor | null>((m, b) => (!m || b.valor < m.valor ? b : m), null);
  const media = comValor.length ? comValor.reduce((s, b) => s + b.valor, 0) / comValor.length : 0;
  const naMeta = dados.meta ? comValor.filter((b) => b.valor >= dados.meta!).length : null;

  const barraSel = sel !== null ? dados.barras[sel] ?? null : null;
  const trocar = (v: Visao) => {
    setVisao(v);
    setSel(null);
  };

  return (
    <div>
      {/* cabeçalho */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-semibold leading-tight">{dados.titulo}</h3>
            <p className="text-sm text-muted-foreground">{dados.subtitulo}</p>
          </div>
        </div>
        <div className="flex self-start rounded-lg border bg-muted/40 p-0.5 text-sm">
          {([["diario", "Diário"], ["semanal", "Semanal"], ["mensal", "Mensal"]] as const).map(([v, r]) => (
            <button
              key={v}
              type="button"
              onClick={() => trocar(v)}
              aria-pressed={visao === v}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                visao === v ? "bg-interlig-marinho text-white shadow-sm" : "text-muted-foreground hover:bg-background"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* legenda */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Vendas realizadas
        </span>
        {dados.meta !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-slate-400" /> {dados.rotuloMeta}
          </span>
        )}
        {dados.meta !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-emerald-600">00</span> número verde = bateu a meta
          </span>
        )}
        {visao === "diario" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted" /> domingo
          </span>
        )}
      </div>

      {/* gráfico: no celular rola de lado para as barras e os números não espremerem */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex" style={{ minWidth: dados.barras.length * dados.larguraMin + 40 }}>
          {/* eixo Y */}
          <div className="relative mr-2 h-56 w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
            {linhas.map((v) => (
              <span key={v} className="absolute right-0 leading-none" style={{ bottom: `${pct(v)}%`, transform: "translateY(50%)" }}>
                {num(v)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-56" onMouseLeave={() => setSel(null)}>
              {/* grade */}
              {linhas.map((v) => (
                <div key={v} className="absolute inset-x-0 border-t border-border/70" style={{ bottom: `${pct(v)}%` }} />
              ))}
              {/* meta */}
              {dados.meta !== null && dados.meta <= topo && (
                <>
                  <div
                    className="absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-400"
                    style={{ bottom: `${pct(dados.meta)}%` }}
                  />
                  <span
                    className="absolute right-0 z-20 rounded-md border bg-background/95 px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm"
                    style={{ bottom: `calc(${pct(dados.meta)}% + 4px)` }}
                  >
                    {dados.rotuloMeta}
                  </span>
                </>
              )}

              {/* barras */}
              <div className="absolute inset-0 flex items-end gap-[3px]">
                {dados.barras.map((b, i) => {
                  const bateu = dados.meta !== null && b.valor !== null && b.valor >= dados.meta;
                  const ativo = sel === i;
                  return (
                    <button
                      key={b.chave}
                      type="button"
                      onMouseEnter={() => setSel(i)}
                      onFocus={() => setSel(i)}
                      onClick={() => setSel(ativo ? null : i)}
                      aria-label={`${b.titulo}: ${b.valor === null ? "ainda não chegou" : `${b.valor} vendas`}`}
                      className={cn(
                        "relative flex h-full flex-1 flex-col items-center justify-end rounded-t-sm focus:outline-none",
                        b.esmaecido && "bg-muted/50",
                        ativo && "bg-primary/5"
                      )}
                    >
                      {b.valor !== null ? (
                        <>
                          <span
                            className={cn(
                              "mb-0.5 text-[10px] font-semibold tabular-nums leading-none",
                              bateu ? "text-emerald-600" : "text-slate-600",
                              b.destaque && "text-[11px] font-bold"
                            )}
                          >
                            {b.valor}
                          </span>
                          <span
                            className={cn(
                              "w-[72%] max-w-9 rounded-t-[3px] transition-colors",
                              b.destaque ? "bg-interlig-marinho" : ativo ? "bg-blue-500" : "bg-blue-600"
                            )}
                            style={{ height: `${Math.max(b.valor > 0 ? 1.5 : 0, pct(b.valor))}%` }}
                          />
                        </>
                      ) : (
                        <span className="h-1 w-[72%] max-w-9 rounded-full bg-muted" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* detalhe do período */}
              {barraSel && sel !== null && (
                <div
                  className="pointer-events-none absolute top-0 z-30 w-44 rounded-lg border bg-background p-2.5 text-xs shadow-lg"
                  style={{
                    left: `clamp(0px, calc(${((sel + 0.5) / dados.barras.length) * 100}% - 5.5rem), calc(100% - 11rem))`,
                  }}
                >
                  <p className="text-muted-foreground">{barraSel.titulo}</p>
                  {barraSel.valor === null ? (
                    <p className="mt-0.5 font-medium">Ainda não chegou</p>
                  ) : (
                    <>
                      <p className="mt-0.5 text-sm font-semibold">
                        {barraSel.valor} {barraSel.valor === 1 ? "venda" : "vendas"}
                        {barraSel.destaque && <span className="ml-1 font-normal text-muted-foreground">(em andamento)</span>}
                      </p>
                      {dados.meta !== null && dados.meta > 0 && (
                        <p className={cn("mt-0.5 font-medium", barraSel.valor >= dados.meta ? "text-emerald-600" : "text-rose-600")}>
                          {barraSel.valor >= dados.meta ? "▲" : "▼"} {num(Math.abs((barraSel.valor / dados.meta - 1) * 100))}%{" "}
                          {barraSel.valor >= dados.meta ? "acima" : "abaixo"} da meta
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* dia / período embaixo de cada barra */}
            <div className="mt-1.5 flex gap-[3px]">
              {dados.barras.map((b) => (
                <span
                  key={b.chave}
                  className={cn(
                    "flex-1 text-center text-[10px] tabular-nums leading-tight",
                    b.destaque ? "font-bold text-interlig-marinho" : b.valor === null ? "text-muted-foreground/50" : "text-muted-foreground"
                  )}
                >
                  {b.rotulo}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* destaques */}
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        {[
          {
            icone: <TrendingUp className="h-4 w-4" />,
            cor: "bg-emerald-500/10 text-emerald-600",
            rotulo: `Melhor ${dados.unidade}`,
            valor: melhor ? `${melhor.valor} vendas` : "—",
            sub: melhor?.titulo ?? "",
          },
          {
            icone: <TrendingDown className="h-4 w-4" />,
            cor: "bg-rose-500/10 text-rose-600",
            rotulo: `Pior ${dados.unidade}`,
            valor: pior ? `${pior.valor} vendas` : "—",
            sub: pior ? pior.titulo : `nenhum ${dados.unidade} encerrado ainda`,
          },
          {
            icone: <BarChart3 className="h-4 w-4" />,
            cor: "bg-blue-500/10 text-blue-600",
            rotulo: visao === "diario" ? "Média por dia trabalhado" : `Média por ${dados.unidade}`,
            valor: comValor.length ? `${num(media, 1)} vendas` : "—",
            sub: visao === "diario" ? "segunda a sábado até hoje" : `nos ${comValor.length} períodos do gráfico`,
          },
          {
            icone: <CalendarCheck2 className="h-4 w-4" />,
            cor: "bg-amber-500/10 text-amber-600",
            rotulo: visao === "mensal" ? "Acima da meta atual" : visao === "diario" ? "Dias na meta" : "Semanas na meta",
            valor: naMeta === null ? "sem meta" : `${naMeta} de ${comValor.length}`,
            sub: dados.rotuloMeta,
          },
        ].map((c) => (
          <div key={c.rotulo} className="flex items-start gap-2.5 bg-card p-3">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", c.cor)}>{c.icone}</span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{c.rotulo}</p>
              <p className="text-sm font-semibold leading-tight">{c.valor}</p>
              {c.sub && <p className="truncate text-[11px] text-muted-foreground">{c.sub}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
