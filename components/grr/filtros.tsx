"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

type Opcao = { id: string; nome: string };

/** Filtros do GRR (semana, unidade, equipe e agente). O estado vive no endereço da tela. */
export function FiltrosGrr({
  semana,
  vizinhas,
  podeFiltrar,
  unidades,
  equipes,
  agentes,
  valores,
}: {
  semana: { rotulo: string; tipo: "atual" | "ultima" | "outra" };
  vizinhas: { anterior: string | null; proxima: string | null };
  podeFiltrar: { unidade: boolean; equipe: boolean; agente: boolean };
  unidades: Opcao[];
  equipes: Opcao[];
  agentes: Opcao[];
  valores: { unidade: string; equipe: string; agente: string };
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  function aplicar(mudancas: Record<string, string | null>) {
    const novos = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") novos.delete(chave);
      else novos.set(chave, valor);
    }
    const texto = novos.toString();
    iniciar(() => router.replace(texto ? `${caminho}?${texto}` : caminho, { scroll: false }));
  }

  const botao = (ativo: boolean) =>
    cn("h-9 rounded-md border px-3 text-sm font-medium", ativo ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:border-interlig-ceu");
  const seta = "inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-base hover:border-interlig-ceu disabled:opacity-40";
  const seletor = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm sm:w-auto";

  return (
    <div className={cn("mb-4 space-y-3 rounded-xl border bg-card p-3", pendente && "opacity-60")} aria-busy={pendente}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={botao(semana.tipo === "atual")} onClick={() => aplicar({ semana: null })}>
          Semana atual
        </button>
        <button type="button" className={botao(semana.tipo === "ultima")} onClick={() => aplicar({ semana: "ultima" })}>
          Última semana completa
        </button>
        <div className="flex items-center gap-1">
          <button type="button" className={seta} disabled={!vizinhas.anterior} aria-label="Semana anterior" onClick={() => aplicar({ semana: vizinhas.anterior })}>
            ‹
          </button>
          <span className="px-1 text-sm font-medium tabular-nums">{semana.rotulo}</span>
          <button type="button" className={seta} disabled={!vizinhas.proxima} aria-label="Semana seguinte" onClick={() => aplicar({ semana: vizinhas.proxima })}>
            ›
          </button>
        </div>
      </div>
      {(podeFiltrar.unidade || podeFiltrar.equipe || podeFiltrar.agente) && (
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {podeFiltrar.unidade && (
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="w-16 shrink-0 text-muted-foreground sm:w-auto">Unidade</span>
              <select className={seletor} value={valores.unidade} onChange={(e) => aplicar({ unidade: e.target.value, agente: null })}>
                <option value="">Todas</option>
                {unidades.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {podeFiltrar.equipe && (
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="w-16 shrink-0 text-muted-foreground sm:w-auto">Equipe</span>
              <select className={seletor} value={valores.equipe} onChange={(e) => aplicar({ equipe: e.target.value, agente: null })}>
                <option value="">Todas</option>
                {equipes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {podeFiltrar.agente && (
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="w-16 shrink-0 text-muted-foreground sm:w-auto">Agente</span>
              <select className={seletor} value={valores.agente} onChange={(e) => aplicar({ agente: e.target.value })}>
                <option value="">Todos</option>
                {agentes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
