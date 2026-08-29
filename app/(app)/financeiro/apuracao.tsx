import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoeda, formatarPercentual } from "@/lib/format";
import type { ApuracaoAndamento } from "@/lib/comissao/financeiro";

/**
 * Apuração do mês corrente para o Financeiro — provisão, não pagamento.
 * Sem nenhuma ação: o financeiro acompanha para se organizar; quem decide
 * (liberar venda, dispensar assinatura, aplicar débito) é a Administração.
 */
export function PainelApuracao({ dados }: { dados: ApuracaoAndamento }) {
  if (dados.linhas.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Sem apuração no mês corrente — nenhuma agente com meta e regra vigente.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Apuração em andamento — mês corrente</CardTitle>
        <p className="text-sm text-muted-foreground">
          Prévia para provisão. Estes valores <strong>ainda mudam</strong> até o fechamento e
          não devem ser pagos. O pagamento sai da competência fechada, na aba acima.
        </p>
      </CardHeader>
      <CardContent className="p-0 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left">Agente</th>
                <th className="px-3 py-2 text-center">Liberadas</th>
                <th className="px-3 py-2 text-center">Pendentes</th>
                <th className="px-3 py-2 text-center">Meta</th>
                <th className="px-3 py-2 text-center">Ating.</th>
                <th className="px-3 py-2 text-center">Faixa</th>
                <th className="px-3 py-2 text-right">Parcial</th>
                <th className="px-3 py-2 text-right">Se liberar tudo</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((l) => (
                <tr key={l.vendedorId} className="border-t">
                  <td className="px-3 py-2 font-medium">{l.vendedora}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{l.vendasLiberadas}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {l.vendasPendentes > 0 ? (
                      <span className="text-amber-700">{l.vendasPendentes}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {l.meta}
                    {l.metaEfetiva !== l.meta && (
                      <span className="text-xs text-muted-foreground"> → {l.metaEfetiva}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {formatarPercentual(l.atingimentoPct, 1)}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{l.faixa}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatarMoeda(l.parcial)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatarMoeda(l.seLiberarPendentes)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="px-3 py-2">TOTAL</td>
                <td colSpan={5} />
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarMoeda(dados.totais.parcial)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatarMoeda(dados.totais.seLiberarPendentes)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {dados.totais.pendentes > 0 && (
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            {dados.totais.pendentes} venda(s) aguardando liberação da Administração — a diferença
            entre as duas últimas colunas é o quanto isso representa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
