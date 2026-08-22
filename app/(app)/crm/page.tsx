import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { carregarCrm } from "@/lib/crm/dados";
import { executarRotinasCrm } from "@/lib/crm/rotinas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { CartaoDeTicket } from "@/components/crm/cartao-ticket";
import { GraficoBarrasHorizontais } from "@/components/dashboard/graficos";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from "@/lib/format";
import { ROTULO_ETAPA, type EtapaTicket } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const COLUNAS_ABERTAS: EtapaTicket[] = ["novo", "em_atendimento", "proposta", "aguardando"];
const LIMITE_COLUNA = 20;

export default async function CrmPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string };
}) {
  const usuario = await exigirUsuario();
  const periodo = resolverPeriodo(searchParams);

  // Rotinas do CRM (fechamento por inatividade + reconciliação) rodam a cada
  // carregamento; na fase do worker passam para o cron.
  await executarRotinasCrm();

  const d = await carregarCrm(periodo, usuario);
  const ehVendedora = usuario.perfil === "vendedora";

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <CabecalhoPagina
          titulo="CRM comercial"
          descricao={`Indicadores sobre tickets fechados de ${formatarData(periodo.de)} a ${formatarData(periodo.ate)} · kanban mostra todos os abertos`}
        />
        <Link href="/crm/novo" className={buttonVariants({})}>
          + Novo ticket
        </Link>
      </div>

      <FiltrosDashboard pops={[]} mostrarPop={false} de={periodo.de} ate={periodo.ate} />

      {/* KPIs 5.14–5.17 */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <CartaoKpi
          rotulo="Conversão real"
          valor={
            d.kpis.conversao.taxa === null ? "—" : formatarPercentual(d.kpis.conversao.taxa, 0)
          }
          contexto={`${d.kpis.conversao.convertidos} de ${d.kpis.conversao.fechados} fechados (5.14)`}
        />
        <CartaoKpi
          rotulo="1ª tratativa (mediana)"
          valor={
            d.kpis.primeiraTratativaMin === null
              ? "—"
              : d.kpis.primeiraTratativaMin < 90
                ? `${Math.round(d.kpis.primeiraTratativaMin)} min`
                : `${(d.kpis.primeiraTratativaMin / 60).toFixed(1).replace(".", ",")} h`
          }
          contexto="criação → primeira ação (5.15)"
        />
        <CartaoKpi
          rotulo="Ciclo de negociação"
          valor={
            d.kpis.cicloConvertidoDias === null
              ? "—"
              : `${d.kpis.cicloConvertidoDias.toFixed(1).replace(".", ",")} d`
          }
          contexto={`convertidos · não conv.: ${
            d.kpis.cicloNaoConvertidoDias === null
              ? "—"
              : `${d.kpis.cicloNaoConvertidoDias.toFixed(1).replace(".", ",")} d`
          } (5.16)`}
        />
        <CartaoKpi
          rotulo="Reconciliação com SGP"
          valor={
            d.kpis.reconciliacao.taxa === null
              ? "—"
              : formatarPercentual(d.kpis.reconciliacao.taxa, 0)
          }
          contexto={`meta ≥ 95% · ${d.kpis.reconciliacao.reconciliados} de ${d.kpis.reconciliacao.convertidos} (5.17)`}
          tom={
            d.kpis.reconciliacao.taxa === null
              ? undefined
              : d.kpis.reconciliacao.taxa >= 0.95
                ? "verde"
                : "vermelho"
          }
        />
        <CartaoKpi
          rotulo="Tickets abertos"
          valor={formatarNumero(d.kpis.abertos)}
          contexto={
            d.kpis.naoAtribuidos > 0
              ? `${d.kpis.naoAtribuidos} sem vendedora — distribuir`
              : "todos atribuídos"
          }
          tom={d.kpis.naoAtribuidos > 0 ? "amarelo" : undefined}
        />
      </div>

      {/* Lembretes de follow-up (PRD 3.9) */}
      {d.followupsHoje.length > 0 && (
        <Card className="mb-4 border-interlig-ceu/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              📞 Retornos combinados para hoje ou atrasados ({d.followupsHoje.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {d.followupsHoje.slice(0, 8).map((t) => (
              <Link
                key={t.id}
                href={`/crm/${t.id}`}
                className="rounded-full border px-3 py-1 text-xs hover:border-interlig-ceu"
              >
                {t.cliente_nome} · {formatarData(t.followup_em!.slice(0, 10))}
              </Link>
            ))}
            {d.followupsHoje.length > 8 && (
              <span className="px-2 py-1 text-xs text-muted-foreground">
                e mais {d.followupsHoje.length - 8}…
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Kanban (PRD 3.9) */}
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[...COLUNAS_ABERTAS, "fechado" as const].map((etapa) => {
          const itens = d.colunas[etapa];
          const visiveis = itens.slice(0, LIMITE_COLUNA);
          return (
            <div key={etapa} className="flex min-w-0 flex-col rounded-lg border bg-muted/30">
              <div className="rounded-t-lg border-b bg-background px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{ROTULO_ETAPA[etapa]}</p>
                  <Badge variant="secondary">{itens.length}</Badge>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatarMoeda(itens.reduce((soma, t) => soma + (t.valor ?? 0), 0))}
                </p>
              </div>
              <div className="flex flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "30rem" }}>
                {visiveis.map((t) => (
                  <CartaoDeTicket key={t.id} ticket={t} mostrarPop={!ehVendedora} />
                ))}
                {itens.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">vazio</p>
                )}
                {itens.length > LIMITE_COLUNA && (
                  <p className="px-2 py-1 text-center text-xs text-muted-foreground">
                    e mais {itens.length - LIMITE_COLUNA}…
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Funil + motivos + conversão por vendedora (alimenta PRD 3.4) */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Funil do período</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoBarrasHorizontais
              dados={d.funil.map((f) => ({ nome: f.etapa, valor: f.quantidade }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Motivos de não conversão</CardTitle>
          </CardHeader>
          <CardContent>
            {d.motivosPerda.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma perda no período.
              </p>
            ) : (
              <GraficoBarrasHorizontais
                dados={d.motivosPerda.map((m) => ({ nome: m.motivo, valor: m.quantidade }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Conversão real por vendedora</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Vendedora</th>
                  <th className="px-3 py-2 text-right font-medium">Fechados</th>
                  <th className="px-3 py-2 text-right font-medium">Convertidos</th>
                  <th className="px-3 py-2 text-right font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {d.conversaoPorVendedora.map((v) => (
                  <tr key={v.nome} className="border-b last:border-0">
                    <td className="px-4 py-2">{v.nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.fechados}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.convertidos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarPercentual(v.convertidos / Math.max(1, v.fechados), 0)}
                    </td>
                  </tr>
                ))}
                {d.conversaoPorVendedora.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhum ticket fechado no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
