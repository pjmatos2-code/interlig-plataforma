import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import type { ItemEsteira } from "@/lib/esteira/dados";

const LIMITE_VISIVEL = 25;

/** Coluna do kanban da esteira (PRD 3.5): mais antigos primeiro, alerta em vermelho. */
export function ColunaKanban({
  titulo,
  descricaoIdade,
  itens,
  tom,
  mostrarPop,
}: {
  titulo: string;
  descricaoIdade: string;
  itens: ItemEsteira[];
  tom: "amarelo" | "azul" | "verde";
  mostrarPop: boolean;
}) {
  const visiveis = itens.slice(0, LIMITE_VISIVEL);
  const ocultos = itens.length - visiveis.length;
  const emAlerta = itens.filter((i) => i.alerta).length;

  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-muted/30">
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2.5",
          tom === "amarelo" && "bg-farol-amarelo/10",
          tom === "azul" && "bg-interlig-ceu/10",
          tom === "verde" && "bg-farol-verde/10"
        )}
      >
        <div>
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-muted-foreground">{descricaoIdade}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {emAlerta > 0 && <Badge variant="vermelho">{emAlerta} em alerta</Badge>}
          <Badge variant="secondary">{itens.length}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "34rem" }}>
        {visiveis.map((item) => (
          <Card
            key={item.id}
            className={cn(
              "p-2.5 text-sm shadow-none",
              item.alerta && "border-farol-vermelho/60 bg-farol-vermelho/5"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium">{item.cliente}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                  item.alerta
                    ? "bg-farol-vermelho/15 text-farol-vermelho"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {item.idadeDias === 0 ? "hoje" : `${item.idadeDias} d`}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.vendedora}
              {mostrarPop && ` · ${item.pop}`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.plano} · {formatarMoeda(item.valor)}
            </p>
          </Card>
        ))}
        {itens.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nada por aqui 🎉</p>
        )}
        {ocultos > 0 && (
          <p className="px-2 py-1.5 text-center text-xs text-muted-foreground">
            … e mais {ocultos} (os mais antigos aparecem primeiro)
          </p>
        )}
      </div>
    </div>
  );
}
