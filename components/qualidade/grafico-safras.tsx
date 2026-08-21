"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AZUL = "#047CDD";
const GRADE = "#e2e8f0";
const eixo = { fontSize: 11, fill: "#64748b" } as const;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const rotuloMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

/** Colunas de taxa (%) por safra — churn precoce ou inadimplência. */
export function GraficoSafras({
  dados,
  rotuloCasos,
}: {
  dados: { safra: string; taxa: number | null; base: number; casos: number }[];
  rotuloCasos: string;
}) {
  const linhas = dados.map((d) => ({
    safra: d.safra,
    pct: d.taxa === null ? 0 : +(d.taxa * 100).toFixed(1),
    base: d.base,
    casos: d.casos,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={linhas} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid stroke={GRADE} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="safra"
          tickFormatter={rotuloMes}
          tick={eixo}
          tickLine={false}
          axisLine={{ stroke: GRADE }}
        />
        <YAxis
          tick={eixo}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          cursor={{ fill: "rgba(4,124,221,0.08)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
                <p className="font-medium">safra {rotuloMes(String(label))}</p>
                <p className="text-muted-foreground">
                  {(payload[0].payload as { pct: number }).pct.toFixed(1).replace(".", ",")}% ·{" "}
                  {(payload[0].payload as { casos: number }).casos} {rotuloCasos} em{" "}
                  {(payload[0].payload as { base: number }).base}
                </p>
              </div>
            ) : null
          }
        />
        <Bar dataKey="pct" fill={AZUL} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
