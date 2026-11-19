"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Evolução das vendas (skill dataviz): uma série, barras finas com ponta
 * arredondada, grade recessiva, rótulo direto só no valor. A semana
 * analisada fica no azul oficial; as anteriores no azul-claro; a semana em
 * andamento fica mais clara e marcada no rótulo. A meta só aparece na semana
 * em que ela é conhecida (meta da semana analisada), como um traço.
 */
const AZUL = "#043792";
const CEU = "#77BAEE";
const GRADE = "#e2e8f0";
const TEXTO = "#64748b";
// a meta precisa se destacar das barras azuis: laranja escuro, contraste ≥ 3:1 no branco
const LARANJA = "#c2410c";

import type { PontoGrafico } from "@/lib/grr/painel";
export type { PontoGrafico };

function Dica({ active, payload }: { active?: boolean; payload?: { payload: PontoGrafico }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">
        Semana {p.rotulo}
        {p.emAndamento ? " · em andamento" : ""}
      </p>
      <p>
        Vendas: <b className="tabular-nums">{p.vendas}</b>
        {p.meta != null ? <span className="text-muted-foreground"> · meta {p.meta}</span> : null}
      </p>
      <p>
        Ativações: <b className="tabular-nums">{p.ativacoes}</b>
      </p>
      <p>
        Conversão do CRM: <b className="tabular-nums">{p.conversao == null ? "—" : `${Math.round(p.conversao * 100)}%`}</b>
      </p>
    </div>
  );
}

/** traço da meta sobre a barra da semana analisada (o gráfico calcula a posição) */
function TracoMeta(props: { cx?: number; cy?: number; value?: number | null }) {
  const { cx, cy, value } = props;
  if (cx == null || cy == null || value == null) return <g />;
  return (
    <g>
      <line x1={cx - 22} x2={cx + 22} y1={cy} y2={cy} stroke={LARANJA} strokeWidth={3} strokeDasharray="5 3" />
      <text x={cx + 25} y={cy + 4} fontSize={11} fontWeight={600} fill={TEXTO}>
        meta {value}
      </text>
    </g>
  );
}

export function GraficoEvolucaoVendas({ dados, altura = 220, grande = false }: { dados: PontoGrafico[]; altura?: number; grande?: boolean }) {
  const maximo = Math.max(1, ...dados.map((d) => Math.max(d.vendas, d.meta ?? 0)));
  const escala = Math.ceil((maximo * 1.15) / 10) * 10;
  const margem = { top: 22, right: 64, bottom: 0, left: -18 };
  return (
    <div style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={margem}>
          <CartesianGrid vertical={false} stroke={GRADE} />
          <XAxis dataKey="rotuloCurto" tick={{ fontSize: grande ? 14 : 11, fill: TEXTO }} tickLine={false} axisLine={{ stroke: GRADE }} interval="preserveStartEnd" minTickGap={6} />
          <YAxis domain={[0, escala]} tick={{ fontSize: grande ? 13 : 11, fill: TEXTO }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<Dica />} cursor={{ fill: "rgba(4,55,146,0.06)" }} />
          <Bar dataKey="vendas" radius={[4, 4, 0, 0]} maxBarSize={grande ? 56 : 40} isAnimationActive={false}>
            {dados.map((d) => (
              <Cell key={d.inicio} fill={d.analisada ? AZUL : CEU} fillOpacity={d.emAndamento ? 0.55 : 1} />
            ))}
            <LabelList dataKey="vendas" position="top" style={{ fontSize: grande ? 15 : 11, fontWeight: 600, fill: "#334155" }} />
          </Bar>
          <Line dataKey="meta" stroke="none" isAnimationActive={false} dot={<TracoMeta />} activeDot={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
