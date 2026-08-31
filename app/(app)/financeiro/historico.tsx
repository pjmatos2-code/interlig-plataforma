import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { formatarMoeda } from "@/lib/format";
import type { HistoricoFinanceiro } from "@/lib/comissao/financeiro";

const mesCurto = (iso: string) => {
  const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${m[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
};

/**
 * Histórico das últimas competências fechadas, por agente — o financeiro vê a
 * evolução do que foi pago sem sair da tela. Alimentado pelo fechamento: cada
 * mês validado pela Administração entra aqui automaticamente.
 */
export function HistoricoAgentes({ dados }: { dados: HistoricoFinanceiro }) {
  if (dados.agentes.length === 0) return null;
  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Histórico por agente
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            últimas {dados.meses.length} competência(s) fechada(s)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Agente</th>
                {dados.meses.map((m) => (
                  <th key={m} className="px-3 py-2 text-right font-medium">{mesCurto(m)}</th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {dados.agentes.map((a) => (
                <tr key={a.vendedorId} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <AvatarAgente nome={a.vendedora} foto={a.foto} tamanho="sm" />
                      {a.vendedora}
                    </span>
                  </td>
                  {dados.meses.map((m) => {
                    const v = a.valores[m];
                    return (
                      <td key={m} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {v ? (
                          <>
                            {formatarMoeda(v.total)}
                            <span
                              className={`ml-1 text-[10px] ${v.pagoEm ? "text-emerald-700" : "text-amber-700"}`}
                              title={v.pagoEm ? `pago em ${v.pagoEm.slice(0, 10)}` : "fechado, pagamento não registrado"}
                            >
                              {v.pagoEm ? "✓" : "•"}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">
                    {formatarMoeda(a.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pt-2 text-[11px] text-muted-foreground">
          ✓ pagamento registrado · • competência fechada com pagamento ainda não registrado.
        </p>
      </CardContent>
    </Card>
  );
}
