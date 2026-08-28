import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimuladorComissao } from "@/components/comissao/simulador";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { formatarMoeda, formatarData } from "@/lib/format";
import type { MinhaComissao } from "@/lib/comissao/minha";

/**
 * Seção "Minha comissão" do Minhas vendas: resultado da faixa, contratos
 * pendentes de liberação (com o que falta) e inadimplentes dos 90 dias que
 * somam débito na meta — a vendedora acompanha e age antes do fechamento.
 */
export function PainelMinhaComissao({
  dados,
  linkTemplate,
}: {
  dados: MinhaComissao;
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
  const linkDe = (clienteId: string | null, contratoId: string | null) =>
    aplicarLinkSgp(linkTemplate, { clienteId, contratoId, cpf: null });

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle>Minha comissão — mês corrente</CardTitle>
        <p className="text-sm text-muted-foreground">
          A venda pontua a meta ao ser cadastrada; a comissão libera com Termo + Fidelidade
          assinados e serviço ativo. Inadimplente dos 90 dias soma na meta (precisa repor).
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
            <p className="text-xs text-muted-foreground">Débito na meta (90d)</p>
            <p className="text-xl font-semibold tabular-nums">{r.debitoMeta > 0 ? `+${r.debitoMeta}` : "0"}</p>
            <p className="text-[11px] text-muted-foreground">
              {dados.debitoTravado ? "travado no dia 1º" : r.debitoMeta > 0 ? "vendas a repor" : "nenhum"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Estornos</p>
            <p className="text-xl font-semibold tabular-nums">{r.estornos}</p>
          </div>
        </div>

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

        {/* inadimplentes 90 dias */}
        <div className="rounded-lg border">
          <div className="border-b bg-rose-50/60 px-4 py-2.5">
            <p className="text-sm font-semibold text-rose-900">
              Inadimplentes dos 90 dias ({dados.inadimplentes.length})
              {dados.debitoTravado
                ? " — acompanhamento ao vivo; o débito oficial foi travado no dia 1º"
                : " — cada um soma +1 na sua meta do mês"}
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">1ª fatura venceu em</th>
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
                        <Badge variant={i.status === "cancelado" ? "vermelho" : "amarelo"}>{i.status}</Badge>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {i.vencimento1a ? formatarData(i.vencimento1a) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {dados.inadimplentes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-farol-verde">
                      ✓ Nenhum inadimplente nos 90 dias — sua meta segue sem débito.
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
