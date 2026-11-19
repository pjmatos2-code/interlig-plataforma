import Link from "next/link";
import { cn } from "@/lib/utils";
import { AREAS_GRR } from "@/lib/grr/catalogo";

/** Áreas do GRR: só o Resumo executivo está ativo na Etapa 1; as demais mostram a etapa em que entram. */
export function AreasGrr({ ativa, parametros }: { ativa: string; parametros: string }) {
  return (
    <nav aria-label="Áreas do GRR" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
      {AREAS_GRR.map((a) =>
        a.href ? (
          <Link
            key={a.chave}
            href={`${a.href}${parametros}`}
            aria-current={a.chave === ativa ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
              a.chave === ativa ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:border-interlig-ceu"
            )}
          >
            {a.rotulo}
          </Link>
        ) : (
          <span key={a.chave} aria-disabled="true" className="shrink-0 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground">
            {a.rotulo} <span className="text-xs">· etapa {a.etapa}</span>
          </span>
        )
      )}
    </nav>
  );
}
