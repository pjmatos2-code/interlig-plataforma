import Link from "next/link";
import { BarChart3, FileDown, Presentation } from "lucide-react";

/** cabeçalho executivo do GRR: título, recorte, período e os atalhos de relatório e apresentação */
export function CabecalhoGrr({
  subtitulo,
  periodo,
  hrefPdf,
  hrefApresentar,
}: {
  subtitulo: string;
  periodo: React.ReactNode;
  hrefPdf: string | null;
  hrefApresentar: string | null;
}) {
  return (
    <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-interlig-azul text-white shadow-sm">
          <BarChart3 className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">GRR · Gestão de Resultados</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        {periodo}
        <div className="flex gap-2">
          {hrefApresentar && (
            <Link href={hrefApresentar} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-interlig-azul px-4 text-sm font-semibold text-white shadow-sm hover:bg-interlig-azul/90 sm:flex-none">
              <Presentation className="h-4 w-4" aria-hidden /> Apresentar
            </Link>
          )}
          {hrefPdf && (
            <a href={hrefPdf} target="_blank" rel="noopener" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium shadow-sm hover:border-interlig-ceu sm:flex-none">
              <FileDown className="h-4 w-4 text-interlig-azul" aria-hidden /> Relatório (PDF)
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
