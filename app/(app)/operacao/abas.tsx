import Link from "next/link";
import { CalendarDays, Columns3, LayoutList, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { chave: "geral", href: "/operacao", rotulo: "Visão Geral", Icone: LayoutList },
  { chave: "quadro", href: "/operacao/quadro", rotulo: "Quadro de Ocorrências", Icone: Columns3 },
  { chave: "calendario", href: "/operacao/calendario", rotulo: "Calendário de Agendamentos", Icone: CalendarDays },
  { chave: "deixados", href: "/operacao/deixados", rotulo: "Deixados para Trás", Icone: UserX },
] as const;

/** Abas da Operação Técnica (redesign, 25/11/2026). */
export function AbasOperacao({ ativa }: { ativa: (typeof ABAS)[number]["chave"] }) {
  return (
    <nav aria-label="Visões da Operação Técnica" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {ABAS.map(({ chave, href, rotulo, Icone }) => (
        <Link
          key={chave}
          href={href}
          aria-current={ativa === chave ? "page" : undefined}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu",
            ativa === chave ? "border-interlig-azul bg-interlig-azul text-white shadow-sm" : "bg-card hover:border-interlig-ceu"
          )}
        >
          <Icone className="h-4 w-4" aria-hidden /> {rotulo}
        </Link>
      ))}
    </nav>
  );
}
