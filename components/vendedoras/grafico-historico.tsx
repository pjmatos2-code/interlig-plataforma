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
import { formatarNumero } from "@/lib/format";

const AZUL = "#047CDD";
const NEUTRO = "#94a3b8"; // meta é referência, não série de identidade
const GRADE = "#e2e8f0";
const eixo = { fontSize: 11, fill: "#64748b" } as const;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloMes(iso: string) {
  return `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

/** Histórico de meta × realizado dos últimos 6 meses (PRD 3.2). */
export function GraficoHistorico({
  dados,
}: {
  dados: { mes: string; realizado: number; meta: number | null }[];
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -22 }} barGap={2}>
          <CartesianGrid stroke={GRADE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={rotuloMes}
            tick={eixo}
            tickLine={false}
            axisLine={{ stroke: GRADE }}
          />
          <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(4,124,221,0.08)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
                  <p className="mb-0.5 font-medium">{rotuloMes(String(label))}</p>
                  {payload.map((p) => (
                    <p key={String(p.dataKey)} className="text-muted-foreground">
                      {p.dataKey === "realizado" ? "realizado" : "meta"}:{" "}
                      {p.value == null ? "—" : formatarNumero(Number(p.value))}
                    </p>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar dataKey="realizado" fill={AZUL} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="meta" fill={NEUTRO} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: AZUL }} />
          realizado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: NEUTRO }} />
          meta
        </span>
      </div>
    </div>
  );
}
