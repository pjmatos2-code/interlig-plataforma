import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimuladorComissao } from "@/components/comissao/simulador";
import { proximoDegrau } from "@/lib/indicadores/comissao";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { formatarMoeda, formatarData } from "@/lib/format";
import type { MinhaComissao } from "@/lib/comissao/minha";

const MES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
/** "2026-06-01" -> "junho/2026" */
function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MES_EXTENSO[Number(mes) - 1] ?? mes}/${ano}`;
}

/**
 * Seção "Minha comissão" do Minhas vendas: resultado da faixa, contratos
 * pendentes de liberação (com o que falta) e inadimplentes dos 90 dias que
 * somam débito na meta — a vendedora acompanha e age antes do fechamento.
 */
export function PainelMinhaComissao({
  demonstrativo,
  dados,
  linkTemplate,
}: {
  dados: MinhaComissao;
  /** competência já fechada: a agente pode baixar o próprio demonstrativo */
  demonstrativo?: { vendedorId: string; mes: string } | null;
  linkTemplate: string;
}) {
  if (!dados.temRegra || !dados.resultado) {
    return (
      <Card className="mt-6">
        <CardHeader className="pb-2"><CardTitle>Minha comissão</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {dados.metaMensal
            ? "Regra de comissão do mês ainda não configurada — fale com a gestão."
            : "Meta do mês ainda não cadastrada — fale com a gestão."}
        </CardContent>
      </Card>
    );
  }
  const r = dados.resultado;
  // o alvo da próxima faixa vivia só dentro do simulador, lá embaixo — subiu
  // para junto dos números, que é onde ela olha primeiro
  const proximo = dados.entradaSimulador ? proximoDegrau(dados.entradaSimulador) : null;
  const pendentesAjudam = proximo
    ? Math.min(r.vendasPendentes, proximo.faltamVendas)
    : 0;
  const linkDe = (clienteId: string | null, contratoId: string | null) =>
    aplicarLinkSgp(linkTemplate, { clienteId, contratoId, cpf: null });

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Minha comissão — mês corrente</CardTitle>
          {demonstrativo && (
            <a
              href={`/api/comissao/demonstrativo?vendedor=${demonstrativo.vendedorId}&mes=${demonstrativo.mes}`}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              title="Demonstrativo oficial da última competência fechada"
            >
              ↓ Meu demonstrativo ({rotuloMes(demonstrativo.mes)})
            </a>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          A venda pontua a meta ao ser cadastrada; a comissão libera com Termo + Fidelidade
          assinados e serviço ativo.{" "}
          {dados.debitoJanela ? (
            <>
              O débito da meta (early churn) avalia as vendas com 1º vencimento de{" "}
              <strong>
                {dados.debitoJanela.de.slice(8, 10)}/{dados.debitoJanela.de.slice(5, 7)} a{" "}
                {dados.debitoJanela.ate.slice(8, 10)}/{dados.debitoJanela.ate.slice(5, 7)}
              </strong>{" "}
              que hoje NÃO estão ativas — maturação de 90 dias cumprida antes do fechamento.
            </>
          ) : (
            <>
              O débito da meta avalia as vendas de <strong>{rotuloMes(dados.mesCoorte)}</strong>{" "}
              (três meses atrás) que hoje NÃO estão ativas: pendentes de instalação, inativas,
              suspensas ou canceladas.
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Atingimento</p>
            <p className="text-xl font-semibold tabular-nums">{r.atingimentoPct.toFixed(0)}%</p>
            <p className="text-[11px] text-muted-foreground">meta efetiva {r.metaEfetiva}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Faixa atual</p>
            <p className="text-xl font-semibold">{dados.faixaAtual}</p>
          </div>
          <div className="rounded-lg border border-farol-verde/50 p-3">
            <p className="text-xs text-muted-foreground">Comissão estimada</p>
            <p className="text-xl font-semibold tabular-nums text-farol-verde">{formatarMoeda(r.total)}</p>
            <p className="text-[11px] text-muted-foreground">{dados.liberadas} venda(s) liberada(s)</p>
          </div>
          <div className="rounded-lg border border-farol-amarelo/60 p-3">
            <p className="text-xs text-muted-foreground">Se liberar as pendentes</p>
            <p className="text-xl font-semibold tabular-nums text-farol-amarelo">{formatarMoeda(r.totalSeLiberar)}</p>
            <p className="text-[11px] text-muted-foreground">{r.vendasPendentes} pendente(s)</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{dados.debitoJanela ? "Débito early churn" : "Débito na meta (90d)"}</p>
            <p className="text-xl font-semibold tabular-nums">{r.debitoMeta > 0 ? `+${r.debitoMeta}` : "0"}</p>
            <p className="text-[11px] text-muted-foreground">
              {dados.debitoManual
                ? "ajuste da gestão"
                : dados.debitoJanela
                  ? `venc. ${dados.debitoJanela.de.slice(8, 10)}/${dados.debitoJanela.de.slice(5, 7)}–${dados.debitoJanela.ate.slice(8, 10)}/${dados.debitoJanela.ate.slice(5, 7)}`
                  : `vendas de ${rotuloMes(dados.mesCoorte)}`}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Estornos</p>
            <p className="text-xl font-semibold tabular-nums">{r.estornos}</p>
          </div>
        </div>

        {proximo ? (
          <div className="rounded-md border border-farol-amarelo/50 bg-farol-amarelo/10 px-3 py-2 text-sm">
            🎯 Faltam <strong>{proximo.faltamVendas} venda(s)</strong> para o degrau de{" "}
            {proximo.degrau.atingimento_min}% — sua comissão passa a{" "}
            <strong>{formatarMoeda(proximo.totalLa)}</strong>
            {pendentesAjudam > 0 && (
              <>
                .{" "}
                <span className="text-amber-900">
                  Você tem {r.vendasPendentes} pendente(s) de liberação: {pendentesAjudam}
                  {pendentesAjudam === proximo.faltamVendas
                    ? " já fecham o degrau"
                    : " contam para isso"}
                  .
                </span>
              </>
            )}
          </div>
        ) : (
          r.degrau && (
            <div className="rounded-md border border-farol-verde/50 bg-farol-verde/10 px-3 py-2 text-sm">
              🏆 Você está no degrau máximo — <strong>{dados.faixaAtual}</strong>.
            </div>
          )
        )}

        {/* memória de cálculo — o "por que esse valor?" (layout aprovado 31/08) */}
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-semibold">Memória de cálculo — por que esse valor?</p>
          <div className="space-y-1.5">
            {(
              [
                ["Vendas liberadas", String(r.vendasComissionaveis)],
                ...(r.debitoMeta > 0
                  ? [["Débito na meta (90 dias)", `+${r.debitoMeta} · meta ${r.metaEfetiva - r.debitoMeta} → ${r.metaEfetiva}`] as [string, string]]
                  : []),
                [
                  "Atingimento (a venda pontua ao ser cadastrada)",
                  `${r.vendasComissionaveis + r.vendasPendentes} cadastradas / ${r.metaEfetiva} = ${r.atingimentoPct.toFixed(1).replace(".", ",")}% (${r.vendasComissionaveis} liberadas + ${r.vendasPendentes} pendentes)`,
                ],
                ["Faixa aplicada", dados.faixaAtual ?? "sem faixa"],
                ["Valor base", formatarMoeda(r.valorBase)],
                ...(r.bonusFixo > 0 ? [["Bônus fixo da faixa", formatarMoeda(r.bonusFixo)] as [string, string]] : []),
                ...r.gatilhos.map((g) => [`Gatilho: ${g.descricao}`, formatarMoeda(g.adicional)] as [string, string]),
                ["Comissão estimada", formatarMoeda(r.total)],
                ...(r.vendasPendentes > 0
                  ? [["Se liberar as " + r.vendasPendentes + " pendente(s)", formatarMoeda(r.totalSeLiberar)] as [string, string]]
                  : []),
              ] as [string, string][]
            ).map(([rot, val], i) => (
              <div key={rot} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                  <span className="truncate text-muted-foreground">{rot}</span>
                </span>
                <span className="whitespace-nowrap font-medium tabular-nums">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* liberadas pela gestão — a vendedora precisa enxergar esse crédito */}
        {dados.liberadasPorAprovacao.length > 0 && (
          <div className="rounded-lg border border-farol-verde/40">
            <div className="border-b bg-emerald-50/60 px-4 py-2.5">
              <p className="text-sm font-semibold text-emerald-900">
                ✓ Liberadas pela gestão ({dados.liberadasPorAprovacao.length}) — já contam na sua
                comissão deste mês
              </p>
            </div>
            <div className="max-h-60 overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Contrato</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Motivo da liberação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.liberadasPorAprovacao.map((a) => (
                    <tr key={`${a.sgpContratoId}-${a.dataVenda}`} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {formatarData(a.dataVenda)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {a.sgpContratoId ? `#${a.sgpContratoId}` : "—"}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2">{a.cliente}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {a.motivo}
                        {a.aprovadoPor && ` · ${a.aprovadoPor}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* pendentes de liberação */}
        <div className="rounded-lg border">
          <div className="border-b bg-amber-50/60 px-4 py-2.5">
            <p className="text-sm font-semibold text-amber-900">
              ⚠ Contratos pendentes de liberação ({dados.pendentes.length}) — resolva antes do fechamento
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Plano</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">O que falta</th>
                </tr>
              </thead>
              <tbody>
                {dados.pendentes.map((p) => {
                  const link = linkDe(p.sgpClienteId, p.sgpContratoId);
                  return (
                    <tr key={`${p.sgpContratoId}-${p.dataVenda}-${p.cliente}`} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{formatarData(p.dataVenda)}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {p.sgpContratoId && link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="text-interlig-ceu hover:underline">
                            #{p.sgpContratoId} ↗
                          </a>
                        ) : "—"}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2">{p.cliente}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-muted-foreground">{p.plano ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(p.valor)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {p.pendencias.map((x) => (
                            <span key={x} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              {x}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {dados.pendentes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-farol-verde">
                      ✓ Nenhuma pendência — todas as suas vendas do mês estão liberadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* clientes da coorte que não estão ativos */}
        <div className="rounded-lg border">
          <div
            className={`border-b px-4 py-2.5 ${
              dados.debitoAplicado ? "bg-rose-50/60" : "bg-sky-50/60"
            }`}
          >
            {dados.debitoAplicado ? (
              <>
                <p className="text-sm font-semibold text-rose-900">
                  Clientes de {rotuloMes(dados.mesCoorte)} que não estão ativos (
                  {dados.inadimplentes.length}) — cada um soma +1 na sua meta deste mês. Cliente
                  que voltar a ficar ATIVO até o fechamento sai do débito.
                </p>
                <p className="mt-0.5 text-[11px] text-rose-800">
                  Faturas: <span className="mr-2">🟢 paga</span>
                  <span className="mr-2">🔴 em atraso</span>
                  <span>🔵 a vencer / não gerada</span> — só as 3 primeiras julgam a venda.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-sky-900">
                  Clientes de {rotuloMes(dados.mesCoorte)} que não estão ativos (
                  {dados.inadimplentes.length}) — neste mês NÃO descontam da sua meta.
                </p>
                {dados.debitoObservacao && (
                  <p className="mt-0.5 text-xs text-sky-800">{dados.debitoObservacao}</p>
                )}
              </>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium" title="Farol das 3 primeiras faturas — as únicas que julgam a venda">Faturas 1ª–3ª</th>
                  <th className="px-3 py-2 font-medium">1ª fatura</th>
                </tr>
              </thead>
              <tbody>
                {dados.inadimplentes.map((i) => {
                  const link = linkDe(i.sgpClienteId, i.sgpContratoId);
                  return (
                    <tr key={`${i.sgpContratoId}-${i.cliente}`} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">
                        {i.sgpContratoId && link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="text-interlig-ceu hover:underline">
                            #{i.sgpContratoId} ↗
                          </a>
                        ) : "—"}
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2">{i.cliente}</td>
                      <td className="px-3 py-2">
                        <Badge variant={i.status === "cancelado" ? "vermelho" : "amarelo"}>
                          {i.status === "aguardando_ativacao"
                            ? "pendente instalação"
                            : i.status === "pendente_assinatura"
                              ? "pendente assinatura"
                              : i.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          {i.faturas.map((f) => (
                            <span
                              key={f.parcela}
                              title={`${f.parcela}ª fatura: ${
                                f.situacao === "paga" ? "paga" : f.situacao === "atrasada" ? "em atraso" : "a vencer"
                              }${f.vencimento ? ` (venc. ${formatarData(f.vencimento)})` : " (não gerada)"}`}
                              className={`inline-block h-3 w-3 rounded-full ${
                                f.situacao === "paga"
                                  ? "bg-emerald-500"
                                  : f.situacao === "atrasada"
                                    ? "bg-rose-500"
                                    : "bg-sky-500"
                              }`}
                            />
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {i.vencimento1a ? `venc. ${formatarData(i.vencimento1a)}` : "sem fatura gerada"}
                      </td>
                    </tr>
                  );
                })}
                {dados.inadimplentes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-farol-verde">
                      ✓ Nenhum cliente pendente nesta coorte — sua meta segue sem débito.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* simulador */}
        {dados.entradaSimulador && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Simulador — quanto ganho se vender mais?
            </p>
            <SimuladorComissao entrada={dados.entradaSimulador} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
