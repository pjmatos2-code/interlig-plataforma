import Link from "next/link";
import { cn } from "@/lib/utils";
import { AREAS_GRR } from "@/lib/grr/catalogo";

/** Áreas do GRR: as que já existem são links; as demais mostram a etapa em que entram. Configuração só aparece para a administração. */
export function AreasGrr({ ativa, parametros, gestor = false }: { ativa: string; parametros: string; gestor?: boolean }) {
  return (
    <nav aria-label="Áreas do GRR" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
      {AREAS_GRR.filter((a) => gestor || !a.soGestor).map((a) =>
        a.href ? (
          <Link
            key={a.chave}
            href={a.soGestor || a.chave === "reunioes" || a.chave === "acoes" || a.chave === "rotinas" ? a.href : `${a.href}${parametros}`}
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
            {a.rotulo} <span className="text-xs">· {a.etapa ? `etapa ${a.etapa}` : "a definir"}</span>
          </span>
        )
      )}
    </nav>
  );
}
