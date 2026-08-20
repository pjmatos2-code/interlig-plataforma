import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatarData } from "@/lib/format";
import type { CartaoTicket } from "@/lib/crm/dados";

export function CartaoDeTicket({ ticket, mostrarPop }: { ticket: CartaoTicket; mostrarPop: boolean }) {
  const fechado = ticket.etapa === "fechado";
  return (
    <Link
      href={`/crm/${ticket.id}`}
      className={cn(
        "block rounded-lg border bg-card p-2.5 text-sm shadow-none transition-colors hover:border-interlig-ceu",
        ticket.aviso === "avisar" && !fechado && "border-farol-amarelo/70 bg-farol-amarelo/5",
        ticket.aviso === "fechar" && !fechado && "border-farol-vermelho/60 bg-farol-vermelho/5"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium">{ticket.cliente_nome}</p>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {ticket.diasNaEtapa === 0 ? "hoje" : `${ticket.diasNaEtapa} d`}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {ticket.vendedora ?? "Não atribuído"}
        {mostrarPop && ticket.pop && ` · ${ticket.pop}`}
        {" · "}
        {ticket.origem_criacao === "sz_auto" ? "SZ Chat" : "manual"}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {!ticket.vendedora && <Badge variant="amarelo">distribuir</Badge>}
        {fechado && ticket.desfecho === "convertido" && <Badge variant="verde">convertido</Badge>}
        {fechado && ticket.desfecho === "nao_convertido" && (
          <Badge variant="vermelho">
            {ticket.fechado_por === "auto_inatividade" ? "auto · sem resposta" : "não convertido"}
          </Badge>
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
