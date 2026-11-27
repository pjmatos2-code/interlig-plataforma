"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  limitesDoEixo,
  variacao,
  type BaseDaUnidade,
  type ChaveIndicador,
  type SerieIndicador,
  type Variacao,
} from "@/lib/dashboard/base-unidades";

/**
 * Base das unidades (modelo aprovado em 27/11/2026): uma coluna por unidade e,
 * em cada uma, três gráficos separados e sempre na mesma ordem — Ativos
 * (linha), Cancelamentos no mês (colunas, eixo em zero) e Suspensos (linha).
 * Cada gráfico tem escala própria; números e variações ficam à vista, sem
 * depender do mouse. "Apresentar" amplia uma unidade por vez.
 *
 * Cores: só variáveis do tema (--serie-*, --grafico-* em globals.css e
 * tema-escuro.css) e classes da plataforma. Nada de cor fixa aqui.
 */

export type UnidadeBase = { unidade: string; base: BaseDaUnidade };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
const mesCurto = (mes: string) => nomeMes(mes).slice(0, 3);
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const n0 = (v: number) => v.toLocaleString("pt-BR");

type Tom = "bom" | "atencao" | "neutro";

const INDICADORES: {
  chave: ChaveIndicador;
  titulo: string;
  explicacao: string;
  tipo: "linha" | "colunas";
  cor: string;
  marcador: string;
  tom: (d: Variacao["direcao"]) => Tom;
}[] = [
  {
    chave: "ativos",
    titulo: "Ativos",
    explicacao: "contratos ativos no fechamento do mês",
    tipo: "linha",
    cor: "var(--serie-ativos)",
    marcador: "rounded-full",
    tom: (d) => (d === "subiu" ? "bom" : d === "caiu" ? "atencao" : "neutro"),
  },
  {
    chave: "cancelamentos",
    titulo: "Cancelamentos no mês",
    explicacao: "contratos cancelados dentro do mês",
    tipo: "colunas",
    cor: "var(--serie-cancelados)",
    marcador: "rounded-[2px]",
    tom: (d) => (d === "subiu" ? "atencao" : d === "caiu" ? "bom" : "neutro"),
  },
  {
    // sair de suspenso pode ser reativação ou cancelamento: sem juízo de valor
    chave: "suspensos",
    titulo: "Suspensos",
    explicacao: "contratos suspensos no fechamento do mês",
    tipo: "linha",
    cor: "var(--serie-suspensos)",
    marcador: "rotate-45 rounded-[1px]",
    tom: () => "neutro",
  },
];

const CLASSE_TOM: Record<Tom, string> = {
  bom: "text-emerald-700",
  atencao: "text-rose-700",
  neutro: "text-foreground",
};

function textoVariacao(v: Variacao): string {
  if (v.direcao === "igual") return "sem mudança";
  const sinal = v.absoluta > 0 ? "+" : "−";
  const abs = `${sinal}${n0(Math.abs(v.absoluta))}`;
  if (v.percentual === null) return `${abs} (sem base para percentual)`;
  return `${abs} (${sinal}${(Math.abs(v.percentual) * 100).toFixed(1).replace(".", ",")}%)`;
}
const seta = (d: Variacao["direcao"]) => (d === "subiu" ? "▲" : d === "caiu" ? "▼" : "=");

function Dica({ active, payload, unidadeTexto }: { active?: boolean; payload?: { payload: { mes: string; valor: number; anterior: number | null } }[]; unidadeTexto: string }) {
  const p = active ? payload?.[0]?.payload : null;
  if (!p) return null;
  const v = p.anterior === null ? null : variacao(p.valor, p.anterior);
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">
        {maiuscula(nomeMes(p.mes))} de {p.mes.slice(0, 4)}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">
        {n0(p.valor)} <span className="font-normal text-muted-foreground">{unidadeTexto}</span>
      </p>
      {v && (
        <p className="mt-0.5 tabular-nums text-muted-foreground">
          {seta(v.direcao)} {textoVariacao(v)} vs. mês anterior
        </p>
      )}
    </div>
  );
}

