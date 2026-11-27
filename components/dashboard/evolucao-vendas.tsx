"use client";

import { useMemo, useState } from "react";
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
  inicio,
  fim,
  hoje,
}: {
  /** vendas por dia, contínua, terminando em `fim` (cobre ao menos 6 meses) */
  serie: PontoDia[];
  /** meta total do mês do início do período */
  metaMensal: number;
  diasUteisMes: number;
  /** período escolhido no Dashboard (o gráfico acompanha o filtro) */
  inicio: string;
  fim: string;
  /** hoje em Santarém — dias depois dele ficam vazios */
  hoje: string;
}) {
  const [visao, setVisao] = useState<Visao>("diario");
  const [sel, setSel] = useState<number | null>(null);
  const mesAtual = hoje.slice(0, 7);
  const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const metaDiaria = diasUteisMes > 0 && metaMensal > 0 ? metaMensal / diasUteisMes : null;

  const dados = useMemo(() => {
    const porDia = new Map(serie.map((p) => [p.dia, p.vendas]));

    if (visao === "diario") {
      // período que começa no dia 1 e fica num só mês = mês inteiro (dias que
      // faltam aparecem vazios); qualquer outro = exatamente os dias escolhidos
      // (no máximo os últimos 93, para o gráfico não virar um tapete)
      const mesInteiro = inicio.slice(8, 10) === "01" && inicio.slice(0, 7) === fim.slice(0, 7);
      const [a, m] = inicio.split("-").map(Number);
      const dias: string[] = [];
      if (mesInteiro) {
        const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
        for (let i = 1; i <= ultimo; i++) dias.push(isoDia(new Date(Date.UTC(a, m - 1, i))));
      } else {
        for (let d = new Date(`${inicio}T00:00:00Z`); isoDia(d) <= fim; d.setUTCDate(d.getUTCDate() + 1)) dias.push(isoDia(d));
      }
      const barras: Barra[] = dias.slice(-93).map((dia) => {
        const d = new Date(`${dia}T00:00:00Z`);
        const mm = d.getUTCMonth();
        return {
          chave: dia,
          rotulo: mesInteiro ? dia.slice(8, 10) : dia.slice(8, 10) === "01" || dia === dias[0] ? dataBr(dia) : dia.slice(8, 10),
          titulo: `${dia.slice(8, 10)} de ${MES_CURTO[mm]} (${DIA_SEMANA[d.getUTCDay()]})`,
          valor: dia > hoje ? null : porDia.get(dia) ?? 0,
          destaque: dia === hoje,
          esmaecido: d.getUTCDay() === 0,
        };
      });
      // estatísticas: dias trabalhados (seg–sáb) que já chegaram
      const trabalhados = barras.filter((b) => b.valor !== null && !b.esmaecido);
      return {
        titulo: "Vendas diárias",
        subtitulo: `${mesInteiro ? `${MES_CURTO[m - 1]}/${a}` : `${dataBr(inicio)} a ${dataBr(fim)}`} · desempenho de cada dia em relação à meta diária`,
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
      const segunda = (iso: string) => {
        const d = new Date(`${iso}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        return isoDia(d);
      };
      const todas = [...porSemana.entries()].sort().filter(([seg]) => seg <= segunda(fim));
      const doPeriodo = todas.filter(([seg]) => seg >= segunda(inicio));
      const semanas = (doPeriodo.length >= 12 ? doPeriodo : todas.slice(-12)).slice(-26);
      const atual = segunda(hoje);
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
        subtitulo: `${semanas.length} semanas até ${dataBr(fim)} (segunda a domingo)${semanas.some(([seg]) => seg === atual) ? " · a semana atual ainda está em andamento" : ""}`,
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
    const todosMeses = [...porMes.entries()].sort().filter(([mm]) => mm <= fim.slice(0, 7));
    const mesesPeriodo = todosMeses.filter(([mm]) => mm >= inicio.slice(0, 7));
    const meses = (mesesPeriodo.length >= 6 ? mesesPeriodo : todosMeses.slice(-6)).slice(-12);
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
      subtitulo: `${meses.length} meses até ${MES_CURTO[Number(fim.slice(5, 7)) - 1]}/${fim.slice(0, 4)}${meses.some(([mm]) => mm === mesAtual) ? " · o mês atual ainda está em andamento" : ""}`,
      barras,
      meta: metaMensal || null,
      rotuloMeta: metaMensal ? `Meta de ${MES_CURTO[Number(inicio.slice(5, 7)) - 1]}: ${num(metaMensal)}` : "",
      unidade: "mês",
      base: barras,
      baseMinimo: barras.filter((b) => !b.destaque),
      larguraMin: 56,
    };
  }, [visao, serie, hoje, mesAtual, metaDiaria, metaMensal, inicio, fim]);

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
        <div>
          <h3 className="text-base font-medium leading-6">{dados.titulo}</h3>
          <p className="text-[13px] text-muted-foreground">{dados.subtitulo}</p>
        </div>
        <div className="flex self-start rounded-lg bg-muted p-0.5 text-[13px]">
          {([["diario", "Diário"], ["semanal", "Semanal"], ["mensal", "Mensal"]] as const).map(([v, r]) => (
            <button
              key={v}
              type="button"
              onClick={() => trocar(v)}
              aria-pressed={visao === v}
              className={cn(
                "h-8 rounded-md px-3 transition-colors",
                visao === v ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* legenda */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> {dados.meta !== null ? "Bateu a meta" : "Vendas realizadas"}
        </span>
        {dados.meta !== null && (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Abaixo da meta
          </span>
        )}
        {dados.meta !== null && (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 border-t-2 border-dashed border-slate-400" /> {dados.rotuloMeta}
          </span>
        )}
        {visao === "diario" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted ring-1 ring-border" /> Domingo
          </span>
        )}
      </div>

      {/* gráfico: no celular rola de lado para as barras e os números não espremerem */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex pt-2" style={{ minWidth: dados.barras.length * dados.larguraMin + 44 }}>
          {/* eixo Y */}
          <div className="relative mr-2 h-56 w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {linhas
              .filter((v) => dados.meta === null || Math.abs(pct(v) - pct(dados.meta)) > 6)
              .map((v) => (
                <span key={v} className="absolute right-0 leading-none" style={{ bottom: `${pct(v)}%`, transform: "translateY(50%)" }}>
                  {num(v)}
                </span>
              ))}
            {dados.meta !== null && dados.meta <= topo && (
              <span
                className="absolute right-0 rounded bg-slate-600 px-1 py-0.5 font-semibold leading-none text-white"
                style={{ bottom: `${pct(dados.meta)}%`, transform: "translateY(50%)" }}
                title={dados.rotuloMeta}
              >
                {num(dados.meta, dados.meta < 100 && !Number.isInteger(dados.meta) ? 1 : 0)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-56" onMouseLeave={() => setSel(null)}>
              {/* grade */}
              {linhas.map((v) => (
                <div key={v} className="absolute inset-x-0 border-t border-border/70" style={{ bottom: `${pct(v)}%` }} />
              ))}
              {/* meta */}
              {dados.meta !== null && dados.meta <= topo && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-400"
                  style={{ bottom: `${pct(dados.meta)}%` }}
                />
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
                              "mb-1 font-mono text-[11px] tabular-nums leading-none",
                              bateu || dados.meta === null ? "text-foreground" : "text-muted-foreground",
                              b.destaque && "font-semibold"
                            )}
                          >
                            {b.valor}
                          </span>
                          <span
                            className={cn(
                              "w-[72%] max-w-9 rounded-t-[3px] transition-colors",
                              bateu || dados.meta === null ? "bg-primary" : "bg-slate-300",
                              ativo && "opacity-80"
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
                          {num(Math.abs((barraSel.valor / dados.meta - 1) * 100))}%{" "}
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
                    "flex-1 text-center font-mono text-[11px] tabular-nums leading-4",
                    b.valor === null ? "text-muted-foreground/50" : "text-muted-foreground"
                  )}
                >
                  {b.destaque ? (
                    <span className="rounded bg-primary px-1 py-0.5 font-medium text-primary-foreground">{b.rotulo}</span>
                  ) : (
                    b.rotulo
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* destaques */}
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 lg:grid-cols-4">
        {[
          {
            rotulo: `Melhor ${dados.unidade}`,
            valor: melhor ? `${melhor.valor} ${melhor.valor === 1 ? "venda" : "vendas"}` : "—",
            sub: melhor?.titulo ?? "",
          },
          {
            rotulo: `Pior ${dados.unidade}`,
            valor: pior ? `${pior.valor} ${pior.valor === 1 ? "venda" : "vendas"}` : "—",
            sub: pior ? pior.titulo : `nenhum ${dados.unidade} encerrado ainda`,
          },
          {
            rotulo: visao === "diario" ? "Média por dia trabalhado" : `Média por ${dados.unidade}`,
            valor: comValor.length ? `${num(media, 1)} vendas` : "—",
            sub: visao === "diario" ? "segunda a sábado, até hoje" : `em ${comValor.length} ${visao === "semanal" ? "semanas" : "meses"}`,
          },
          {
            rotulo: visao === "mensal" ? "Meses acima da meta" : visao === "diario" ? "Dias na meta" : "Semanas na meta",
            valor: naMeta === null ? "sem meta" : `${naMeta} de ${comValor.length}`,
            sub: dados.rotuloMeta,
          },
        ].map((c) => (
          <div key={c.rotulo} className="min-w-0">
            <dt className="text-xs leading-4 text-muted-foreground">{c.rotulo}</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">{c.valor}</dd>
            {c.sub && <dd className="truncate text-xs leading-4 text-muted-foreground">{c.sub}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
