import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatarData } from "@/lib/format";
import type { CartaoTicket } from "@/lib/crm/dados";

/**
 * Card de negociação no padrão que as agentes já conhecem do RD Station:
 * um selo de STATUS (Nova / Em andamento / Vendida / Perdida) e o aviso de
 * "esfriando há X dias" quando o atendimento fica parado.
 */
export function CartaoDeTicket({ ticket, mostrarPop }: { ticket: CartaoTicket; mostrarPop: boolean }) {
  const fechado = ticket.etapa === "fechado";
  const status = fechado
    ? ticket.desfecho === "convertido"
      ? { rotulo: "Vendida", cor: "verde" as const }
      : { rotulo: "Perdida", cor: "vermelho" as const }
    : ticket.etapa === "novo"
      ? { rotulo: "Nova", cor: "secondary" as const }
      : { rotulo: "Em andamento", cor: "azul" as const };

  // "esfriando" = parado há 3+ dias sem virar venda nem perda
  const esfriando = !fechado && ticket.diasNaEtapa >= 3;

  return (
    <Link
      href={`/crm/${ticket.id}`}
      className={cn(
        "block rounded-lg border bg-card p-2.5 text-sm shadow-none transition-colors hover:border-interlig-ceu",
        esfriando && "border-farol-amarelo/70 bg-farol-amarelo/5",
        ticket.aviso === "fechar" && !fechado && "border-farol-vermelho/60 bg-farol-vermelho/5"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            status.cor === "verde" && "bg-farol-verde/15 text-farol-verde",
            status.cor === "vermelho" && "bg-farol-vermelho/15 text-farol-vermelho",
            status.cor === "azul" && "bg-interlig-ceu/15 text-interlig-ceu",
            status.cor === "secondary" && "bg-muted text-muted-foreground"
          )}
        >
          ● {status.rotulo}
        </span>
        {esfriando && (
          <span className="rounded-full bg-farol-amarelo/15 px-2 py-0.5 text-xs font-medium text-yellow-700">
            esfriando há {ticket.diasNaEtapa} dias
          </span>
        )}
      </div>

      <p className="min-w-0 truncate font-medium">{ticket.cliente_nome}</p>

      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {ticket.vendedora ?? "Não atribuído"}
        {mostrarPop && ticket.pop && ` · ${ticket.pop}`}
        {" · "}
        {ticket.origem_criacao === "sz_auto" ? "SZ Chat" : "manual"}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {!ticket.vendedora && !fechado && <Badge variant="amarelo">distribuir</Badge>}
        {fechado && ticket.fechado_por === "auto_inatividade" && (
          <Badge variant="outline">auto · sem resposta</Badge>
        )}
        {!fechado && ticket.aviso === "avisar" && (
          <Badge variant="amarelo">fecha sozinho em {ticket.fechaEmDias} d</Badge>
        )}
        {!fechado && ticket.followup_em && (
          <span className="text-xs text-muted-foreground">
            retorno {formatarData(ticket.followup_em.slice(0, 10))}
          </span>
        )}
      </div>
    </Link>
  );
}
