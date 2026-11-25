"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNIDADES_OPERACAO, type FiltrosOperacao, type Ordem } from "@/lib/operacao/painel";
import { DIAS_QUADRO, PERIODOS, diaSantarem, intervaloPeriodo, type BaseData, type Coluna, type Periodo, type TipoServico } from "@/lib/operacao/regras";

export const TIPOS_CAMPO: TipoServico[] = ["instalacao", "mudanca", "suporte"];
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export type EstadoFiltros = {
  unidade: string;
  tipos: TipoServico[];
  status: Coluna | "todos";
  responsavel: string;
  soCorporativo: boolean;
  busca: string;
  periodo: Periodo;
  base: BaseData;
  escolhido: { de: string; ate: string };
  vista: "quadro" | "lista";
  ordem: Ordem;
};

/**
 * Filtros da Operação, lembrados durante a navegação entre as abas (só nesta
 * aba do navegador). Abre em "Este mês" para todos (decisão de 23/11/2026).
 */
export function useFiltros(agora: number, setor: "operacao" | "infraestrutura") {
  const hoje = diaSantarem(agora)!;
  const minimo = diaSantarem(agora - DIAS_QUADRO * 86_400_000)!;
  const tipos = useMemo<TipoServico[]>(() => (setor === "infraestrutura" ? ["infraestrutura"] : TIPOS_CAMPO), [setor]);
  const [e, setE] = useState<EstadoFiltros>({ unidade: "todas", tipos, status: "todos", responsavel: "todos", soCorporativo: false, busca: "", periodo: "mes", base: "abertura", escolhido: { de: minimo, ate: hoje }, vista: "quadro", ordem: "padrao" });
  const chave = `interlig-${setor}-filtros`;
  const [lido, setLido] = useState(false);
  useEffect(() => {
    try {
      const g = JSON.parse(sessionStorage.getItem(chave) ?? "null") as Partial<EstadoFiltros> | null;
      if (g && typeof g === "object") {
        const ts = (Array.isArray(g.tipos) ? g.tipos : []).filter((t) => tipos.includes(t));
        setE((x) => ({ ...x, ...g, tipos: ts.length ? ts : tipos, periodo: PERIODOS.some((p) => p.chave === g.periodo) ? g.periodo! : x.periodo, escolhido: g.escolhido?.de ? g.escolhido : x.escolhido }));
      }
    } catch {
      /* sem armazenamento: segue com o padrão */
    }
    setLido(true);
  }, [chave, tipos]);
  useEffect(() => {
    if (!lido) return; // só grava depois de ler o que já estava guardado
    try {
      sessionStorage.setItem(chave, JSON.stringify(e));
    } catch {
      /* idem */
    }
  }, [chave, e, lido]);
  const intervalo = intervaloPeriodo(e.periodo, hoje, e.escolhido);
  const { de, ate } = intervalo;
  const f = useMemo<FiltrosOperacao>(
    () => ({ unidade: e.unidade, tipos: e.tipos, status: e.status, responsavel: e.responsavel, soCorporativo: e.soCorporativo, busca: e.busca, base: e.base, intervalo: { de, ate }, janelaInteira: e.periodo === "30d" }),
    [e, de, ate]
  );
  const mudar = (x: Partial<EstadoFiltros>) => setE((y) => ({ ...y, ...x }));
  const limpar = () => mudar({ tipos, status: "todos", responsavel: "todos", soCorporativo: false, busca: "" });
  return { e, f, mudar, limpar, hoje, minimo, tipos };
}

export function SeletorUnidade({ valor, mudar }: { valor: string; mudar: (u: string) => void }) {
  return (
    <label className="relative inline-flex h-11 items-center rounded-xl border bg-card text-sm font-medium focus-within:ring-2 focus-within:ring-interlig-ceu">
      <span className="sr-only">Unidade</span>
      <MapPin className="pointer-events-none absolute left-3 h-4 w-4" aria-hidden />
      <select value={valor} onChange={(ev) => mudar(ev.target.value)} className="h-full w-full cursor-pointer appearance-none rounded-xl bg-transparent pl-9 pr-9 outline-none">
        <option value="todas">Todas as unidades</option>
        {UNIDADES_OPERACAO.map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4" aria-hidden />
    </label>
  );
}

export function SeletorPeriodo({ e, f, mudar, minimo }: { e: EstadoFiltros; f: FiltrosOperacao; mudar: (x: Partial<EstadoFiltros>) => void; minimo: string }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: MouseEvent) => !caixa.current?.contains(ev.target as Node) && setAberto(false);
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  const { de, ate } = f.intervalo;
  return (
    <div ref={caixa} className="relative">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="inline-flex h-11 w-full items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium hover:border-interlig-ceu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu">
        <CalendarDays className="h-4 w-4" aria-hidden />
        <span className="flex-1 text-left tabular-nums">{de === ate ? `${diaMes(de)}/${de.slice(0, 4)}` : `${diaMes(de)} a ${diaMes(ate)}/${ate.slice(0, 4)}`}</span>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border bg-card p-4 shadow-lg 2xl:left-auto 2xl:right-0">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.chave} type="button" onClick={() => { mudar({ periodo: p.chave }); if (p.chave !== "personalizado") setAberto(false); }} aria-pressed={e.periodo === p.chave} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", e.periodo === p.chave ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:bg-muted")}>
                {p.rotulo}
              </button>
            ))}
          </div>
          {e.periodo === "personalizado" && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <input aria-label="De" type="date" value={e.escolhido.de} min={e.base === "abertura" ? minimo : undefined} onChange={(ev) => mudar({ escolhido: { ...e.escolhido, de: ev.target.value } })} className="h-9 rounded-md border bg-background px-2" />
              até
              <input aria-label="Até" type="date" value={e.escolhido.ate} min={e.base === "abertura" ? minimo : undefined} onChange={(ev) => mudar({ escolhido: { ...e.escolhido, ate: ev.target.value } })} className="h-9 rounded-md border bg-background px-2" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Contar pela data de</span>
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Data usada no período">
              {(["abertura", "agendamento"] as BaseData[]).map((b) => (
                <button key={b} type="button" onClick={() => mudar({ base: b })} aria-pressed={e.base === b} className={cn("rounded px-2.5 py-1 font-medium", e.base === b ? "bg-interlig-azul text-white" : "text-muted-foreground hover:bg-muted")}>
                  {b}
                </button>
              ))}
            </div>
          </div>
          {e.base === "abertura" && de < minimo && <p className="text-xs text-muted-foreground">O módulo guarda só os últimos {DIAS_QUADRO} dias: antes de {diaMes(minimo)} não aparece nada.</p>}
          {e.base === "agendamento" && <p className="text-xs text-muted-foreground">Por agendamento, só entram ocorrências com OS agendada.</p>}
        </div>
      )}
    </div>
  );
}

export function Seletor({ rotulo, valor, opcoes, mudar, className }: { rotulo: string; valor: string; opcoes: { valor: string; rotulo: string }[]; mudar: (v: string) => void; className?: string }) {
  return (
    <label className={cn("relative inline-flex h-10 min-w-0 items-center rounded-lg border bg-card text-sm focus-within:ring-2 focus-within:ring-interlig-ceu", valor !== opcoes[0]?.valor && "border-interlig-azul bg-interlig-azul/5", className)}>
      <span className="shrink-0 pl-3 font-medium">{rotulo}:</span>
      <select aria-label={rotulo} value={valor} onChange={(ev) => mudar(ev.target.value)} className="h-full w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg bg-transparent pl-1.5 pr-8 outline-none">
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
    </label>
  );
}
