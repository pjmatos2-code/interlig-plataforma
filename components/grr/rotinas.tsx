import { CheckCircle2, CircleDashed, CircleMinus, CircleSlash, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_STATUS_ROTINA, type RotinaLider, type StatusRotina } from "@/lib/grr/rotinas";

const ICONE: Record<StatusRotina, typeof Clock> = { cumprido: CheckCircle2, parcial: CircleDashed, nao_cumprido: XCircle, no_prazo: Clock, nao_se_aplica: CircleMinus, nao_medido: CircleSlash };
export const COR_ROTINA: Record<StatusRotina, string> = {
  cumprido: "text-green-700",
  parcial: "text-amber-600",
  nao_cumprido: "text-red-700",
  no_prazo: "text-interlig-ceu",
  nao_se_aplica: "text-slate-400",
  nao_medido: "text-slate-400",
};

/** cartão de um líder: placar da semana e cada item da rotina */
export function CartaoRotina({ lider, grande = false }: { lider: RotinaLider; grande?: boolean }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-sm", grande && "p-5")} aria-label={`Rotina de ${lider.nome}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={cn("font-semibold", grande ? "text-xl" : "text-base")}>
          {lider.nome}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{lider.papel === "diretoria" ? "direção e administração" : "coordenação"}</span>
        </h3>
        <p className={cn("font-semibold tabular-nums", grande ? "text-lg" : "text-sm")}>
          {lider.avaliados ? `${lider.cumpridos} de ${lider.avaliados} cumpridos` : "nada a avaliar ainda"}
        </p>
      </div>
      <ul className="divide-y">
        {lider.itens.map((i) => {
          const Icone = ICONE[i.status];
          return (
            <li key={i.chave} className="flex gap-3 py-2">
              <Icone className={cn("mt-0.5 h-5 w-5 shrink-0", COR_ROTINA[i.status])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={cn("font-medium", grande ? "text-base" : "text-sm")}>
                    {i.titulo} <span className="text-xs font-normal text-muted-foreground">· {i.quando}</span>
                  </p>
                  <span className={cn("text-xs font-semibold", COR_ROTINA[i.status])}>{ROTULO_STATUS_ROTINA[i.status]}</span>
                </div>
                <p className={cn("text-muted-foreground", grande ? "text-sm" : "text-xs")}>{i.detalhe}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
