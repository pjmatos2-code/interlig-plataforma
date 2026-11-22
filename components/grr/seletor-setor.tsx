import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { usuarioAtual } from "@/lib/auth";
import { setoresDoPerfil, type SetorGrr } from "@/lib/grr/setores";
import { cn } from "@/lib/utils";

/**
 * Faixa do setor no topo das telas do GRR: mostra em que setor a pessoa está
 * e troca de setor. Só aparece para quem tem mais de um setor.
 */
export async function SeletorSetor({ atual }: { atual: SetorGrr["chave"] }) {
  const usuario = await usuarioAtual();
  const setores = usuario ? setoresDoPerfil(usuario.perfil) : [];
  if (setores.length < 2) return null;
  return (
    <nav aria-label="Setor do GRR" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
      <Link href="/grr/setores" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-interlig-azul">
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Setor
      </Link>
      <div className="flex flex-wrap gap-1.5">
        {setores.map((s) => (
          <Link
            key={s.chave}
            href={s.href}
            aria-current={s.chave === atual ? "page" : undefined}
            className={cn("rounded-full px-3 py-1 text-sm font-semibold", s.chave === atual ? "bg-interlig-azul text-white" : "text-interlig-azul hover:bg-interlig-azul/10")}
          >
            {s.rotulo}
          </Link>
        ))}
      </div>
    </nav>
  );
}
