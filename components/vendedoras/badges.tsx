import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function BadgeTendencia({ valor }: { valor: "sobe" | "desce" | "estavel" }) {
  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        valor === "sobe" && "text-farol-verde",
        valor === "desce" && "text-farol-vermelho",
        valor === "estavel" && "text-muted-foreground"
      )}
      title="Últimos 7 dias vs 7 dias anteriores"
    >
      {valor === "sobe" ? "▲" : valor === "desce" ? "▼" : "—"}
    </span>
  );
}

export function BadgeFarol({ valor }: { valor: "verde" | "amarelo" | "vermelho" | null }) {
  if (!valor) return <span className="text-xs text-muted-foreground">sem meta</span>;
  const rotulo = { verde: "no ritmo", amarelo: "atenção", vermelho: "abaixo" }[valor];
  return <Badge variant={valor}>{rotulo}</Badge>;
}

export const ROTULO_STATUS: Record<string, string> = {
  pendente_assinatura: "Pendente assinatura",
  aguardando_ativacao: "Aguardando ativação",
  ativo: "Ativo",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

export function BadgeStatus({ status }: { status: string }) {
  const variante =
    status === "ativo" ? "verde" : status === "cancelado" ? "vermelho" : "amarelo";
  return <Badge variant={variante}>{ROTULO_STATUS[status] ?? status}</Badge>;
}
