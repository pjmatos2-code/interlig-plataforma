"use client";

import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

type Opcao = { id: string; nome: string };

/** troca parâmetros do endereço (o estado dos filtros vive na URL) */
function useAplicar() {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const aplicar = (mudancas: Record<string, string | null>) => {
    const novos = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") novos.delete(chave);
      else novos.set(chave, valor);
    }
    novos.delete("vivo");
    const texto = novos.toString();
    iniciar(() => router.replace(texto ? `${caminho}?${texto}` : caminho, { scroll: false }));
  };
  return { aplicar, pendente };
}

/** cartão do período: semana analisada, setas e atalhos para a semana atual e a última completa */
export function SeletorSemana({
  semana,
  vizinhas,
}: {
  semana: { rotulo: string; tipo: "atual" | "ultima" | "outra"; emAndamento: boolean };
  vizinhas: { anterior: string | null; proxima: string | null };
}) {
  const { aplicar, pendente } = useAplicar();
  const seta = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground hover:border-interlig-ceu disabled:opacity-40";
  const atalho = (ativo: boolean) =>
    cn("rounded-full px-2.5 py-1 text-xs font-medium", ativo ? "bg-interlig-azul text-white" : "text-interlig-azul hover:bg-interlig-azul/10");
  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm", pendente && "opacity-60")} aria-busy={pendente}>
      <CalendarDays className="hidden h-5 w-5 shrink-0 text-interlig-azul sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tabular-nums">Semana: {semana.rotulo}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <button type="button" className={atalho(semana.tipo === "ultima")} onClick={() => aplicar({ semana: "ultima" })}>
            Última completa
          </button>
          <button type="button" className={atalho(semana.tipo === "atual")} onClick={() => aplicar({ semana: null })}>
            Semana atual{semana.tipo === "atual" && semana.emAndamento ? " · em andamento" : ""}
          </button>
        </div>
      </div>
      <div className="flex gap-1">
        <button type="button" className={seta} disabled={!vizinhas.anterior} aria-label="Semana anterior" onClick={() => aplicar({ semana: vizinhas.anterior })}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={seta} disabled={!vizinhas.proxima} aria-label="Semana seguinte" onClick={() => aplicar({ semana: vizinhas.proxima })}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** unidade, equipe e agente; só aparecem os que o perfil pode trocar */
export function FiltrosRecorte({
  podeFiltrar,
  unidades,
  equipes,
  agentes,
  valores,
  rotuloFixo,
}: {
  podeFiltrar: { unidade: boolean; equipe: boolean; agente: boolean };
  unidades: Opcao[];
  equipes: Opcao[];
  agentes: Opcao[];
  valores: { unidade: string; equipe: string; agente: string };
  /** o recorte travado (coordenação), mostrado quando não há o que filtrar */
  rotuloFixo: string;
}) {
  const { aplicar, pendente } = useAplicar();
  const campos = [
    podeFiltrar.unidade && { rotulo: "Unidade", valor: valores.unidade, todos: "Todas", opcoes: unidades, ao: (v: string) => aplicar({ unidade: v, agente: null }) },
    podeFiltrar.equipe && { rotulo: "Equipe", valor: valores.equipe, todos: "Todas", opcoes: equipes, ao: (v: string) => aplicar({ equipe: v, agente: null }) },
    podeFiltrar.agente && { rotulo: "Agente", valor: valores.agente, todos: "Todos", opcoes: agentes, ao: (v: string) => aplicar({ agente: v }) },
  ].filter(Boolean) as { rotulo: string; valor: string; todos: string; opcoes: Opcao[]; ao: (v: string) => void }[];

  if (!campos.length)
    return (
      <p className="mb-4 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-sm">
        <span className="text-muted-foreground">Recorte:</span> <span className="font-medium">{rotuloFixo}</span>
      </p>
    );
  return (
    <div className={cn("mb-4 grid gap-2 rounded-xl border bg-card p-2.5 shadow-sm sm:grid-cols-3", pendente && "opacity-60")} aria-busy={pendente}>
      {campos.map((c) => (
        <label key={c.rotulo} className="relative block min-w-0 rounded-lg border bg-background px-3 pb-1.5 pt-1 focus-within:border-interlig-ceu">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.rotulo}</span>
          <select className="w-full min-w-0 bg-transparent text-sm font-medium outline-none" value={c.valor} onChange={(e) => c.ao(e.target.value)}>
            <option value="">{c.todos}</option>
            {c.opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
