import { cn } from "@/lib/utils";
import { Variacao } from "./ui";

/**
 * Stat tile da Performance Comercial: rótulo, número protagonista (algarismos
 * proporcionais — tabular só em colunas), variação contra o período anterior
 * equivalente e uma linha de contexto. Tom semântico só quando significa
 * estado (verde/amarelo/vermelho), sempre com texto junto.
 */
export function Kpi({
  rotulo,
  valor,
  contexto,
  atual,
  anterior,
  tipoVariacao = "relativa",
  menorEhMelhor,
  tom,
  rodape,
  titulo,
}: {
  rotulo: string;
  valor: string;
  contexto?: string;
  atual?: number | null;
  anterior?: number | null;
  tipoVariacao?: "relativa" | "pontos";
  menorEhMelhor?: boolean;
  tom?: "verde" | "amarelo" | "vermelho";
  rodape?: React.ReactNode;
  titulo?: string;
}) {
  return (
    <div
      title={titulo}
      className={cn(
        "min-w-0 rounded-xl border bg-card p-3.5 shadow-sm",
        tom === "verde" && "border-l-4 border-l-farol-verde",
        tom === "amarelo" && "border-l-4 border-l-farol-amarelo",
        tom === "vermelho" && "border-l-4 border-l-farol-vermelho"
      )}
    >
      <p className="line-clamp-2 min-h-[2rem] text-xs font-medium leading-4 text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-1 font-semibold leading-tight tracking-tight", valor.length <= 8 ? "text-2xl" : valor.length <= 12 ? "text-xl" : "text-lg")}>{valor}</p>
      <div className="mt-0.5 flex min-h-[1rem] flex-wrap items-baseline gap-x-2 text-xs">
        {atual !== undefined && anterior !== undefined && <Variacao atual={atual ?? null} anterior={anterior ?? null} tipo={tipoVariacao} menorEhMelhor={menorEhMelhor} />}
        {contexto && <span className="text-muted-foreground">{contexto}</span>}
      </div>
      {rodape && <div className="mt-2">{rodape}</div>}
    </div>
  );
}
