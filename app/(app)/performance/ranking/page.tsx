import Link from "next/link";
import { Trophy } from "lucide-react";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtNum, fmtPct } from "@/components/performance/formato";
import { AvisoComparacao, BarraProgresso, NotaScore, Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { ordenarRanking, rotuloSetor, type LinhaPerformance } from "@/lib/performance/dados/calcular";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";

export const dynamic = "force-dynamic";

const CRITERIOS = [
  ["ipc", "IPC"],
  ["esforco", "Esforço"],
  ["resultado", "Resultado"],
  ["qualidade", "Qualidade"],
  ["conversao", "Conversão"],
  ["vendas", "Vendas"],
] as const;
type Criterio = (typeof CRITERIOS)[number][0];

function valorCriterio(l: LinhaPerformance, c: Criterio): number | null {
  if (c === "ipc") return l.ipc.valor;
  if (c === "conversao") return l.resultado.indicadores.conversao.disponivel ? l.numeros.conversao : null;
  if (c === "vendas") return l.numeros.vendas;
  return l[c].score.valor;
}

/** posição por critério dentro da função, só entre comparáveis */
function posicoes(linhas: LinhaPerformance[], c: Criterio): Map<string, number> {
  if (c === "ipc" || c === "esforco" || c === "resultado" || c === "qualidade") {
    return new Map(ordenarRanking(linhas.map((l) => ({ ...l })), c).filter((l) => l.posicao !== null).map((l) => [l.vendedor.id, l.posicao!]));
  }
  const mapa = new Map<string, number>();
  const porSetor = new Map<string, LinhaPerformance[]>();
  for (const l of linhas) porSetor.set(l.vendedor.setor ?? "", [...(porSetor.get(l.vendedor.setor ?? "") ?? []), l]);
  for (const g of porSetor.values())
    g.filter((l) => l.flags.comparavel && valorCriterio(l, c) !== null)
      .sort((a, b) => (valorCriterio(b, c) ?? 0) - (valorCriterio(a, c) ?? 0))
      .forEach((l, i) => mapa.set(l.vendedor.id, i + 1));
  return mapa;
}

export default async function RankingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const criterio = (CRITERIOS.find(([k]) => k === searchParams.por)?.[0] ?? "ipc") as Criterio;
  // vendedor vê o ranking da sua função inteira (posições), sem os números das colegas
  const filtrosRanking = ctx.escopo.papel === "vendedor" ? {} : ctx.filtros;
  const escopoRanking = ctx.escopo.papel === "vendedor" ? { ...ctx.escopo, vendedorIds: null } : ctx.escopo;
  const ap = await apurarPerformance(escopoRanking, ctx.periodo, filtrosRanking);
  const proprio = ctx.escopo.vendedorProprio;
  const setorProprio = proprio ? ap.linhas.find((l) => l.vendedor.id === proprio)?.vendedor.setor : null;
  const linhas = ctx.escopo.papel === "vendedor" ? ap.linhas.filter((l) => l.vendedor.setor === setorProprio && l.vendedor.ativo) : ap.linhas;
  const pos = posicoes(linhas, criterio);
  const posAnt = posicoes([...ap.anteriores.values()].filter((l) => linhas.some((x) => x.vendedor.id === l.vendedor.id)), criterio);
  const setores = [...new Set(linhas.map((l) => l.vendedor.setor ?? ""))];
  const mostraValores = (l: LinhaPerformance) => ctx.escopo.verValoresDeColegas || l.vendedor.id === proprio;
  const qs = (m: Record<string, string>) => {
    const n = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(m)) n.set(k, v);
    return `?${n.toString()}`;
  };

  return (
    <div>
      {ctx.escopo.papel !== "vendedor" && (
        <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} />
      )}
      <AvisoComparacao texto={ap.avisoComparacao} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Janela:</span>
        {[
          ["hoje", "Diário"],
          ["7d", "Semanal"],
          ["mes", "Mensal"],
        ].map(([p, r]) => (
          <Link key={p} href={qs({ periodo: p })} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", ctx.periodo.preset === p ? "border-interlig-azul bg-interlig-azul text-white" : "hover:bg-muted")}>
            {r}
          </Link>
        ))}
        <span className="ml-2 text-xs font-medium text-muted-foreground">Ordenar por:</span>
        {CRITERIOS.map(([k, r]) => (
          <Link key={k} href={qs({ por: k })} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", criterio === k ? "border-interlig-azul bg-interlig-azul/10 text-interlig-azul" : "hover:bg-muted")}>
            {r}
          </Link>
        ))}
      </div>

      {setores.length === 0 && <Vazio>Sem vendedores no escopo selecionado.</Vazio>}
      <div className="space-y-4">
        {setores.map((s) => {
          const grupo = linhas
            .filter((l) => (l.vendedor.setor ?? "") === s)
            .sort((a, b) => (pos.get(a.vendedor.id) ?? 999) - (pos.get(b.vendedor.id) ?? 999) || (valorCriterio(b, criterio) ?? -1) - (valorCriterio(a, criterio) ?? -1));
          return (
            <Painel key={s} titulo={`${rotuloSetor(s)} — ranking por ${CRITERIOS.find(([k]) => k === criterio)![1]}`} descricao="Só entra na posição quem é comparável: mesma função, ativo, com meta no período e dados de esforço suficientes. * = score provisório.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="w-10 py-2 font-medium">#</th>
                      <th className="w-12 py-2 font-medium">Δ</th>
                      <th className="py-2 font-medium">Vendedor</th>
                      <th className="py-2 text-right font-medium">Leads rec.</th>
                      <th className="py-2 text-right font-medium">Trabalhados</th>
                      <th className="py-2 text-right font-medium">Vendas</th>
                      <th className="py-2 text-right font-medium">Conversão</th>
                      <th className="w-28 py-2 pl-3 font-medium">Meta</th>
                      <th className="py-2 text-right font-medium">Esforço</th>
                      <th className="py-2 text-right font-medium">Resultado</th>
                      <th className="py-2 text-right font-medium">Qualidade</th>
                      <th className="py-2 text-right font-medium">IPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.map((l) => {
                      const p = pos.get(l.vendedor.id) ?? null;
                      const pa = posAnt.get(l.vendedor.id) ?? null;
                      const ver = mostraValores(l);
                      const oculto = <span className="text-xs text-muted-foreground">—</span>;
                      return (
                        <tr key={l.vendedor.id} className={cn("border-t", l.vendedor.id === proprio && "bg-interlig-ceu/5")}>
                          <td className="py-2.5 font-semibold tabular-nums">{p === 1 ? <Trophy className="h-4 w-4 text-farol-amarelo" aria-label="1º lugar" /> : p ?? "—"}</td>
                          <td className="py-2.5 text-xs tabular-nums">
                            {p !== null && pa !== null && pa !== p ? (
                              <span className={pa > p ? "text-farol-verde" : "text-farol-vermelho"}>{pa > p ? `▲${pa - p}` : `▼${p - pa}`}</span>
                            ) : p !== null && pa === null ? (
                              <span className="text-muted-foreground">novo</span>
                            ) : (
                              <span className="text-muted-foreground">=</span>
                            )}
                          </td>
                          <td className="py-2.5">
                            {ver ? (
                              <Link href={`/performance/vendedor/${l.vendedor.id === proprio ? "eu" : l.vendedor.id}${qs({})}`} className="font-medium hover:underline">
                                {l.vendedor.nome}
                              </Link>
                            ) : (
                              <span className="font-medium">{l.vendedor.nome}</span>
                            )}
                            <span className="block text-xs text-muted-foreground">
                              {l.vendedor.pop_nome ?? "—"}
                              {l.flags.motivoNaoComparavel && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">{l.flags.motivoNaoComparavel}</span>}
                            </span>
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{ver ? fmtNum(l.numeros.leadsRecebidos) : oculto}</td>
                          <td className="py-2.5 text-right tabular-nums">{ver ? fmtNum(l.numeros.leadsTrabalhados) : oculto}</td>
                          <td className="py-2.5 text-right tabular-nums">{ver ? fmtNum(l.numeros.vendas) : oculto}</td>
                          <td className="py-2.5 text-right tabular-nums">{ver ? fmtPct(l.numeros.conversao) : oculto}</td>
                          <td className="py-2.5 pl-3">
                            {ver ? (
                              <>
                                <span className="block text-xs tabular-nums">{l.numeros.metaPeriodo ? `${fmtPct(l.numeros.metaPct)} de ${fmtNum(l.numeros.metaPeriodo)}` : "sem meta"}</span>
                                <BarraProgresso fracao={l.numeros.metaPct} />
                              </>
                            ) : (
                              oculto
                            )}
                          </td>
                          <td className="py-2.5 text-right">{ver ? <NotaScore valor={l.esforco.score.valor} provisorio={l.esforco.score.provisorio} tamanho="sm" /> : oculto}</td>
                          <td className="py-2.5 text-right">{ver ? <NotaScore valor={l.resultado.score.valor} provisorio={l.resultado.score.provisorio} tamanho="sm" /> : oculto}</td>
                          <td className="py-2.5 text-right">{ver ? <NotaScore valor={l.qualidade.score.valor} provisorio={l.qualidade.score.provisorio} tamanho="sm" /> : oculto}</td>
                          <td className="py-2.5 text-right">{ver ? <NotaScore valor={l.ipc.valor} provisorio={l.ipc.provisorio} /> : oculto}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Painel>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Δ = variação de posição contra o período anterior equivalente ({ctx.periodo.deAnterior.split("-").reverse().join("/")} a {ctx.periodo.ateAnterior.split("-").reverse().join("/")}). Ranking é apoio à gestão: não usar isoladamente para decisão trabalhista ou disciplinar.
      </p>
    </div>
  );
}
