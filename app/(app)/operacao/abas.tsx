import Link from "next/link";
import { CalendarDays, KanbanSquare, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

/** Abas da Operação Técnica: quadro de ocorrências, calendário e clientes deixados para trás. */
export function AbasOperacao({ ativa }: { ativa: "quadro" | "calendario" | "deixados" }) {
  const aba = (chave: "quadro" | "calendario" | "deixados", href: string, rotulo: string, Icone: typeof KanbanSquare) => (
    <Link
      href={href}
      aria-current={ativa === chave ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
        ativa === chave ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:border-interlig-ceu"
      )}
    >
      <Icone className="h-4 w-4" aria-hidden /> {rotulo}
    </Link>
  );
  return (
    <nav aria-label="Visões da Operação Técnica" className="mb-4 flex flex-wrap gap-2">
      {aba("quadro", "/operacao", "Quadro de ocorrências", KanbanSquare)}
      {aba("calendario", "/operacao/calendario", "Calendário", CalendarDays)}
      {aba("deixados", "/operacao/deixados", "Deixados para trás", UserX)}
    </nav>
  );
}
