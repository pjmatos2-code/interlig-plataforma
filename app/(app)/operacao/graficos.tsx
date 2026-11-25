"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, MapPin } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { PRAZO_VALIDAR_H, esperaDesde, type FilaValidar, type PontoEvolucao } from "@/lib/operacao/painel";
import { ROTULO_TIPO, tempoDesde, type TipoServico } from "@/lib/operacao/regras";

/* cores das séries: azul (estoque aberto), verde (encerradas) e laranja queimado (falta validar) */
export const COR_SERIE = { abertas: "#1D5FD1", encerradas: "#15803d", validar: "#c2410c" } as const;
const COR_TIPO_GRAFICO: Record<TipoServico, string> = { instalacao: "#1D5FD1", mudanca: "#8b5cf6", suporte: "#d97706", infraestrutura: "#0f766e" };
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const n0 = (v: number) => v.toLocaleString("pt-BR");

export function Painel({ titulo, children, className, nota }: { titulo: string; children: React.ReactNode; className?: string; nota?: React.ReactNode }) {
  return (
    <section aria-label={titulo} className={cn("flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm", className)}>
      <h2 className="text-base font-semibold tracking-tight text-interlig-marinho">{titulo}</h2>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function RoscaTipos({ dados, selecionado, aoClicar }: { dados: { tipo: TipoServico; n: number; pct: number }[]; selecionado: TipoServico | null; aoClicar: (t: TipoServico) => void }) {
  const total = dados.reduce((s, d) => s + d.n, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let ac = 0;
  const segs = dados.filter((d) => d.n > 0).map((d) => {
    const tam = (d.n / Math.max(1, total)) * c;
    const s = { ...d, ini: ac, tam };
    ac += tam;
    return s;
  });
  if (!total) return <p className="py-8 text-center text-sm text-muted-foreground">Nada em aberto neste recorte.</p>;
  return (
    <div className="flex flex-1 flex-wrap items-center justify-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={dados.map((d) => `${ROTULO_TIPO[d.tipo]}: ${d.n}`).join(", ")}>
          {segs.map((s) => (
            <circle key={s.tipo} cx="50" cy="50" r={r} fill="none" strokeWidth="16" stroke={COR_TIPO_GRAFICO[s.tipo]} strokeDasharray={`${Math.max(0, s.tam - (segs.length > 1 ? 1.5 : 0))} ${c}`} strokeDashoffset={-s.ini}>
              <title>{`${ROTULO_TIPO[s.tipo]}: ${s.n} (${Math.round(s.pct * 100)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className="text-2xl font-bold tabular-nums">{n0(total)}</span>
          <span className="text-xs text-muted-foreground">em aberto</span>
        </div>
      </div>
      <ul className="min-w-[11rem] flex-1 space-y-1 text-sm">
        {dados.map((d) => (
          <li key={d.tipo}>
            <button type="button" onClick={() => aoClicar(d.tipo)} aria-pressed={selecionado === d.tipo} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-muted", selecionado === d.tipo && "bg-interlig-azul/10")}>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COR_TIPO_GRAFICO[d.tipo] }} aria-hidden />
              <span className="min-w-0 flex-1">{ROTULO_TIPO[d.tipo]}</span>
              <span className="tabular-nums text-muted-foreground">{Math.round(d.pct * 100)}%</span>
              <b className="w-8 text-right tabular-nums">{n0(d.n)}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dica({ active, payload }: { active?: boolean; payload?: { payload: PontoEvolucao }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{diaMes(p.dia)}, fim do dia</p>
      <p>Em aberto: <b className="tabular-nums">{n0(p.abertas)}</b></p>
      <p>Falta validar: <b className="tabular-nums">{n0(p.validar)}</b></p>
      <p>Encerradas no período: <b className="tabular-nums">{n0(p.encerradas)}</b></p>
    </div>
  );
}

const SERIES = [
  { chave: "abertas", rotulo: "Em aberto", tipo: "estoque no dia" },
  { chave: "encerradas", rotulo: "Encerradas", tipo: "acumulado no período" },
  { chave: "validar", rotulo: "Falta validar", tipo: "estoque no dia" },
] as const;

export function GraficoEvolucao({ pontos, semData }: { pontos: PontoEvolucao[]; semData: number }) {
  const ultimo = pontos[pontos.length - 1];
  if (!ultimo) return <p className="py-8 text-center text-sm text-muted-foreground">Sem dias no período escolhido.</p>;
  return (
    <>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SERIES.map((s) => (
          <li key={s.chave} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_SERIE[s.chave] }} aria-hidden />
            <b className="font-semibold">{s.rotulo}</b> <span className="text-muted-foreground">({s.tipo})</span>
          </li>
        ))}
      </ul>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
        <div className="h-52 w-full min-w-0 sm:w-auto sm:flex-1" role="img" aria-label={`Evolução: hoje ${ultimo.abertas} em aberto, ${ultimo.validar} falta validar e ${ultimo.encerradas} encerradas no período`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pontos} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="dia" tickFormatter={diaMes} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} minTickGap={22} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <Tooltip content={<Dica />} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
              {SERIES.map((s) => (
                <Line key={s.chave} type="monotone" dataKey={s.chave} stroke={COR_SERIE[s.chave]} strokeWidth={2} dot={pontos.length <= 12 ? { r: 3 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-2 sm:w-28 sm:grid-cols-1">
          {[
            ["Encerradas", ultimo.encerradas, "bg-farol-verde/10", COR_SERIE.encerradas],
            ["Em aberto", ultimo.abertas, "bg-interlig-ceu/10", COR_SERIE.abertas],
            ["Falta validar", ultimo.validar, "bg-orange-50", COR_SERIE.validar],
          ].map(([t, v, bg, cor]) => (
            <div key={String(t)} className={cn("rounded-xl px-2 py-1.5 text-center", String(bg))}>
              <dd className="text-lg font-bold tabular-nums" style={{ color: String(cor) }}>{n0(Number(v))}</dd>
              <dt className="text-[11px] text-slate-700">{t}</dt>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Só as ocorrências do período escolhido, por isso as linhas partem de perto de zero. Refeito pelas datas do SGP: a espera começa no check-in do técnico (sem check-in, na baixa da OS).
        {semData > 0 && ` ${n0(semData)} encerradas sem data no SGP ficam fora.`}
      </p>
    </>
  );
}

export function BarrasUnidades({ dados, selecionada, aoClicar }: { dados: { unidade: string; n: number }[]; selecionada: string; aoClicar: (u: string) => void }) {
  const max = Math.max(1, ...dados.map((d) => d.n));
  return (
    <ul className="space-y-1">
      {dados.map((d) => (
        <li key={d.unidade}>
          <button type="button" onClick={() => aoClicar(d.unidade)} aria-pressed={selecionada === d.unidade} className={cn("w-full rounded-lg px-2 py-2 text-left hover:bg-muted", selecionada === d.unidade && "bg-interlig-azul/10")}>
            <span className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-interlig-ceu" aria-hidden />
              <span className="flex-1">{d.unidade}</span>
              <b className="tabular-nums">{n0(d.n)}</b>
            </span>
            <span className="mt-1 block h-3 rounded bg-muted">
              <span className="block h-full rounded bg-interlig-azul" style={{ width: `${(d.n / max) * 100}%` }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** bloco de atenção: só fica em destaque forte quando há pendência acima do prazo */
export function AtencaoValidar({ fila, movimento, antes, agora, aoAbrir, aoAbrirUnidade, aoVerAntes }: { fila: FilaValidar; movimento: { entraram: number; sairam: number }; antes: number; agora: number; aoAbrir: () => void; aoAbrirUnidade: (u: string) => void; aoVerAntes: () => void }) {
  const atraso = fila.acimaDoPrazo > 0;
  const saldo = movimento.entraram - movimento.sairam;
  return (
    <section aria-label="Serviço feito, aguardando validação" className={cn("order-first flex min-w-0 flex-col rounded-2xl border p-4 shadow-sm md:col-span-2 2xl:order-none 2xl:col-span-1", atraso ? "border-orange-300 bg-orange-50" : "bg-card")}>
      <h2 className={cn("flex items-start gap-2 text-base font-semibold leading-snug tracking-tight", atraso ? "text-orange-900" : "text-interlig-marinho")}>
        {atraso ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-farol-verde" aria-hidden />}
        Serviço feito, aguardando validação
      </h2>
      <p className={cn("mt-2 text-4xl font-bold tabular-nums", atraso && "text-orange-700")}>{n0(fila.total)}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        <li><b className="tabular-nums">{n0(fila.osEncerrada)}</b> com a OS encerrada, falta a ocorrência</li>
        <li><b className="tabular-nums">{n0(fila.osAberta)}</b> com a OS ainda sem baixa</li>
        <li className={cn(atraso && "font-semibold text-orange-800")}><span className="tabular-nums">{n0(fila.acimaDoPrazo)}</span> há mais de {PRAZO_VALIDAR_H} h</li>
        {fila.maisAntiga && <li>Mais antiga há <b>{tempoDesde(esperaDesde(fila.maisAntiga), agora)}</b></li>}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Últimos 7 dias: {n0(movimento.entraram)} entraram e {n0(movimento.sairam)} saíram ({saldo > 0 ? `fila cresceu ${n0(saldo)}` : saldo < 0 ? `fila caiu ${n0(-saldo)}` : "fila estável"}).
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {fila.unidades.map((u) => (
          <button key={u.unidade} type="button" onClick={() => aoAbrirUnidade(u.unidade)} className="rounded-full border bg-background px-2.5 py-1 text-xs hover:border-interlig-ceu">
            {u.unidade} <b className="tabular-nums">{n0(u.n)}</b>
          </button>
        ))}
      </div>
      {antes > 0 && (
        <button type="button" onClick={aoVerAntes} className="mt-2 rounded-lg border border-orange-300 bg-background px-3 py-2 text-left text-xs text-orange-900 hover:bg-orange-100">
          <b className="tabular-nums">+{n0(antes)}</b> abertas antes do período, fora destes números. <u>Ver últimos 30 dias</u>
        </button>
      )}
      <button type="button" onClick={aoAbrir} className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90">
        Ver pendências <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}
