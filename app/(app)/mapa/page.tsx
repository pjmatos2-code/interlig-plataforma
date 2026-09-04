import { exigirPerfil } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { carregarMapa } from "@/lib/mapa/dados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { MapaDinamico } from "@/components/mapa/mapa-dinamico";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarNumero } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MapaPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string; pop?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor", "direcao"]);
  const periodo = resolverPeriodo(searchParams);
  const popFiltro = usuario.perfil === "supervisor" ? usuario.pop_id : searchParams.pop || null;

  const supabase = criarClienteServidor();
  const { data: pops } = await supabase.from("pops").select("id, nome").order("nome");
  const { pontos, centro } = await carregarMapa(periodo, popFiltro);

  return (
    <>
      <CabecalhoPagina
        titulo="Mapa de calor por bairro"
        descricao={`Círculos proporcionais por centroide de bairro · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`}
      />

      <FiltrosDashboard
        pops={pops ?? []}
        mostrarPop={usuario.perfil === "gestor"}
        de={periodo.de}
        ate={periodo.ate}
      />

      <MapaDinamico pontos={pontos} centro={centro} />

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle>Top bairros do período</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Bairro</th>
                  <th className="px-3 py-2 font-medium">Cidade</th>
                  <th className="px-3 py-2 text-right font-medium">Vendas no período</th>
                  <th className="px-3 py-2 text-right font-medium">Clientes ativos</th>
                </tr>
              </thead>
              <tbody>
                {pontos.slice(0, 12).map((p) => (
                  <tr key={`${p.cidade}-${p.bairro}`} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{p.bairro}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.cidade}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarNumero(p.vendasPeriodo)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarNumero(p.clientesAtivos)}
                    </td>
                  </tr>
                ))}
                {pontos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhum bairro com dados no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Fonte: bairro do contrato no SGP + centroides de bairros_geo (nunca geocodifica em tempo
        de renderização — PRD 3.6). Camada de cancelamentos entra na fase 2 do mapa.
      </p>
    </>
  );
}
