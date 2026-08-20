import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Stat tile: rótulo + valor + contexto. O número é o protagonista. */
export function CartaoKpi({
  rotulo,
  valor,
  contexto,
  delta,
  tom,
}: {
  rotulo: string;
  valor: string;
  contexto?: string;
  delta?: { texto: string; direcao: "sobe" | "desce" | "neutro" };
  tom?: "verde" | "amarelo" | "vermelho";
}) {
  return (
    <Card
      className={cn(
        tom === "verde" && "border-l-4 border-l-farol-verde",
        tom === "amarelo" && "border-l-4 border-l-farol-amarelo",
        tom === "vermelho" && "border-l-4 border-l-farol-vermelho"
      )}
    >
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{valor}</p>
        <div className="mt-0.5 flex items-baseline gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "font-medium tabular-nums",
                delta.direcao === "sobe" && "text-farol-verde",
                delta.direcao === "desce" && "text-farol-vermelho",
                delta.direcao === "neutro" && "text-muted-foreground"
              )}
            >
              {delta.direcao === "sobe" ? "▲" : delta.direcao === "desce" ? "▼" : "•"}{" "}
              {delta.texto}
            </span>
          )}
          {contexto && <span className="text-muted-foreground">{contexto}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
