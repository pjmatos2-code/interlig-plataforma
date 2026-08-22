import { exigirPerfil } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { carregarDashboard } from "@/lib/dashboard/dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import {
  GraficoVendasDiarias,
  GraficoBarrasHorizontais,
  GraficoMixPlanos,
  GraficoOrigemDistribuicao,
  GraficoOrigemSemanal,
  GraficoProjecao,
} from "@/components/dashboard/graficos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarMoedaKpi, formatarNumero, formatarPercentual } from "@/lib/format";
import { ROTULO_ORIGEM } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ROTULO_PERIODO = {
  hoje: "hoje",
  semana: "na semana",
  mes: "no mês",
  personalizado: "no período",
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string; pop?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);
  const periodo = resolverPeriodo(searchParams);

  // supervisor já chega restrito pela RLS; o filtro de POP é ferramenta do gestor
  const popFiltro =
    usuario.perfil === "supervisor" ? usuario.pop_id : searchParams.pop || null;

  const d = await carregarDashboard(periodo, popFiltro);

  const deltaVendas =
    d.vendasPeriodoAnterior === 0
      ? null
      : (d.vendasPeriodo - d.vendasPeriodoAnterior) / d.vendasPeriodoAnterior;

  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard geral"
        descricao={
          usuario.perfil === "gestor"
            ? `Visão consolidada · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
            : `Sua POP · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
        }
      />

      <FiltrosDashboard
        pops={d.pops}
        mostrarPop={usuario.perfil === "gestor"}
        de={periodo.de}
        ate={periodo.ate}
      />

      {/* Linha de KPIs — PRD 3.1, regras 5.1 a 5.8 */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <CartaoKpi
          rotulo={`Vendas ${ROTULO_PERIODO[periodo.tipo]}`}
          valor={formatarNumero(d.vendasPeriodo)}
          delta={
            deltaVendas === null
              ? undefined
              : {
                  texto: `${formatarPercentual(Math.abs(deltaVendas), 0)} vs anterior`,
                  direcao: deltaVendas > 0 ? "sobe" : deltaVendas < 0 ? "desce" : "neutro",
                }
          }
        />
        <CartaoKpi rotulo="Receita contratada" valor={formatarMoedaKpi(d.receitaPeriodo)} />
        <CartaoKpi rotulo="Ticket médio" valor={formatarMoeda(d.ticketMedioPeriodo)} />
        <CartaoKpi
          rotulo="Meta do mês"
          valor={d.metaMensal ? formatarPercentual(d.percentualMeta, 0) : "—"}
          contexto={
            d.metaMensal
              ? d.paceNecessario > 0
                ? `pace: ${d.paceNecessario.toFixed(1).replace(".", ",")}/dia útil`
                : "meta batida 🎉"
              : "sem meta cadastrada"
          }
          tom={d.metaMensal ? d.farol : undefined}
        />
        <CartaoKpi
          rotulo="Ativações pendentes"
          valor={formatarNumero(d.ativacoesPendentes.total)}
          contexto={
            d.ativacoesPendentes.emAlerta > 0
              ? `${d.ativacoesPendentes.emAlerta} há mais de 7 dias`
              : "nenhuma em alerta"
          }
          tom={d.ativacoesPendentes.emAlerta > 0 ? "vermelho" : undefined}
        />
        <CartaoKpi
          rotulo="Pendentes de assinatura"
          valor={formatarNumero(d.pendentesAssinatura.total)}
          contexto={
            d.pendentesAssinatura.emAlerta > 0
              ? `${d.pendentesAssinatura.emAlerta} há 48h ou mais`
              : "nenhuma em alerta"
          }
          tom={d.pendentesAssinatura.emAlerta > 0 ? "vermelho" : undefined}
        />
      </div>

      {/* Gráficos — PRD 3.1 */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Vendas diárias</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoVendasDiarias dados={d.vendasDiarias} metaDiaria={d.metaDiaria} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Projeção de fechamento do mês</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoProjecao dados={d.projecaoSerie} />
            <p className="mt-2 text-xs text-muted-foreground">
              Projeção: {formatarNumero(Math.round(d.projecao))} venda(s)
              {d.metaMensal ? ` para meta de ${formatarNumero(d.metaMensal)}` : ""} · ritmo
              ponderado 70/30 (regra 5.6)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Vendas por POP</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoBarrasHorizontais
              dados={d.vendasPorPop.map((p) => ({
                nome: p.pop,
                valor: p.vendas,
                extra: formatarMoeda(p.receita),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Mix de planos</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoMixPlanos dados={d.mixPlanos} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Origem de cadastro</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoOrigemDistribuicao dados={d.origemDistribuicao} />
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Evolução semanal
              </p>
              <GraficoOrigemSemanal dados={d.origemSemanal} />
            </div>
            {/* tabela de apoio: valores sempre legíveis sem depender de cor */}
            <table className="mt-3 w-full text-xs">
              <tbody>
                {d.origemDistribuicao.map((o) => (
                  <tr key={o.origem} className="border-t">
                    <td className="py-1 text-muted-foreground">{ROTULO_ORIGEM[o.origem]}</td>
                    <td className="py-1 text-right tabular-nums">{formatarNumero(o.vendas)}</td>
                    <td className="py-1 pl-3 text-right tabular-nums text-muted-foreground">
                      {formatarPercentual(
                        d.vendasPeriodo === 0 ? 0 : o.vendas / d.vendasPeriodo,
                        0
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
