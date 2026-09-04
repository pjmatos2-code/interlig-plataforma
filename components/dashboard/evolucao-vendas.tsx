"use client";

import { useMemo, useState } from "react";

/**
 * Evolução de vendas no modelo aprovado pelo gestor (mock 04/09/2026):
 * barras por dia + meta diária tracejada + média móvel de 7 dias, com as
 * visões Diário (mês corrente), Semanal (12 semanas) e Mensal (6 meses).
 */

export type PontoDia = { dia: string; vendas: number };

const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function Grafico({
  pontos,
  meta,
  rotuloMeta,
  media,
}: {
  pontos: { rotulo: string; valor: number; dica: string }[];
  meta: number | null;
  rotuloMeta: string;
  media: (number | null)[];
}) {
  const max = Math.max(...pontos.map((p) => p.valor), meta ?? 0, 1);
  const alturaPct = (v: number) => Math.max(v > 0 ? 3 : 0, (v / max) * 100);
  // polilinha da média móvel sobre o gráfico (viewBox 0-100 nos dois eixos)
  const linha = media
    .map((v, i) => (v === null ? null : `${((i + 0.5) / pontos.length) * 100},${100 - (v / max) * 100}`))
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className="relative">
        {meta !== null && meta <= max && (
          <div
            className="absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-400"
            style={{ top: `${100 - (meta / max) * 100}%` }}
            title={`${rotuloMeta}: ${meta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`}
          />
        )}
        {linha && (
          <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={linha} fill="none" stroke="#38bdf8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div className="flex h-40 items-end gap-px border-b pb-0">
          {pontos.map((p, i) => (
            <div key={i} className="group relative flex h-full w-full flex-col items-center justify-end" title={p.dica}>
              <div
                className="w-full max-w-6 rounded-t-sm bg-[#2563eb] transition-colors group-hover:bg-interlig-ceu"
                style={{ height: `${alturaPct(p.valor)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-px pt-1">
        {pontos.map((p, i) => (
          <span key={i} className="w-full truncate text-center text-[9px] text-muted-foreground">
            {p.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

function mediaMovel(valores: number[], janela: number): (number | null)[] {
  return valores.map((_, i) => {
    if (i < janela - 1) return null;
    const fatia = valores.slice(i - janela + 1, i + 1);
    return fatia.reduce((s, v) => s + v, 0) / janela;
  });
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
  const [visao, setVisao] = useState<"diario" | "semanal" | "mensal">("diario");
  const hoje = serie[serie.length - 1]?.dia ?? new Date().toISOString().slice(0, 10);
  const mesAtual = hoje.slice(0, 7);
  const metaDiaria = diasUteisMes > 0 ? metaMensal / diasUteisMes : null;

  const dados = useMemo(() => {
    if (visao === "diario") {
      const doMes = serie.filter((p) => p.dia.startsWith(mesAtual));
      const media = mediaMovel(doMes.map((p) => p.vendas), 7);
      return {
        pontos: doMes.map((p, i) => ({
          rotulo: Number(p.dia.slice(8, 10)) % 2 === 1 ? p.dia.slice(8, 10) : "",
          valor: p.vendas,
          dica: `${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} · Vendas: ${p.vendas}${
            metaDiaria ? ` · Meta: ${metaDiaria.toFixed(1).replace(".", ",")}` : ""
          }${media[i] !== null ? ` · Média 7 dias: ${media[i]!.toFixed(1).replace(".", ",")}` : ""}`,
        })),
        meta: metaDiaria,
        rotuloMeta: "meta diária",
        media,
      };
    }
    if (visao === "semanal") {
      const porSemana = new Map<string, number>();
      for (const p of serie) {
        const d = new Date(`${p.dia}T00:00:00Z`);
        const seg = new Date(d);
        seg.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const chave = seg.toISOString().slice(0, 10);
        porSemana.set(chave, (porSemana.get(chave) ?? 0) + p.vendas);
      }
      const semanas = [...porSemana.entries()].sort().slice(-12);
      const media = mediaMovel(semanas.map(([, v]) => v), 4);
      return {
        pontos: semanas.map(([seg, v], i) => ({
          rotulo: `${seg.slice(8, 10)}/${seg.slice(5, 7)}`,
          valor: v,
          dica: `semana de ${seg.slice(8, 10)}/${seg.slice(5, 7)} · Vendas: ${v}${
            media[i] !== null ? ` · Média 4 sem.: ${media[i]!.toFixed(1).replace(".", ",")}` : ""
          }`,
        })),
        meta: metaDiaria ? metaDiaria * 6 : null,
        rotuloMeta: "meta semanal",
        media,
      };
    }
    const porMes = new Map<string, number>();
    for (const p of serie) porMes.set(p.dia.slice(0, 7), (porMes.get(p.dia.slice(0, 7)) ?? 0) + p.vendas);
    const meses = [...porMes.entries()].sort().slice(-6);
    return {
      pontos: meses.map(([m, v]) => ({
        rotulo: `${MES_CURTO[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`,
        valor: v,
        dica: `${MES_CURTO[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)} · Vendas: ${v}`,
      })),
      meta: metaMensal || null,
      rotuloMeta: "meta mensal",
      media: mediaMovel(meses.map(([, v]) => v), 3),
    };
  }, [visao, serie, mesAtual, metaDiaria, metaMensal]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-[#2563eb]" /> Vendas realizadas</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" /> {dados.rotuloMeta}</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-[#38bdf8]" /> média móvel</span>
        </div>
        <div className="flex rounded-md border p-0.5 text-xs">
          {([["diario", "Diário"], ["semanal", "Semanal"], ["mensal", "Mensal"]] as const).map(([v, r]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisao(v)}
              className={`rounded px-2.5 py-1 font-medium ${
                visao === v ? "bg-interlig-marinho text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <Grafico pontos={dados.pontos} meta={dados.meta} rotuloMeta={dados.rotuloMeta} media={dados.media} />
    </div>
  );
}
