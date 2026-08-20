"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

const PERIODOS = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "personalizado", rotulo: "Personalizado" },
] as const;

/** Filtro global de período e POP (PRD 3.1) — vive na query string. */
export function FiltrosDashboard({
  pops,
  mostrarPop,
  de,
  ate,
}: {
  pops: { id: string; nome: string }[];
  mostrarPop: boolean;
  de: string;
  ate: string;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  const periodoAtivo = params.get("periodo") ?? "mes";
  const popAtivo = params.get("pop") ?? "";

  function aplicar(mudancas: Record<string, string | null>) {
    const novos = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") novos.delete(chave);
      else novos.set(chave, valor);
    }
    iniciar(() => router.replace(`${caminho}?${novos.toString()}`, { scroll: false }));
  }

  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-center gap-2",
        pendente && "pointer-events-none opacity-60"
      )}
    >
      <div className="flex rounded-md border bg-background p-0.5">
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() =>
              aplicar(
                p.valor === "personalizado"
                  ? { periodo: p.valor, de, ate }
                  : { periodo: p.valor, de: null, ate: null }
              )
            }
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              periodoAtivo === p.valor
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {periodoAtivo === "personalizado" && (
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="date"
            defaultValue={de}
            onChange={(e) => e.target.value && aplicar({ de: e.target.value })}
            className="h-9 rounded-md border bg-background px-2"
            aria-label="Data inicial"
          />
          <span className="text-muted-foreground">até</span>
          <input
            type="date"
            defaultValue={ate}
            onChange={(e) => e.target.value && aplicar({ ate: e.target.value })}
            className="h-9 rounded-md border bg-background px-2"
            aria-label="Data final"
          />
        </div>
      )}

      {mostrarPop && (
        <select
          value={popAtivo}
          onChange={(e) => aplicar({ pop: e.target.value || null })}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Filtrar por POP"
        >
          <option value="">Todas as POPs</option>
          {pops.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
