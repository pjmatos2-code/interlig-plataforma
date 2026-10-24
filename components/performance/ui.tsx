import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_MOTIVO, type Indicador, type Score } from "@/lib/performance/tipos";
import { faixaNota, fmtIndicador, fmtNum1, variacao } from "./formato";

/** nota 0–100 com cor semântica; sem dado mostra "N/D" com o motivo */
export function NotaScore({ valor, provisorio, tamanho = "md", titulo }: { valor: number | null | undefined; provisorio?: boolean; tamanho?: "sm" | "md" | "lg"; titulo?: string }) {
  const f = faixaNota(valor);
  return (
    <span
      title={titulo ?? (provisorio ? "Provisório: falta dado essencial ou a cobertura é baixa" : undefined)}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold tabular-nums",
        tamanho === "sm" && "min-w-[2.25rem] px-1.5 py-0.5 text-xs",
        tamanho === "md" && "min-w-[2.75rem] px-2 py-0.5 text-sm",
        tamanho === "lg" && "min-w-[3.5rem] px-2.5 py-1 text-lg",
        f === "verde" && "bg-farol-verde/10 text-farol-verde",
        f === "amarelo" && "bg-farol-amarelo/15 text-[hsl(38_92%_33%)]",
        f === "vermelho" && "bg-farol-vermelho/10 text-farol-vermelho",
        f === "nd" && "bg-muted text-muted-foreground"
      )}
    >
      {valor === null || valor === undefined ? "N/D" : fmtNum1(valor)}
      {provisorio && valor !== null && valor !== undefined && <span className="ml-0.5 text-[0.65em] align-super">*</span>}
    </span>
  );
}

export function Variacao({ atual, anterior, tipo = "relativa", menorEhMelhor = false }: { atual: number | null; anterior: number | null; tipo?: "relativa" | "pontos"; menorEhMelhor?: boolean }) {
  const v = variacao(atual, anterior, tipo, menorEhMelhor);
  if (!v) return null;
  const seta = "seta" in v ? v.seta : null;
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        v.direcao === "sobe" && "text-farol-verde",
        v.direcao === "desce" && "text-farol-vermelho",
        v.direcao === "neutro" && "text-muted-foreground"
      )}
    >
      {seta === "sobe" ? "▲ " : seta === "desce" ? "▼ " : ""}
      {v.texto}
    </span>
  );
}

export function BarraProgresso({ fracao, tom }: { fracao: number | null; tom?: "verde" | "amarelo" | "vermelho" | "azul" }) {
  const pct = fracao === null ? 0 : Math.max(0, Math.min(1, fracao)) * 100;
  const cor = tom ?? (fracao === null ? "azul" : fracao >= 1 ? "verde" : fracao >= 0.7 ? "amarelo" : "vermelho");
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn(
          "h-full rounded-full",
          cor === "verde" && "bg-farol-verde",
          cor === "amarelo" && "bg-farol-amarelo",
          cor === "vermelho" && "bg-farol-vermelho",
          cor === "azul" && "bg-interlig-ceu"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** valor do indicador ou o motivo de não estar disponível */
export function ValorIndicador({ ind, mostrarNota }: { ind: Indicador; mostrarNota?: boolean }) {
  if (!ind.disponivel || (ind.valor === null && ind.nota === null)) {
    return (
      <span className="text-xs text-muted-foreground" title={ind.formula}>
        {ROTULO_MOTIVO[ind.motivo ?? "sem_dados"]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">{fmtIndicador(ind)}</span>
      {mostrarNota && ind.nota !== null && <NotaScore valor={ind.nota} tamanho="sm" />}
    </span>
  );
}

/** detalhamento: por que o score deu isso (peso, peso efetivo, nota, pontos) */
export function ComposicaoScore({ score, indicadores, titulo }: { score: Score; indicadores?: Record<string, Indicador>; titulo: string }) {
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">cobertura {Math.round(score.cobertura * 100)}%</span>
          <NotaScore valor={score.valor} provisorio={score.provisorio} />
        </span>
      </summary>
      <div className="border-t px-4 py-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Item</th>
                <th className="py-1.5 pr-2 font-medium">Valor</th>
                <th className="py-1.5 pr-2 text-right font-medium">Peso</th>
                <th className="py-1.5 pr-2 text-right font-medium">Peso efetivo</th>
                <th className="py-1.5 pr-2 text-right font-medium">Nota</th>
                <th className="py-1.5 text-right font-medium">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {score.composicao.map((c) => {
                const ind = indicadores?.[c.chave];
                return (
                  <tr key={c.chave} className="border-t align-top">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{c.rotulo}</span>
                      {ind && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{ind.formula}</p>}
                    </td>
                    <td className="py-2 pr-2">
                      {ind ? <ValorIndicador ind={ind} /> : c.nota === null ? <span className="text-xs text-muted-foreground">{ROTULO_MOTIVO[c.motivo ?? "sem_dados"]}</span> : null}
                      {ind && ind.numerador !== undefined && ind.denominador !== undefined && ind.denominador !== null && ind.disponivel && ind.unidade === "pct" && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {ind.numerador} de {ind.denominador}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{c.peso}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{c.pesoEfetivo ? `${fmtNum1(c.pesoEfetivo)}%` : "—"}</td>
                    <td className="py-2 pr-2 text-right">{c.nota === null ? <span className="text-xs text-muted-foreground">N/D</span> : <NotaScore valor={c.nota} tamanho="sm" />}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{c.nota === null ? "—" : fmtNum1(c.contribuicao)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Itens sem dado não valem zero: o peso deles é redistribuído entre os itens disponíveis (coluna &quot;peso efetivo&quot;).
          {score.provisorio && " Score provisório: falta um componente essencial ou a cobertura está abaixo de 40%."}
        </p>
      </div>
    </details>
  );
}

export function Painel({ titulo, acao, children, className, descricao }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode; className?: string; descricao?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** aviso de comparação contaminada por lacuna de coleta */
export function AvisoComparacao({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="mb-3 flex items-start gap-2 rounded-lg border border-farol-amarelo/40 bg-farol-amarelo/10 px-3 py-2 text-xs text-[hsl(38_92%_28%)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">Atenção na comparação: </span>
        {texto}
      </span>
    </p>
  );
}
