import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { textoAtingimento, type GrupoDaTabela } from "@/lib/grr/painel";
import { Evolucao } from "./destaque";
import { ICONE_DO_GRUPO, ROTULO_STATUS, SELO_STATUS } from "./icones";

/**
 * Indicadores do período: os oito grupos do GRR Comercial, cada um com as
 * suas métricas em linhas próprias (nenhum grupo vira um número só). No
 * celular cada linha vira um bloco; no computador, colunas alinhadas.
 */
const COLUNAS = "md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-center md:gap-3";

export function TabelaIndicadores({ grupos, parametros }: { grupos: GrupoDaTabela[]; parametros: string }) {
  return (
    <div className="text-sm">
      <div className={cn("hidden border-b pb-2 text-xs font-medium text-muted-foreground", COLUNAS)}>
        <span>Indicador</span>
        <span className="text-right">Resultado</span>
        <span className="text-right">Meta</span>
        <span className="text-right">Atingimento</span>
        <span className="text-right">Variação</span>
        <span className="text-center">Situação</span>
        <span className="w-16" />
      </div>
      {grupos.map((g) => {
        const Icone = ICONE_DO_GRUPO[g.grupo];
        const href = `/grr/${g.grupo}${parametros}`;
        return (
          <section key={g.grupo} className="border-b last:border-b-0" aria-label={g.titulo}>
            <div className="flex items-center gap-2 pb-1 pt-3">
              <Icone className="h-4 w-4 shrink-0 text-interlig-azul" aria-hidden />
              <h3 className="flex-1 font-semibold">{g.titulo}</h3>
              {g.etapa === 1 && (
                <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-medium text-interlig-azul hover:underline">
                  Ver detalhes <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </div>
            {g.etapa !== 1 ? (
              <p className="pb-3 pl-6 text-xs text-muted-foreground">Sem dados: previsto na Etapa {g.etapa}. {g.regra}</p>
            ) : (
              <ul className="pb-2">
                {g.linhas.map((c) => (
                  <li key={c.chave} className={cn("rounded-md py-1.5 pl-6 hover:bg-muted/50", COLUNAS)}>
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{c.rotulo}</p>
                      {c.contexto && <p className="line-clamp-1 text-xs text-muted-foreground md:line-clamp-1">{c.contexto}</p>}
                    </div>
                    {/* celular: resultado, meta e situação numa linha */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:hidden">
                      <span className="text-base font-semibold tabular-nums">{c.valor}</span>
                      {c.meta && <span className="text-muted-foreground">{c.meta}</span>}
                      {c.atingimento != null && <span className="font-medium tabular-nums">{textoAtingimento(c.atingimento)} da meta</span>}
                      <Evolucao evolucao={c.evolucao} curta />
                      <span className={cn("rounded-full border px-2 py-0.5 font-medium", SELO_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
                    </div>
                    <span className="hidden text-right font-semibold tabular-nums md:block">{c.valor}</span>
                    <span className="hidden text-right tabular-nums text-muted-foreground md:block">{c.meta ? c.meta.replace(/^meta /, "") : "—"}</span>
                    <span className="hidden text-right font-medium tabular-nums md:block">{textoAtingimento(c.atingimento)}</span>
                    <span className="hidden text-right text-xs md:block">
                      <Evolucao evolucao={c.evolucao} curta />
                    </span>
                    <span className="hidden justify-center md:flex">
                      <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", SELO_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
                    </span>
                    <span className="hidden w-16 md:block" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
