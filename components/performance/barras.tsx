import { cn } from "@/lib/utils";
import { fmtNum, fmtPct } from "./formato";

/**
 * Funil horizontal em HTML: uma série (um tom), comprimento = volume,
 * rótulo fora da barra quando não cabe dentro. Cada etapa mostra o volume,
 * o % do topo e a passagem da etapa anterior — é também a tabela.
 */
export function FunilHorizontal({ etapas }: { etapas: { rotulo: string; valor: number; detalhe?: string }[] }) {
  const topo = etapas[0]?.valor ?? 0;
  return (
    <ol className="space-y-1" aria-label="Funil de vendas">
      <li className="grid grid-cols-[minmax(0,9rem)_minmax(2rem,1fr)_auto_3.25rem] gap-2 text-[11px] text-muted-foreground" aria-hidden>
        <span>Etapa</span>
        <span />
        <span className="text-right">volume · % do total</span>
        <span className="text-right">passou</span>
      </li>
      {etapas.map((e, i) => {
        const frac = topo ? e.valor / topo : 0;
        const passagem = i > 0 && etapas[i - 1].valor ? e.valor / etapas[i - 1].valor : null;
        return (
          <li key={e.rotulo} className="grid grid-cols-[minmax(0,9rem)_minmax(2rem,1fr)_auto_3.25rem] items-center gap-2 text-sm">
            <span className="truncate text-xs text-muted-foreground" title={e.detalhe ?? e.rotulo}>
              {e.rotulo}
            </span>
            <span className="block h-4 min-w-0 rounded-[4px] bg-muted/60">
              <span className="block h-full rounded-[4px] bg-interlig-ceu/85" style={{ width: `${Math.max(frac * 100, e.valor ? 1.5 : 0)}%` }} />
            </span>
            <span className="text-right text-xs tabular-nums">
              <span className="font-semibold text-foreground">{fmtNum(e.valor)}</span>{" "}
              <span className="text-muted-foreground">{i === 0 ? "100%" : fmtPct(frac)}</span>
            </span>
            {/* passagem da etapa anterior, na mesma linha (o funil não fica mais alto que os vizinhos) */}
            <span className="whitespace-nowrap text-right text-[11px] tabular-nums text-muted-foreground" title={passagem !== null ? `${fmtPct(passagem)} passaram da etapa anterior` : undefined}>
              {passagem !== null ? `→ ${fmtPct(passagem)}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** parte-do-todo: barra 100% empilhada (vão de 2 px) + legenda com números */
export function BarraComposicao({ partes, rotuloTotal }: { partes: { rotulo: string; valor: number; cor: string }[]; rotuloTotal?: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join(", ")}>
        {partes
          .filter((p) => p.valor > 0)
          .map((p) => (
            <span key={p.rotulo} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]" style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} title={`${p.rotulo}: ${p.valor}`} />
          ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {partes.map((p) => (
          <li key={p.rotulo} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.cor }} aria-hidden />
              <span className="truncate">{p.rotulo}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{fmtNum(p.valor)}</span> <span className="text-xs text-muted-foreground">{fmtPct(p.valor / total)}</span>
            </span>
          </li>
        ))}
      </ul>
      {rotuloTotal && <p className="mt-2 text-xs text-muted-foreground">{rotuloTotal}: {fmtNum(total)}</p>}
    </div>
  );
}

/** barras horizontais simples (uma série) com rótulo na ponta */
export function BarrasSimples({ itens, formatar = fmtNum, cor = "bg-interlig-ceu/85" }: { itens: { rotulo: string; valor: number; detalhe?: string }[]; formatar?: (n: number) => string; cor?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-1.5">
      {itens.map((i) => (
        <li key={i.rotulo} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-xs text-muted-foreground" title={i.detalhe ?? i.rotulo}>
            {i.rotulo}
          </span>
          <span className="block h-3 min-w-0 rounded-[4px] bg-muted/60">
            <span className={cn("block h-full rounded-[4px]", cor)} style={{ width: `${Math.max((i.valor / max) * 100, i.valor ? 2 : 0)}%` }} />
          </span>
          <span className="w-16 text-right text-xs font-medium tabular-nums">{formatar(i.valor)}</span>
        </li>
      ))}
    </ul>
  );
}
