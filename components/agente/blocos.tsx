import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

/** Blocos visuais dos painéis das agentes (Meu painel comercial e Atendimento, Fidelidade da base). */

export function Bloco({ titulo, extra, children, className }: { titulo: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export const TONS = {
  azul: "bg-sky-500/10 text-sky-600",
  indigo: "bg-indigo-500/10 text-indigo-600",
  violeta: "bg-violet-500/10 text-violet-600",
  ambar: "bg-amber-500/15 text-amber-600",
  vermelho: "bg-farol-vermelho/10 text-farol-vermelho",
} as const;

export function Kpi({
  icone,
  tom,
  rotulo,
  valor,
  rodape,
  href,
  alerta,
}: {
  icone: ReactNode;
  tom: keyof typeof TONS;
  rotulo: string;
  valor: string;
  rodape: ReactNode;
  href?: string;
  alerta?: boolean;
}) {
  const corpo = (
    <div
      className={cn(
        "flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors",
        href && "hover:border-primary/40",
        alerta && "border-farol-vermelho/40"
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONS[tom])}>{icone}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className={cn("text-3xl font-bold leading-tight tabular-nums", alerta && "text-farol-vermelho")}>{valor}</p>
        <div className="text-xs text-muted-foreground">{rodape}</div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}

export function ItemFoco({ icone, titulo, texto, href, tom }: { icone: ReactNode; titulo: string; texto: string; href?: string; tom: string }) {
  const corpo = (
    <div className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", tom)}>{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{titulo}</p>
        <p className="text-xs text-muted-foreground">{texto}</p>
      </div>
      {href && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

