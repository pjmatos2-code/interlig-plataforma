import { Wrench } from "lucide-react";

/** Título do módulo, com os controles da página à direita. */
export function CabecalhoOperacao({ descricao, titulo = "Operação Técnica", children }: { descricao: string; titulo?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-interlig-azul text-white sm:inline-flex">
          <Wrench className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-interlig-marinho lg:text-3xl">{titulo}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
        </div>
      </div>
      {children}
    </header>
  );
}
