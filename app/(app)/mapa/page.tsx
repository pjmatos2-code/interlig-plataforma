import { exigirPerfil } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { carregarMapa } from "@/lib/mapa/dados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
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

  // procura em cidades onde ainda não atendemos: tickets "Outra cidade" (03/10/2026)
  const { data: foraArea } = await criarClienteAdmin()
    .from("tickets")
    .select("cidade_fora_area, fechado_em")
    .not("cidade_fora_area", "is", null)
    .gte("fechado_em", `${periodo.de}T00:00:00-03:00`)
    .lte("fechado_em", `${periodo.ate}T23:59:59-03:00`)
    .limit(2000);
  const porCidade = new Map<string, { qtd: number; ultima: string }>();
  for (const t of foraArea ?? []) {
    const c = String(t.cidade_fora_area);
    const atual = porCidade.get(c) ?? { qtd: 0, ultima: "" };
    atual.qtd += 1;
    if ((t.fechado_em as string) > atual.ultima) atual.ultima = t.fechado_em as string;
    porCidade.set(c, atual);
  }
  const cidades = [...porCidade.entries()].sort((a, b) => b[1].qtd - a[1].qtd);

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

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle>Procura em outras cidades</CardTitle>
          <p className="text-sm text-muted-foreground">
            Clientes que não fecharam por serem de cidade onde ainda não atendemos — motivo &quot;Outra cidade&quot; no CRM, no período.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Cidade</th>
                  <th className="px-3 py-2 text-right font-medium">Clientes interessados</th>
                  <th className="px-3 py-2 text-right font-medium">Último contato</th>
                </tr>
              </thead>
              <tbody>
                {cidades.map(([cidade, c]) => (
                  <tr key={cidade} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{cidade}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatarNumero(c.qtd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatarData(c.ultima.slice(0, 10))}</td>
                  </tr>
                ))}
                {cidades.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhum cliente de outra cidade registrado no período.
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
