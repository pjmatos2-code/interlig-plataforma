import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Wrench } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirUsuario } from "@/lib/auth";
import { setoresDoPerfil } from "@/lib/grr/setores";
import { ajustesDoUsuario } from "@/lib/acessos-dados";

export const dynamic = "force-dynamic";

const ICONE = { comercial: BarChart3, tecnico: Wrench } as const;

/**
 * Entrada do GRR (21/11/2026): a pessoa escolhe o setor antes de ver os
 * números. Quem só tem um setor vai direto para ele.
 */
export default async function SetoresGrrPage() {
  const usuario = await exigirUsuario();
  const setores = setoresDoPerfil(usuario.perfil, await ajustesDoUsuario(usuario.id));
  if (setores.length === 0) redirect("/sem-acesso");
  if (setores.length === 1) redirect(setores[0].href);
  return (
    <div>
      <CabecalhoPagina titulo="GRR, Gestão de Resultados" descricao="Escolha o setor. Cada um tem os seus indicadores, metas, reuniões e conferência." />
      <div className="grid gap-4 md:grid-cols-2">
        {setores.map((s) => {
          const Icone = ICONE[s.chave];
          return (
            <Link
              key={s.chave}
              href={s.href}
              className="group flex flex-col gap-3 rounded-2xl border-2 bg-card p-5 shadow-sm transition hover:border-interlig-ceu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-interlig-azul/10 text-interlig-azul">
                <Icone className="h-6 w-6" aria-hidden />
              </span>
              <span>
                <span className="block text-lg font-semibold">{s.rotulo}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{s.descricao}</span>
              </span>
              <ul className="space-y-1 text-sm">
                {s.conteudo.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-interlig-ceu" aria-hidden /> {c}
                  </li>
                ))}
              </ul>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-interlig-azul">
                Abrir {s.rotulo.toLowerCase()} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Novos setores entram aqui conforme forem implantados.</p>
    </div>
  );
}