function Grafico({ serie, tipo, cor, grande, unidadeTexto }: { serie: SerieIndicador; tipo: "linha" | "colunas"; cor: string; grande: boolean; unidadeTexto: string }) {
  // o Recharts mede o contêiner no navegador: até lá, um bloco do mesmo tamanho
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const altura = grande ? 300 : 108;
  if (!montado) {
    return <div role="status" aria-label="Carregando gráfico" className="animate-pulse rounded-md bg-muted" style={{ height: altura }} />;
  }

  const dados = serie.pontos.map((p, i) => ({ ...p, rotulo: mesCurto(p.mes), anterior: i > 0 ? serie.pontos[i - 1].valor : null }));
  const ultimo = dados.length - 1;
  const [piso, teto] = limitesDoEixo(dados.map((d) => d.valor), tipo === "colunas");
  const fonte = grande ? 15 : 10;
  const eixo = { fontSize: fonte, fill: "var(--grafico-eixo)" } as const;
  const margem = { top: grande ? 30 : 18, right: grande ? 24 : 12, left: 0, bottom: 0 };

  const rotulo = (props: { x?: number | string; y?: number | string; width?: number | string; value?: number | string; index?: number }) => (
    <text
      x={Number(props.x ?? 0) + Number(props.width ?? 0) / 2}
      y={Number(props.y ?? 0) - (grande ? 14 : 8)}
      textAnchor="middle"
      fontSize={props.index === ultimo ? fonte + 1 : fonte}
      fontWeight={props.index === ultimo ? 700 : 500}
      className="rotulo-tema tabular-nums"
      fill={props.index === ultimo ? "var(--grafico-rotulo)" : "var(--grafico-eixo)"}
    >
      {n0(Number(props.value ?? 0))}
    </text>
  );
  const comuns = (
    <>
      <CartesianGrid stroke="var(--grafico-grade)" vertical={false} />
      <XAxis dataKey="rotulo" tick={eixo} tickLine={false} axisLine={{ stroke: "var(--grafico-grade)" }} interval={0} padding={tipo === "linha" ? { left: grande ? 28 : 16, right: grande ? 28 : 16 } : undefined} />
      <YAxis domain={[piso, teto]} ticks={[piso, teto]} width={grande ? 62 : 36} tick={eixo} tickFormatter={n0} axisLine={false} tickLine={false} />
      <Tooltip content={<Dica unidadeTexto={unidadeTexto} />} cursor={tipo === "linha" ? { stroke: "var(--grafico-eixo)", strokeDasharray: "3 3" } : { fill: "var(--grafico-grade)", opacity: 0.5 }} />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={altura}>
      {tipo === "linha" ? (
        <LineChart data={dados} margin={margem}>
          {comuns}
          <Line
            type="linear"
            dataKey="valor"
            stroke={cor}
            strokeWidth={grande ? 3 : 2}
            isAnimationActive={false}
            activeDot={{ r: grande ? 8 : 5, fill: cor, stroke: "hsl(var(--card))", strokeWidth: 2 }}
            dot={(p: { cx?: number; cy?: number; index?: number }) => (
              <circle
                key={p.index}
                cx={p.cx}
                cy={p.cy}
                r={p.index === ultimo ? (grande ? 7 : 4.5) : grande ? 5 : 3}
                fill={p.index === ultimo ? cor : "hsl(var(--card))"}
                stroke={cor}
                strokeWidth={2}
              />
            )}
          >
            <LabelList dataKey="valor" content={rotulo} />
          </Line>
        </LineChart>
      ) : (
        <BarChart data={dados} margin={margem}>
          {comuns}
          <Bar dataKey="valor" fill={cor} radius={[3, 3, 0, 0]} maxBarSize={grande ? 72 : 26} isAnimationActive={false}>
            <LabelList dataKey="valor" content={rotulo} />
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function Indicador({ config, base, grande }: { config: (typeof INDICADORES)[number]; base: BaseDaUnidade; grande: boolean }) {
  const serie = base.indicadores[config.chave];
  const ultimo = serie.pontos[serie.pontos.length - 1];
  const anterior = serie.pontos[serie.pontos.length - 2];
  const pequeno = grande ? "text-base" : "text-[11px] leading-4";
  const lidoEm = base.lidoEm
    ? new Date(base.lidoEm).toLocaleDateString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit" })
    : null;

  return (
    <div className="min-w-0">
      <p className={cn("flex items-center gap-2 font-medium", grande ? "text-xl" : "text-xs")} title={config.explicacao}>
        <span aria-hidden="true" className={cn("inline-block shrink-0", grande ? "h-3 w-3" : "h-2 w-2", config.marcador)} style={{ backgroundColor: config.cor }} />
        {config.titulo}
      </p>

      {!ultimo ? (
        <p className={cn("mt-2 rounded-md border border-dashed p-3 text-muted-foreground", pequeno)}>
          Sem histórico para esta unidade. Falta a leitura do relatório Crescimento do SGP (Relatórios &gt; Contratos &gt; Crescimento).
        </p>
      ) : (
        <>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className={cn("font-bold tabular-nums leading-tight", grande ? "text-5xl" : "text-xl")}>{n0(ultimo.valor)}</span>
            <span className={cn("text-muted-foreground", pequeno)}>em {nomeMes(ultimo.mes)}</span>
          </p>
          <p className={cn("tabular-nums", pequeno)}>
            {serie.vsAnterior && anterior ? (
              <>
                <span className={cn("font-medium", CLASSE_TOM[config.tom(serie.vsAnterior.direcao)])}>
                  {seta(serie.vsAnterior.direcao)} {textoVariacao(serie.vsAnterior)}
                </span>{" "}
                <span className="text-muted-foreground">vs. {nomeMes(anterior.mes)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Ainda não há mês anterior para comparar</span>
            )}
          </p>

          <div className={grande ? "mt-4" : "mt-1.5"}>
            <Grafico serie={serie} tipo={config.tipo} cor={config.cor} grande={grande} unidadeTexto={config.explicacao} />
          </div>

          {serie.janela && (
            <p className={cn("mt-1.5 tabular-nums text-muted-foreground", pequeno)}>
              {maiuscula(nomeMes(serie.pontos[0].mes))} a {nomeMes(ultimo.mes)}:{" "}
              <span className="font-medium text-foreground">
                {seta(serie.janela.direcao)} {textoVariacao(serie.janela)}
              </span>
            </p>
          )}
          {serie.parcial && (
            <p className={cn("tabular-nums text-muted-foreground", pequeno)}>
              {maiuscula(nomeMes(serie.parcial.mes))} (parcial{lidoEm ? `, lido em ${lidoEm}` : ""}): {n0(serie.parcial.valor)}
            </p>
          )}
          {config.chave === "cancelamentos" && base.emStatusCancelado !== null && (
            <p className={cn("tabular-nums text-muted-foreground", pequeno)}>Total em status cancelado hoje: {n0(base.emStatusCancelado)}</p>
          )}
        </>
      )}
    </div>
  );
}

function Apresentacao({ unidades, indice, mudar, fechar }: { unidades: UnidadeBase[]; indice: number; mudar: (i: number) => void; fechar: () => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  const total = unidades.length;
  const ir = useCallback((passo: number) => mudar((indice + passo + total) % total), [indice, total, mudar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    document.addEventListener("keydown", tecla);
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = rolagem;
    };
  }, [fechar, ir]);
  useEffect(() => {
    raiz.current?.focus();
  }, []);

  const { unidade, base } = unidades[indice];
  const pontos = base.indicadores.ativos.pontos;
  const botao = "inline-flex h-11 items-center justify-center gap-2 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div
      ref={raiz}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Base das unidades: ${unidade}`}
      className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-background p-4 text-foreground outline-none sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground sm:text-base">
            Base das unidades{pontos.length > 1 ? ` · ${nomeMes(pontos[0].mes)} a ${nomeMes(pontos[pontos.length - 1].mes)} de ${pontos[pontos.length - 1].mes.slice(0, 4)}` : ""}
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">{unidade}</h2>
        </div>
        <div className="flex items-center gap-2">
          {total > 1 && (
            <>
              <button type="button" className={botao} onClick={() => ir(-1)} aria-label="Unidade anterior">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm tabular-nums text-muted-foreground">
                {indice + 1} de {total}
              </span>
              <button type="button" className={botao} onClick={() => ir(1)} aria-label="Próxima unidade">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <button type="button" className={botao} onClick={fechar}>
            <X className="h-5 w-5" /> Fechar
          </button>
        </div>
      </div>
      <div className="mt-6 grid flex-1 content-start gap-6 lg:grid-cols-3 lg:gap-8">
        {INDICADORES.map((c) => (
          <div key={c.chave} className="rounded-xl border bg-card p-4 sm:p-6">
            <Indicador config={c} base={base} grande />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BaseUnidades({ unidades }: { unidades: UnidadeBase[] }) {
  const [apresentando, setApresentando] = useState<number | null>(null);
  const fechar = useCallback(() => setApresentando(null), []);
  const pontos = unidades[0]?.base.indicadores.ativos.pontos ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Base das unidades, últimos 6 meses</CardTitle>
        <p className="text-xs text-muted-foreground">
          Fonte: SGP (Relatórios &gt; Contratos &gt; Crescimento) · residencial + corporativo
          {pontos.length > 1 ? ` · meses encerrados: ${nomeMes(pontos[0].mes)} a ${nomeMes(pontos[pontos.length - 1].mes)} de ${pontos[pontos.length - 1].mes.slice(0, 4)}` : ""}
        </p>
      </CardHeader>
      <CardContent className={cn("grid gap-4", unidades.length > 1 && "lg:grid-cols-3")}>
        {unidades.map(({ unidade, base }, i) => (
          <section key={unidade} aria-label={unidade} className="min-w-0 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-sm font-semibold">{unidade}</h4>
              <button
                type="button"
                onClick={() => setApresentando(i)}
                title="Ampliar esta unidade para apresentação"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Apresentar
              </button>
            </div>
            {/* celular: empilhado · tablet: três lado a lado · desktop (3 unidades): empilhado em cada coluna */}
            <div className={cn("mt-3 grid gap-x-4 gap-y-5 sm:grid-cols-3", unidades.length > 1 && "lg:grid-cols-1")}>
              {INDICADORES.map((c) => (
                <Indicador key={c.chave} config={c} base={base} grande={false} />
              ))}
            </div>
          </section>
        ))}
      </CardContent>
      {apresentando !== null && unidades[apresentando] && (
        <Apresentacao unidades={unidades} indice={apresentando} mudar={setApresentando} fechar={fechar} />
      )}
    </Card>
  );
}
