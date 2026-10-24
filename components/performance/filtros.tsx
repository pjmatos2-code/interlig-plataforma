"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarDays, Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [
  ["hoje", "Hoje"],
  ["ontem", "Ontem"],
  ["7d", "Últimos 7 dias"],
  ["30d", "Últimos 30 dias"],
  ["mes", "Mês atual"],
  ["mes_anterior", "Mês anterior"],
  ["personalizado", "Personalizado"],
] as const;

type Opcao = { id: string; nome: string };

/**
 * Filtros combináveis da Performance Comercial — vivem na query string, então
 * todas as telas e exportações leem a mesma definição (a autorização é do
 * servidor: aqui só aparecem as opções que o escopo do usuário alcança).
 */
export function FiltrosPerformance({
  de,
  ate,
  rotulo,
  pops,
  setores,
  coordenadores,
  vendedores,
  mostrar = { pop: true, setor: true, coord: true, vendedor: false },
}: {
  de: string;
  ate: string;
  rotulo: string;
  pops: Opcao[];
  setores: Opcao[];
  coordenadores: Opcao[];
  vendedores?: Opcao[];
  mostrar?: { pop?: boolean; setor?: boolean; coord?: boolean; vendedor?: boolean };
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const periodo = params.get("periodo") ?? "mes";
  const [deLocal, setDe] = useState(de);
  const [ateLocal, setAte] = useState(ate);
  useEffect(() => {
    setDe(de);
    setAte(ate);
  }, [de, ate]);

  function aplicar(m: Record<string, string | null>) {
    const n = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(m)) {
      if (!v) n.delete(k);
      else n.set(k, v);
    }
    iniciar(() => router.push(`${caminho}?${n.toString()}`, { scroll: false }));
  }

  const seletor = (nome: string, valor: string, opcoes: Opcao[], todos: string) => (
    <select
      aria-label={todos}
      value={valor}
      onChange={(e) => aplicar({ [nome]: e.target.value || null })}
      className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
    >
      <option value="">{todos}</option>
      {opcoes.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mb-4 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          <select
            aria-label="Período"
            value={periodo}
            onChange={(e) => aplicar({ periodo: e.target.value, de: null, ate: null })}
            className="h-9 rounded-md border bg-background px-2 text-sm font-medium"
          >
            {PRESETS.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {periodo === "personalizado" && (
          <span className="flex flex-wrap items-center gap-1.5">
            <input type="date" aria-label="De" value={deLocal} onChange={(e) => setDe(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
            <span className="text-xs text-muted-foreground">a</span>
            <input type="date" aria-label="Até" value={ateLocal} onChange={(e) => setAte(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
            <button
              type="button"
              disabled={!deLocal || !ateLocal || deLocal > ateLocal}
              onClick={() => aplicar({ periodo: "personalizado", de: deLocal, ate: ateLocal })}
              className="h-9 rounded-md bg-interlig-azul px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Aplicar
            </button>
          </span>
        )}
        {mostrar.pop && pops.length > 1 && seletor("pop", params.get("pop") ?? "", pops, "Todas as unidades")}
        {mostrar.setor && setores.length > 1 && seletor("setor", params.get("setor") ?? "", setores, "Todas as funções")}
        {mostrar.coord && coordenadores.length > 1 && seletor("coord", params.get("coord") ?? "", coordenadores, "Todos os supervisores")}
        {mostrar.vendedor && vendedores && vendedores.length > 1 && seletor("vendedor", params.get("vendedor") ?? "", vendedores, "Todos os vendedores")}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Atualizando" /> : null}
          <span className="hidden sm:inline">{rotulo}</span>
          <button
            type="button"
            onClick={() => iniciar(() => router.refresh())}
            className={cn("rounded-md p-1.5 hover:bg-muted", pendente && "opacity-50")}
            title="Atualizar agora"
            aria-label="Atualizar agora"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground sm:hidden">{rotulo}</p>
    </div>
  );
}
