"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type Aba = { href: string; rotulo: string };

/** abas do módulo; mantém período e filtros ao trocar de tela */
export function AbasPerformance({ abas }: { abas: Aba[] }) {
  const caminho = usePathname();
  const params = useSearchParams();
  const manter = new URLSearchParams();
  for (const k of ["periodo", "de", "ate", "pop", "setor", "coord"]) {
    const v = params.get(k);
    if (v) manter.set(k, v);
  }
  const qs = manter.toString();
  return (
    <nav aria-label="Telas da Performance Comercial" className="-mx-4 mb-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {abas.map((a) => {
          const ativa = a.href === "/performance" ? caminho === "/performance" : caminho.startsWith(a.href);
          return (
            <li key={a.href}>
              <Link
                href={qs ? `${a.href}?${qs}` : a.href}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  ativa ? "border-interlig-azul text-interlig-azul" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {a.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
