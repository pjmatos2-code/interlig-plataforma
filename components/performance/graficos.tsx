"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Gráficos da Performance Comercial — especificação da skill dataviz:
 *  - paleta categórica de referência, slots fixos (validada em 24/10/2026:
 *    3 slots PASS em todas as checagens; aqua abaixo de 3:1 → legenda com
 *    números + tabela, regra de alívio);
 *  - linhas 2 px, barras ≤ 24 px com ponta arredondada de 4 px e base reta,
 *    vão de 2 px entre barras; grade hairline sólida e recessiva;
 *  - um eixo só (receita em R$ nunca divide eixo com contagens);
 *  - tooltip com cruz nas linhas; toda série também na tabela.
 */
export const COR = { leads: "#2a78d6", vendas: "#eb6834", ativacoes: "#1baf7a", contexto: "#94a3b8" };
const GRADE = "#e2e8f0";
const TEXTO = "#64748b";
const eixo = { fontSize: 11, fill: TEXTO } as const;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Caixa({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">{children}</div>;
}

function Legenda({ itens }: { itens: { cor: string; rotulo: string; valor?: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: i.cor }} aria-hidden />
          <span>{i.rotulo}</span>
          {i.valor && <span className="font-medium text-foreground">{i.valor}</span>}
        </li>
      ))}
    </ul>
  );
}

export function GraficoEvolucao({ dados }: { dados: { dia: string; leads: number; vendas: number; ativacoes: number }[] }) {
  const soma = (k: "leads" | "vendas" | "ativacoes") => dados.reduce((s, d) => s + d[k], 0);
  const series = [
    { k: "leads" as const, rotulo: "Leads recebidos", cor: COR.leads },
    { k: "vendas" as const, rotulo: "Vendas", cor: COR.vendas },
    { k: "ativacoes" as const, rotulo: "Ativações", cor: COR.ativacoes },
  ];
  return (
    <div>
      <Legenda itens={series.map((s) => ({ cor: s.cor, rotulo: s.rotulo, valor: soma(s.k).toLocaleString("pt-BR") }))} />
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="dia" tickFormatter={ddmm} tick={eixo} tickLine={false} axisLine={{ stroke: GRADE }} minTickGap={24} interval="preserveStartEnd" />
          <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: TEXTO, strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Caixa>
                  <p className="mb-1 font-medium">{ddmm(String(label))}</p>
                  {series.map((s) => {
                    const p = payload.find((x) => x.dataKey === s.k);
                    return (
                      <p key={s.k} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block h-0.5 w-3" style={{ background: s.cor }} />
                        {s.rotulo}: <span className="font-medium text-foreground">{Number(p?.value ?? 0)}</span>
                      </p>
                    );
                  })}
                </Caixa>
              ) : null
            }
          />
          {series.map((s) => (
            <Line key={s.k} type="monotone" dataKey={s.k} stroke={s.cor} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver tabela</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Dia</th>
                {series.map((s) => (
                  <th key={s.k} className="py-1 text-right font-medium">{s.rotulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.dia} className="border-t">
                  <td className="py-1">{ddmm(d.dia)}</td>
                  {series.map((s) => (
                    <td key={s.k} className="py-1 text-right">{d[s.k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** atividade por hora do dia: demanda dos clientes × respostas da equipe */
export function GraficoHoras({ dados }: { dados: { hora: number; clientes: number; equipe: number }[] }) {
  const series = [
    { k: "equipe" as const, rotulo: "Mensagens da equipe (humanas)", cor: COR.leads },
    { k: "clientes" as const, rotulo: "Mensagens de clientes", cor: COR.vendas },
  ];
  return (
    <div>
      <Legenda itens={series.map((s) => ({ cor: s.cor, rotulo: s.rotulo, valor: dados.reduce((x, d) => x + d[s.k], 0).toLocaleString("pt-BR") }))} />
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2} barCategoryGap="18%">
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="hora" tickFormatter={(h) => `${h}h`} tick={eixo} tickLine={false} axisLine={{ stroke: GRADE }} interval={1} />
          <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(42,120,214,0.06)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Caixa>
                  <p className="mb-1 font-medium">{label}h–{Number(label) + 1}h</p>
                  {series.map((s) => (
                    <p key={s.k} className="text-muted-foreground">
                      {s.rotulo}: <span className="font-medium text-foreground">{Number(payload.find((x) => x.dataKey === s.k)?.value ?? 0)}</span>
                    </p>
                  ))}
                </Caixa>
              ) : null
            }
          />
          {series.map((s) => (
            <Bar key={s.k} dataKey={s.k} fill={s.cor} maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** evolução de um score com a média do time como contexto (ênfase) */
export function GraficoEvolucaoScore({ dados, rotulo }: { dados: { dia: string; valor: number | null; media: number | null }[]; rotulo: string }) {
  return (
    <div>
      <Legenda itens={[{ cor: COR.leads, rotulo }, { cor: COR.contexto, rotulo: "Média do time" }]} />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis dataKey="dia" tickFormatter={ddmm} tick={eixo} tickLine={false} axisLine={{ stroke: GRADE }} minTickGap={24} />
          <YAxis domain={[0, 100]} tick={eixo} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: TEXTO, strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Caixa>
                  <p className="mb-1 font-medium">{ddmm(String(label))}</p>
                  <p className="text-muted-foreground">{rotulo}: <span className="font-medium text-foreground">{payload.find((p) => p.dataKey === "valor")?.value ?? "N/D"}</span></p>
                  <p className="text-muted-foreground">Média do time: <span className="font-medium text-foreground">{payload.find((p) => p.dataKey === "media")?.value ?? "N/D"}</span></p>
                </Caixa>
              ) : null
            }
          />
          <Line type="monotone" dataKey="media" stroke={COR.contexto} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="valor" stroke={COR.leads} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
