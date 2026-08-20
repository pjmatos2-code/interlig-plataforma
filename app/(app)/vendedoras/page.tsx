import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { listaVendedoras } from "@/lib/vendedoras/dados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { BadgeFarol, BadgeTendencia } from "@/components/vendedoras/badges";
import { Card, CardContent } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VendedorasPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string; pop?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);
  const periodo = resolverPeriodo(searchParams);

  const supabase = criarClienteServidor();
  const { data: pops } = await supabase.from("pops").select("id, nome").order("nome");

  const linhas = await listaVendedoras(periodo, usuario, searchParams.pop || null);
  const totais = linhas.reduce(
    (acc, l) => ({ vendas: acc.vendas + l.vendas, receita: acc.receita + l.receita }),
    { vendas: 0, receita: 0 }
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Painel por vendedora"
        descricao={`${formatarData(periodo.de)} a ${formatarData(periodo.ate)} · % da meta e pace referem-se sempre ao mês corrente`}
      />

      <FiltrosDashboard
        pops={pops ?? []}
        mostrarPop={usuario.perfil === "gestor"}
        de={periodo.de}
        ate={periodo.ate}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Vendedora</th>
                  <th className="px-3 py-2.5 font-medium">POP</th>
                  <th className="px-3 py-2.5 text-right font-medium">Vendas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Receita</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ticket médio</th>
                  <th className="px-3 py-2.5 text-right font-medium">% da meta</th>
                  <th className="px-3 py-2.5 text-right font-medium">Pace</th>
                  <th className="px-3 py-2.5 text-center font-medium">Projeção</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Últimos 7 dias vs 7 anteriores">
                    Tendência
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/vendedoras/${l.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {l.nome}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{l.pop}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatarNumero(l.vendas)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatarMoeda(l.receita)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatarMoeda(l.ticketMedio)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {l.percentualMeta === null ? "—" : formatarPercentual(l.percentualMeta, 0)}
                      {l.metaMensal !== null && (
                        <span className="text-xs text-muted-foreground"> de {l.metaMensal}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {l.pace === null
                        ? "—"
                        : l.pace === 0
                          ? "batida"
                          : `${l.pace.toFixed(1).replace(".", ",")}/dia`}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <BadgeFarol valor={l.farol} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <BadgeTendencia valor={l.tendencia} />
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma vendedora no escopo.
                    </td>
                  </tr>
                )}
              </tbody>
              {linhas.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/30 text-xs font-medium">
                    <td className="px-4 py-2" colSpan={2}>
                      Total ({linhas.length} vendedoras)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarNumero(totais.vendas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(totais.receita)}</td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
