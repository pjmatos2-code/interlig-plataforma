import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { GraficoHistorico } from "@/components/vendedoras/grafico-historico";
import { GraficoBarrasHorizontais } from "@/components/dashboard/graficos";
import { BadgeStatus } from "@/components/vendedoras/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from "@/lib/format";
import { ROTULO_ORIGEM } from "@/lib/tipos";
import type { DetalheVendedora } from "@/lib/vendedoras/dados";

/**
 * Corpo do drill-down da vendedora (PRD 3.2). Reutilizado em duas telas:
 * /vendedoras/[id] (gestor/supervisor) e /minhas-vendas (a própria vendedora).
 */
/** Resumo colorido da situação atual das vendas do período (ao lado do título). */
function ResumoStatus({ vendas }: { vendas: { status: string }[] }) {
  const contagem = new Map<string, number>();
  for (const v of vendas) contagem.set(v.status, (contagem.get(v.status) ?? 0) + 1);

  const ORDEM: { chave: string; rotulo: string; classe: string }[] = [
    { chave: "ativo", rotulo: "ativos", classe: "bg-farol-verde/12 text-farol-verde ring-farol-verde/25" },
    { chave: "aguardando_ativacao", rotulo: "aguardando ativação", classe: "bg-amber-100 text-amber-800 ring-amber-300/60" },
    { chave: "pendente_assinatura", rotulo: "pendente assinatura", classe: "bg-sky-100 text-sky-800 ring-sky-300/60" },
    { chave: "suspenso", rotulo: "suspensos", classe: "bg-orange-100 text-orange-800 ring-orange-300/60" },
    { chave: "cancelado", rotulo: "cancelados", classe: "bg-rose-100 text-rose-800 ring-rose-300/60" },
  ];
  const visiveis = ORDEM.filter((o) => (contagem.get(o.chave) ?? 0) > 0);
  if (visiveis.length === 0) return null;

  const naoAtivos = vendas.length - (contagem.get("ativo") ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visiveis.map((o) => (
        <span
          key={o.chave}
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${o.classe}`}
          title={`${contagem.get(o.chave)} ${o.rotulo} no período`}
        >
          {contagem.get(o.chave)} {o.rotulo}
        </span>
      ))}
      {naoAtivos > 0 && (
        <span className="text-xs text-muted-foreground">
          · {naoAtivos} não {naoAtivos === 1 ? "ativo" : "ativos"} (
          {Math.round((naoAtivos / Math.max(1, vendas.length)) * 100)}%)
        </span>
      )}
    </div>
  );
}

export function PainelDetalheVendedora({ detalhe }: { detalhe: DetalheVendedora }) {
  const k = detalhe.kpis;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <CartaoKpi rotulo="Vendas no mês" valor={formatarNumero(k.vendasMes)} />
        <CartaoKpi rotulo="Receita contratada" valor={formatarMoeda(k.receitaMes)} />
        <CartaoKpi rotulo="Ticket médio" valor={formatarMoeda(k.ticketMedio)} />
        <CartaoKpi
          rotulo="Meta do mês"
          valor={k.percentualMeta === null ? "—" : formatarPercentual(k.percentualMeta, 0)}
          contexto={
            k.metaMensal === null
              ? "sem meta cadastrada"
              : k.pace === 0
                ? "meta batida 🎉"
                : `pace: ${k.pace!.toFixed(1).replace(".", ",")}/dia útil · meta ${k.metaMensal} (${k.metaDiaria!.toFixed(1).replace(".", ",")}/dia)`
          }
          tom={k.farol ?? undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Funil do período</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoBarrasHorizontais
              dados={detalhe.funil.map((f) => ({ nome: f.etapa, valor: f.quantidade }))}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Conversão vendida → instalada:{" "}
              {detalhe.funil[0].quantidade === 0
                ? "—"
                : formatarPercentual(detalhe.funil[2].quantidade / detalhe.funil[0].quantidade, 0)}{" "}
              (regra 5.12 · funil completo com o CRM na Fase 2)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Meta × realizado — últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoHistorico dados={detalhe.historico} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <CardTitle>Vendas do período ({detalhe.vendas.length})</CardTitle>
              <ResumoStatus vendas={detalhe.vendas} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Plano</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.vendas.map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {formatarData(v.data_venda)}
                      </td>
                      <td className="px-3 py-2 font-medium">{v.cliente}</td>
                      <td className="px-3 py-2">{v.plano}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(v.valor)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.origem ? ROTULO_ORIGEM[v.origem] : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <BadgeStatus status={v.status} />
                      </td>
                    </tr>
                  ))}
                  {detalhe.vendas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhuma venda no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
