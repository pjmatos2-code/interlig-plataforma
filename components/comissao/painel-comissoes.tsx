import Link from "next/link";
import { carregarPainelComissoes, type AgentePainel } from "@/lib/comissao/painel";
import { filaAprovacao } from "@/lib/comissao/aprovacoes";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { hojeIso, mesAtras, primeiroDiaDoMes } from "@/lib/datas";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { Card, CardContent } from "@/components/ui/card";
import { formatarMoeda, formatarMoedaKpi } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  CartaoResultadoAgente,
  COR_TOM,
  TEXTO_TOM,
  dataHora,
  faixaTexto,
  nomeMes,
  pct,
  tom,
} from "@/components/comissao/cartao-resultado-agente";

/**
 * Painel de comissões do comercial — o mesmo no módulo Comissões (gestão) e na
 * aba Comissões do Financeiro. O financeiro lê sem a RLS (o perfil dele não
 * passa em contratos_sel e receberia zeros em silêncio); aprovação de
 * pendentes e "ver como a agente vê" são só da gestão.
 */
export async function PainelComissoesComercial({
  mesPedido,
  linkMes,
  ehGestor,
  podeVerPainelAgente,
  ignorarRls = false,
}: {
  mesPedido?: string;
  /** href do chip de mês (recebe aaaa-mm) */
  linkMes: (aaaaMm: string) => string;
  ehGestor: boolean;
  podeVerPainelAgente: boolean;
  ignorarRls?: boolean;
}) {
  const atual = primeiroDiaDoMes(hojeIso());
  const opcoes = [mesAtras(atual, 3), mesAtras(atual, 2), mesAtras(atual, 1), atual];
  const pedido = /^\d{4}-\d{2}$/.test(mesPedido ?? "") ? `${mesPedido}-01` : null;
  // padrão: o mês anterior enquanto o atual ainda não tem metas (início de mês)
  let mes = pedido ?? atual;
  let p = await carregarPainelComissoes(mes, { ignorarRls });
  if (!pedido && p.agentes.length === 0) {
    mes = mesAtras(atual, 1);
    p = await carregarPainelComissoes(mes, { ignorarRls });
  }
  const [linkSgp, fila] = await Promise.all([templateLinkSgp(), ehGestor ? filaAprovacao(mes) : null]);
  const mesParam = mes.slice(0, 7);
  // pendentes por agente — mesma fila da página de aprovação (o número do atalho
  // é o que aparece lá ao clicar)
  const pendPorAgente = new Map<string, { nome: string; aprovaveis: number; assinatura: number }>();
  const estornadas = new Set(p.agentes.flatMap((a) => a.contratos.filter((x) => x.situacao === "estornada").map((x) => x.id)));
  const pendentesFila = (fila?.pendentes ?? []).filter((i) => !estornadas.has(i.contratoId));
  for (const i of pendentesFila) {
    const k = i.vendedorId ?? "sem";
    const g = pendPorAgente.get(k) ?? { nome: i.vendedorId ? i.vendedora : "Sem vendedora", aprovaveis: 0, assinatura: 0 };
    if (i.bloqueioAbsoluto) g.assinatura += 1;
    else g.aprovaveis += 1;
    pendPorAgente.set(k, g);
  }
  const fotoDe = new Map(p.agentes.map((a) => [a.vendedorId, a.foto]));
  const comissaoPresa = p.agentes.reduce((s, a) => s + Math.max(0, a.comissaoSeLiberar - a.comissao), 0);

  const vendedoras = p.agentes.filter((a) => a.base === "proprias");
  const lideranca = p.agentes.filter((a) => a.base !== "proprias");
  const soma = (f: (a: AgentePainel) => number, l = vendedoras) => l.reduce((s, a) => s + f(a), 0);
  const divergentes = p.agentes.filter((a) => a.fechado && Math.abs(a.fechado.valor - a.comissao) >= 0.01);

  return (
    <>
      {/* mês + estado da apuração */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {opcoes.map((m) => (
          <Link
            key={m}
            href={linkMes(m.slice(0, 7))}
            className={cn(
              "rounded-full border px-3 py-1 text-sm capitalize",
              m === mes ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {nomeMes(m)}
          </Link>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {p.fechamento ? (
            <span className="rounded-full bg-farol-verde/15 px-2.5 py-1 font-medium text-farol-verde">
              Fechado em {dataHora(p.fechamento.em)}
              {p.fechamento.por ? ` por ${p.fechamento.por}` : ""}
              {p.fechamento.pago ? " · pagamento registrado" : " · aguardando pagamento"}
            </span>
          ) : (
            <span className="rounded-full bg-farol-amarelo/20 px-2.5 py-1 font-medium text-yellow-700">
              {p.emAndamento ? "Em apuração — valores parciais" : "Ainda não fechado"}
            </span>
          )}
          {p.ultimaSync && <span>Dados do SGP de {dataHora(p.ultimaSync)}</span>}
        </span>
      </div>

      {ehGestor && pendentesFila.length > 0 && (
        <section className="mb-5 rounded-xl border border-farol-amarelo/50 bg-farol-amarelo/10 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              {pendentesFila.length} venda{pendentesFila.length > 1 ? "s" : ""} aguardando aprovação em {nomeMes(mes)}
            </h2>
            <Link
              href={`/metas/aprovacoes?mes=${mesParam}`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Aprovar todas as pendentes →
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[...pendPorAgente.values()].reduce((s, g) => s + g.aprovaveis, 0)} você pode liberar agora ·{" "}
            {[...pendPorAgente.values()].reduce((s, g) => s + g.assinatura, 0)} travadas por falta de assinatura
            {comissaoPresa >= 0.01 && <> · {formatarMoeda(comissaoPresa)} de comissão esperando liberação</>}
            {p.fechamento && (
              <span className="block text-yellow-700">
                {nomeMes(mes)} já está fechado: o que for liberado agora só entra no pagamento depois de refazer o fechamento.
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...pendPorAgente.entries()]
              .sort((a, b) => b[1].aprovaveis + b[1].assinatura - (a[1].aprovaveis + a[1].assinatura))
              .map(([id, g]) => (
                <Link
                  key={id}
                  href={`/metas/aprovacoes?mes=${mesParam}&agente=${id}`}
                  className="flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-sm shadow-sm hover:border-primary hover:bg-primary/5"
                >
                  <AvatarAgente nome={g.nome} foto={fotoDe.get(id) ?? null} tamanho="sm" />
                  <span className="font-medium">{g.nome}</span>
                  {g.aprovaveis > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground" title="você pode liberar">
                      {g.aprovaveis}
                    </span>
                  )}
                  {g.assinatura > 0 && (
                    <span className="rounded-full bg-farol-vermelho/15 px-1.5 text-xs font-semibold text-farol-vermelho" title="falta assinatura">
                      {g.assinatura} 🔒
                    </span>
                  )}
                </Link>
              ))}
          </div>
        </section>
      )}

      {p.agentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma agente com meta e regra de comissão em {nomeMes(mes)}.{" "}
            <Link href={`/metas?mes=${mes.slice(0, 7)}`} className="font-medium text-primary underline">
              Cadastrar metas do mês →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {divergentes.length > 0 && (
            <div className="mb-5 rounded-lg border border-farol-amarelo/50 bg-farol-amarelo/10 p-3 text-sm">
              <strong>Mudou depois do fechamento:</strong>{" "}
              {divergentes.map((a) => `${a.nome} (fechado ${formatarMoeda(a.fechado!.valor)} · hoje ${formatarMoeda(a.comissao)})`).join("; ")}.
              O financeiro paga o valor fechado; para valer o de hoje, refaça o fechamento em Metas e comissão.
            </div>
          )}

          {/* resumo do time */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ["Meta do time", soma((a) => a.meta), "soma das metas individuais"],
              ["Reposição", soma((a) => a.reposicao), "inadimplentes a repor"],
              ["Meta final", soma((a) => a.metaFinal), "meta + reposição"],
              ["Vendidas", soma((a) => a.vendidas), "cadastros que contam"],
              ["Ativas", soma((a) => a.ativas), "das vendas válidas"],
              ["Aprovadas", soma((a) => a.aprovadas), "liberadas para comissão"],
              ["VTV aprovado", formatarMoedaKpi(soma((a) => a.receitaAprovada)), "base da comissão"],
              ["Comissão", formatarMoedaKpi(soma((a) => a.comissao, p.agentes)), "inclui coordenação"],
            ].map(([r, v, s]) => (
              <Card key={r as string}>
                <CardContent className="p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r}</p>
                  <p className="whitespace-nowrap text-2xl font-bold tabular-nums">{v}</p>
                  <p className="text-xs text-muted-foreground">{s}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* placar: tudo numa linha por agente */}
          <Card className="mb-6">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Agente</th>
                      <th className="px-2 py-2.5 text-right font-medium">Meta</th>
                      <th className="px-2 py-2.5 text-right font-medium" title="Inadimplentes da coorte que a agente precisa repor">+ Reposição</th>
                      <th className="px-2 py-2.5 text-right font-medium">= Meta final</th>
                      <th className="px-2 py-2.5 text-right font-medium">Vendidas</th>
                      <th className="px-2 py-2.5 text-right font-medium" title="Vendidas menos estornos — é o que pontua a meta">Válidas</th>
                      <th className="px-2 py-2.5 text-right font-medium">Ativas</th>
                      <th className="px-2 py-2.5 text-right font-medium">Aprovadas</th>
                      <th className="min-w-[180px] px-3 py-2.5 font-medium">Atingimento</th>
                      <th className="px-2 py-2.5 text-right font-medium">Faixa</th>
                      <th className="px-2 py-2.5 text-right font-medium" title="Soma das mensalidades aprovadas — é sobre ela que a faixa incide.">
                        × VTV
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">= Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.agentes.map((a) => {
                      const t = tom(a);
                      return (
                        <tr key={a.vendedorId} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <a href={`#ag-${a.vendedorId}`} className="flex items-center gap-2 font-medium hover:underline">
                              <AvatarAgente nome={a.nome} foto={a.foto} tamanho="sm" />
                              {a.nome}
                              {a.base !== "proprias" && (
                                <span className="rounded bg-muted px-1.5 text-[10px] font-normal uppercase text-muted-foreground">coord.</span>
                              )}
                            </a>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.meta}</td>
                          <td className={cn("px-2 py-2 text-right tabular-nums", a.reposicao > 0 && "font-semibold text-farol-vermelho")}>
                            {a.reposicao > 0 ? `+${a.reposicao}` : "0"}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">{a.metaFinal}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.vendidas}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.validas}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.ativas}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.aprovadas}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2">
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <span className={cn("block h-full rounded-full", COR_TOM[t])} style={{ width: `${Math.min(100, a.atingimento)}%` }} />
                              </span>
                              <span className={cn("w-14 text-right text-xs font-semibold tabular-nums", TEXTO_TOM[t])}>{pct(a.atingimento)}</span>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{faixaTexto(a) ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                            {formatarMoeda(a.receitaAprovada)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatarMoeda(a.comissao)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {vendedoras.map((a) => (
              <CartaoResultadoAgente
                key={a.vendedorId}
                a={a}
                linkSgp={linkSgp}
                debito={p.debito}
                linkAprovar={ehGestor && pendPorAgente.has(a.vendedorId) ? `/metas/aprovacoes?mes=${mesParam}&agente=${a.vendedorId}` : null}
                linkPainel={podeVerPainelAgente ? `/meu-painel?agente=${a.vendedorId}&mes=${mesParam}` : null}
              />
            ))}
            {lideranca.length > 0 && (
              <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Coordenação</h2>
            )}
            {lideranca.map((a) => (
              <CartaoResultadoAgente key={a.vendedorId} a={a} linkSgp={linkSgp} debito={p.debito} />
            ))}
          </div>

          {(p.inativasComMeta.length > 0 || p.semMetaOuRegra.length > 0) && (
            <p className="mt-5 text-xs text-muted-foreground">
              {p.inativasComMeta.length > 0 && <>Fora da apuração por estarem inativas: {p.inativasComMeta.join(", ")}. </>}
              {p.semMetaOuRegra.length > 0 && <>Sem meta ou regra no mês: {p.semMetaOuRegra.join(", ")}.</>}
            </p>
          )}
        </>
      )}
    </>
  );
}

