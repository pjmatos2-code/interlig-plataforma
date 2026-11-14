import { ChevronRight, Download } from "lucide-react";
import {
  FAIXAS_FIDELIDADE,
  planosDoEscopo,
  queryLista,
  type FaixaFidelidade,
  type ResumoFidelidade,
} from "@/lib/sgp/fidelidade";
import { cn } from "@/lib/utils";

const num = (v: number) => v.toLocaleString("pt-BR");

/** grupos que não são internet residencial/corporativa ganham cor neutra */
const ESPECIAIS = /Rede neutra|LigChip|Telefonia|Interlig Play|Desativado|não identificado|Lan To Lan/i;

export function GraficoPlanos({
  unidades,
  unidadeSel,
  faixaSel,
  podeTrocarUnidade,
}: {
  unidades: ResumoFidelidade["unidades"];
  unidadeSel: string | null;
  faixaSel: FaixaFidelidade;
  podeTrocarUnidade: boolean;
}) {
  const pop = unidadeSel ? Number(unidadeSel) || null : null;
  const { principais, resto, total } = planosDoEscopo(unidades, pop, faixaSel);
  // cada barra abre a lista de clientes daquele plano (04/11/2026)
  const barras: { rotulo: string; n: number; lista: string }[] = principais.map(([plano, n]) => ({
    rotulo: plano,
    n,
    lista: `/fidelidade/lista?${queryLista({ faixa: faixaSel, pop, plano })}`,
  }));
  if (resto.length) {
    barras.push({
      rotulo: `Outros ${resto.length} planos`,
      n: resto.reduce((t, [, n]) => t + n, 0),
      lista: `/fidelidade/lista?${queryLista({ faixa: faixaSel, pop, outros: true })}`,
    });
  }
  const max = Math.max(1, ...barras.map((b) => b.n));
  const href = (u: string | null, f: string) => {
    const q = new URLSearchParams();
    if (u) q.set("unidade", u);
    if (f !== "sem") q.set("faixa", f);
    const qs = q.toString();
    return `/fidelidade${qs ? `?${qs}` : ""}#planos`;
  };
  const chip = (ativo: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium",
      ativo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
    );
  const rotuloFaixa = FAIXAS_FIDELIDADE.find((f) => f.chave === faixaSel)?.rotulo ?? "";

  return (
    <section id="planos" className="mt-5 scroll-mt-20 rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Planos dos clientes · {rotuloFaixa.toLowerCase()}</h2>
          <p className="text-sm text-muted-foreground">
            {num(total)} contratos ativos por plano (velocidade e residencial × corporativo){unidadeSel ? "" : podeTrocarUnidade ? " · todas as unidades" : ""}
          </p>
          {total > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Clique no número de um plano para ver os clientes.{" "}
              <a
                href={`/api/fidelidade/exportar?${queryLista({ faixa: faixaSel, pop })}`}
                className="inline-flex items-center gap-1 font-medium text-interlig-ceu hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Baixar todos em planilha
              </a>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {podeTrocarUnidade && (
            <div className="flex flex-wrap justify-end gap-1.5">
              <a href={href(null, faixaSel)} className={chip(!unidadeSel)}>Todas</a>
              {unidades.map((u) => (
                <a key={u.pop} href={href(String(u.pop), faixaSel)} className={chip(unidadeSel === String(u.pop))}>{u.nome}</a>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-1.5">
            {FAIXAS_FIDELIDADE.map((f) => (
              <a key={f.chave} href={href(unidadeSel, f.chave)} className={chip(faixaSel === f.chave)}>{f.rotulo}</a>
            ))}
          </div>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contrato nesta seleção.</p>
      ) : (
        <div className="space-y-1">
          {barras.map((b) => {
            const corp = /corporativo/i.test(b.rotulo);
            const especial = ESPECIAIS.test(b.rotulo) || b.rotulo.startsWith("Outros ");
            return (
              <a
                key={b.rotulo}
                href={b.lista}
                title={`Ver ${b.n === 1 ? "o cliente" : `os ${num(b.n)} clientes`} · ${b.rotulo}`}
                className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-0.5 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
              >
                <span className="line-clamp-2 w-28 shrink-0 text-xs leading-tight sm:line-clamp-1 sm:w-44 sm:text-sm sm:leading-normal">{b.rotulo}</span>
                <div className="h-6 min-w-[3rem] flex-1 rounded-md bg-muted/60">
                  <div
                    className={cn("flex h-full items-center rounded-md", corp ? "bg-violet-500" : especial ? "bg-slate-400" : "bg-sky-500")}
                    style={{ width: `${Math.max(1.5, (b.n / max) * 100)}%` }}
                  />
                </div>
                <span className="inline-flex w-12 items-center justify-end gap-0.5 text-sm font-bold tabular-nums text-interlig-azul group-hover:underline sm:w-14 dark:text-interlig-claro">
                  {num(b.n)}
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </span>
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground sm:w-12">{Math.round((b.n / total) * 100)}%</span>
              </a>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> residencial</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> corporativo (corporate, PJ, dedicado)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> outros serviços (rede neutra, LigChip, telefonia, Play)</span>
      </div>
    </section>
  );
}
