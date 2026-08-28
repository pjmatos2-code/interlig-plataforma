"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { ROTULO_ORIGEM, type CategoriaOrigem } from "@/lib/tipos";

/*
 * Especificação visual (skill dataviz):
 * - barras ≤ 24px, ponta de dado arredondada 4px, base reta
 * - linhas 2px; grade hairline sólida e recessiva; texto em tons de texto
 * - paletas validadas por scripts/validate_palette.js:
 *   série única (azul-céu oficial), ordinal (rampa azul p/ planos, PASS),
 *   categórica 4 origens (PASS; verde/amarelo < 3:1 → rótulos diretos + tabela)
 */
const AZUL_SERIE = "#047CDD";
const RAMPA_PLANOS = ["#77B5EC", "#4599E4", "#0F7DD6", "#0563BE", "#044CA5", "#043792"];
const CORES_ORIGEM: Record<CategoriaOrigem, string> = {
  venda_externa: "#2a78d6",
  trafego_pago: "#eb6834",
  presencial: "#1baf7a",
  indicacao: "#eda100",
  outro: "#94a3b8",
};

const GRADE = "#e2e8f0";
const TEXTO_MUTED = "#64748b";
const eixo = { fontSize: 11, fill: TEXTO_MUTED } as const;

function ddmm(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function CaixaTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Vendas diárias (barras) + linha da meta diária — PRD 3.1
// ---------------------------------------------------------------------------
export function GraficoVendasDiarias({
  dados,
  metaDiaria,
}: {
  dados: { dia: string; vendas: number }[];
  metaDiaria: number | null;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={dados} margin={{ top: 22, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRADE} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="dia"
          tickFormatter={ddmm}
          tick={eixo}
          tickLine={false}
          axisLine={{ stroke: GRADE }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(4,124,221,0.08)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <CaixaTooltip>
                <p className="font-medium">{ddmm(String(label))}</p>
                <p className="text-muted-foreground">
                  {formatarNumero(payload[0].value as number)} venda(s)
                </p>
              </CaixaTooltip>
            ) : null
          }
        />
        {metaDiaria !== null && (
          <ReferenceLine
            y={metaDiaria}
            stroke={TEXTO_MUTED}
            strokeWidth={1}
            label={{
              value: `meta ${metaDiaria.toFixed(1).replace(".", ",")}/dia útil`,
              position: "insideTopRight",
              fontSize: 10,
              fill: TEXTO_MUTED,
            }}
          />
        )}
        <Bar dataKey="vendas" fill={AZUL_SERIE} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {/* número acima da barra; dia sem venda não recebe rótulo */}
          <LabelList
            dataKey="vendas"
            position="top"
            offset={6}
            formatter={(v: unknown) => (Number(v) > 0 ? formatarNumero(Number(v)) : "")}
            style={{ fontSize: 11, fontWeight: 600, fill: "#0F2A54" }}
          />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontais genéricas (vendas por POP) — série única, rótulo na ponta
// ---------------------------------------------------------------------------
export function GraficoBarrasHorizontais({
  dados,
}: {
  dados: { nome: string; valor: number; extra?: string }[];
}) {
  const altura = Math.max(120, dados.length * 44 + 24);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRADE} strokeWidth={1} horizontal={false} />
        <XAxis type="number" tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="nome"
          tick={{ ...eixo, fill: "#334155" }}
          tickLine={false}
          axisLine={false}
          width={118}
        />
        <Tooltip
          cursor={{ fill: "rgba(4,124,221,0.08)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CaixaTooltip>
                <p className="font-medium">{(payload[0].payload as { nome: string }).nome}</p>
                <p className="text-muted-foreground">
                  {formatarNumero(payload[0].value as number)} venda(s)
                  {(payload[0].payload as { extra?: string }).extra
                    ? ` · ${(payload[0].payload as { extra?: string }).extra}`
                    : ""}
                </p>
              </CaixaTooltip>
            ) : null
          }
        />
        <Bar dataKey="valor" fill={AZUL_SERIE} maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="valor"
            position="right"
            formatter={(v: unknown) => formatarNumero(Number(v))}
            style={{ fontSize: 11, fill: "#334155" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Mix de planos — rampa ordinal (velocidade menor → maior), receita no tooltip
// ---------------------------------------------------------------------------
export function GraficoMixPlanos({
  dados,
}: {
  dados: { plano: string; vendas: number; receita: number }[];
}) {
  const altura = Math.max(120, dados.length * 44 + 24);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRADE} strokeWidth={1} horizontal={false} />
        <XAxis type="number" tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="plano"
          tick={{ ...eixo, fill: "#334155" }}
          tickLine={false}
          axisLine={false}
          width={118}
        />
        <Tooltip
          cursor={{ fill: "rgba(4,124,221,0.08)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CaixaTooltip>
                <p className="font-medium">{(payload[0].payload as { plano: string }).plano}</p>
                <p className="text-muted-foreground">
                  {formatarNumero(payload[0].value as number)} venda(s) ·{" "}
                  {formatarMoeda((payload[0].payload as { receita: number }).receita)}
                </p>
              </CaixaTooltip>
            ) : null
          }
        />
        <Bar dataKey="vendas" maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {dados.map((item, i) => (
            <Cell key={item.plano} fill={RAMPA_PLANOS[Math.min(i, RAMPA_PLANOS.length - 1)]} />
          ))}
          <LabelList
            dataKey="vendas"
            position="right"
            formatter={(v: unknown) => formatarNumero(Number(v))}
            style={{ fontSize: 11, fill: "#334155" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Origem de cadastro — distribuição (barras com rótulo) + evolução semanal
// ---------------------------------------------------------------------------
export function GraficoOrigemDistribuicao({
  dados,
}: {
  dados: { origem: CategoriaOrigem; vendas: number }[];
}) {
  const linhas = dados.map((d) => ({
    nome: ROTULO_ORIGEM[d.origem],
    valor: d.vendas,
    cor: CORES_ORIGEM[d.origem],
  }));
  const altura = Math.max(120, linhas.length * 40 + 24);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={linhas} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRADE} strokeWidth={1} horizontal={false} />
        <XAxis type="number" tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="nome"
          tick={{ ...eixo, fill: "#334155" }}
          tickLine={false}
          axisLine={false}
          width={130}
        />
        <Tooltip
          cursor={{ fill: "rgba(4,124,221,0.08)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CaixaTooltip>
                <p className="font-medium">{(payload[0].payload as { nome: string }).nome}</p>
                <p className="text-muted-foreground">
                  {formatarNumero(payload[0].value as number)} venda(s)
                </p>
              </CaixaTooltip>
            ) : null
          }
        />
        <Bar dataKey="valor" maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {linhas.map((l) => (
            <Cell key={l.nome} fill={l.cor} />
          ))}
          <LabelList
            dataKey="valor"
            position="right"
            formatter={(v: unknown) => formatarNumero(Number(v))}
            style={{ fontSize: 11, fill: "#334155" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficoOrigemSemanal({
  dados,
}: {
  dados: { semana: string; [k: string]: number | string }[];
}) {
  const ordem: CategoriaOrigem[] = [
    "venda_externa",
    "trafego_pago",
    "presencial",
    "indicacao",
    "outro",
  ];
  const presentes = ordem.filter((o) => dados.some((d) => Number(d[o]) > 0));
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid stroke={GRADE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="semana"
            tickFormatter={(s) => `sem. ${ddmm(String(s))}`}
            tick={eixo}
            tickLine={false}
            axisLine={{ stroke: GRADE }}
          />
          <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(4,124,221,0.08)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <CaixaTooltip>
                  <p className="mb-1 font-medium">semana de {ddmm(String(label))}</p>
                  {payload
                    .filter((p) => Number(p.value) > 0)
                    .map((p) => (
                      <p key={String(p.dataKey)} className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ background: CORES_ORIGEM[p.dataKey as CategoriaOrigem] }}
                        />
                        {ROTULO_ORIGEM[p.dataKey as CategoriaOrigem]}:{" "}
                        {formatarNumero(Number(p.value))}
                      </p>
                    ))}
                </CaixaTooltip>
              ) : null
            }
          />
          {presentes.map((o, i) => (
            <Bar
              key={o}
              dataKey={o}
              stackId="origens"
              fill={CORES_ORIGEM[o]}
              maxBarSize={24}
              isAnimationActive={false}
              stroke="#ffffff"
              strokeWidth={2}
              radius={i === presentes.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* legenda fixa: identidade nunca só pela cor */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {presentes.map((o) => (
          <span key={o} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CORES_ORIGEM[o] }} />
            {ROTULO_ORIGEM[o]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projeção de fechamento do mês — realizado (sólido) + projetado (tracejado)
// ---------------------------------------------------------------------------
export function GraficoProjecao({
  dados,
}: {
  dados: { dia: string; realizado: number | null; projetado: number | null; meta: number | null }[];
}) {
  const meta = dados.find((d) => d.meta !== null)?.meta ?? null;
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRADE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="dia"
            tickFormatter={ddmm}
            tick={eixo}
            tickLine={false}
            axisLine={{ stroke: GRADE }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={eixo}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, (maxDados: number) => Math.ceil(Math.max(maxDados, meta ?? 0) * 1.05)]}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <CaixaTooltip>
                  <p className="font-medium">{ddmm(String(label))}</p>
                  {payload
                    .filter((p) => p.value !== null && p.dataKey !== "meta")
                    .map((p) => (
                      <p key={String(p.dataKey)} className="text-muted-foreground">
                        {p.dataKey === "realizado" ? "realizado" : "projetado"}:{" "}
                        {formatarNumero(Math.round(Number(p.value)))}
                      </p>
                    ))}
                </CaixaTooltip>
              ) : null
            }
          />
          {meta !== null && (
            <ReferenceLine
              y={meta}
              stroke={TEXTO_MUTED}
              strokeWidth={1}
              label={{
                value: `meta ${formatarNumero(meta)}`,
                position: "insideTopLeft",
                fontSize: 10,
                fill: TEXTO_MUTED,
              }}
            />
          )}
          <Line
            dataKey="realizado"
            stroke="#043792"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            connectNulls={false}
          />
          <Line
            dataKey="projetado"
            stroke="#047CDD"
            strokeWidth={2}
            isAnimationActive={false}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "#043792" }} />
          realizado
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #047CDD 0 5px, transparent 5px 8px)",
            }}
          />
          projeção (regra 5.6)
        </span>
      </div>
    </div>
  );
}
