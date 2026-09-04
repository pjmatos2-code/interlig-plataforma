import Link from "next/link";
import {
  ShoppingCart,
  CircleDollarSign,
  Tag,
  Target,
  Clock3,
  AlertTriangle,
  Zap,
  Plus,
  ListChecks,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { EvolucaoVendas } from "@/components/dashboard/evolucao-vendas";
import { resolverPeriodo } from "@/lib/datas";
import { carregarDashboard } from "@/lib/dashboard/dados";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import {
  GraficoVendasDiarias,
  GraficoBarrasHorizontais,
  GraficoProjecao,
} from "@/components/dashboard/graficos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarMoedaKpi, formatarNumero, formatarPercentual } from "@/lib/format";
import { ROTULO_ORIGEM } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/** Dashboard geral — layout aprovado pelo gestor (01/09): KPIs com ícone e
 * sparkline · alertas e ações rápidas no trilho lateral · gráficos. */

const ROTULO_PERIODO = {
  hoje: "hoje",
  semana: "na semana",
  mes: "no mês",
  personalizado: "no período",
} as const;

function Sparkline({ serie }: { serie: number[] }) {
  if (serie.length < 2) return null;
  const max = Math.max(1, ...serie);
  const pts = serie
    .map((v, i) => `${(i / (serie.length - 1)) * 100},${28 - (v / max) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-7 w-20 shrink-0" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Kpi({
  icone,
  cor,
  rotulo,
  valor,
  delta,
  sub,
  barraPct,
  serie,
  tom,
}: {
  icone: React.ReactNode;
  cor: string;
  rotulo: string;
  valor: string;
  delta?: { texto: string; sobe: boolean } | null;
  sub?: string;
  barraPct?: number | null;
  serie?: number[];
  tom?: "verde" | "amarelo" | "vermelho" | null;
}) {
  const corBorda =
    tom === "vermelho"
      ? "border-l-4 border-l-rose-500"
      : tom === "amarelo"
        ? "border-l-4 border-l-amber-500"
        : tom === "verde"
          ? "border-l-4 border-l-emerald-500"
          : "";
  return (
    <div className={`rounded-xl border bg-card p-3.5 ${corBorda}`}>
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${cor}18`, color: cor }}
        >
          {icone}
        </span>
        {serie && <Sparkline serie={serie} />}
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums leading-tight">{valor}</p>
      {delta && (
        <p className={`text-[11px] font-medium ${delta.sobe ? "text-emerald-700" : "text-rose-700"}`}>
          {delta.sobe ? "▲" : "▼"} {delta.texto}
        </p>
      )}
      {barraPct !== undefined && barraPct !== null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, barraPct)}%`, backgroundColor: cor }}
          />
        </div>
      )}
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const PALETA = ["#2563eb", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe", "#94a3b8"];

function Donut({
  fatias,
  total,
}: {
  fatias: { rotulo: string; valor: number }[];
  total: number;
}) {
  const soma = fatias.reduce((s, f) => s + f.valor, 0) || 1;
  let acc = 0;
  const stops = fatias
    .filter((f) => f.valor > 0)
    .map((f, i) => {
      const de = (acc / soma) * 360;
      acc += f.valor;
      return `${PALETA[i % PALETA.length]} ${de}deg ${(acc / soma) * 360}deg`;
    })
    .join(", ");
  return (
    <div className="flex items-center gap-4">
      <div
        className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
        style={{ background: stops ? `conic-gradient(${stops})` : "#e5e7eb" }}
      >
        <div className="grid h-[4.4rem] w-[4.4rem] place-items-center rounded-full bg-card text-center">
          <span>
            <span className="block text-[10px] text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{total}</span>
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {fatias.map((f, i) => (
          <li key={f.rotulo} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PALETA[i % PALETA.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.rotulo}</span>
            <span className="whitespace-nowrap font-medium tabular-nums">
              {f.valor} ({soma ? Math.round((f.valor / soma) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string; pop?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor", "direcao"]);
  const periodo = resolverPeriodo(searchParams);
  const popFiltro = searchParams.pop || null;
  const ehGestor = usuario.perfil === "gestor";

  const d = await carregarDashboard(periodo, popFiltro);

  // trilho de alertas: POPs abaixo de 70% da meta e vendas aguardando decisão
  const admin = criarClienteAdmin();
  const mesAtual = `${periodo.de.slice(0, 7)}-01`;
  const [{ data: metasPop }, aguardandoDecisao] = await Promise.all([
    admin
      .from("metas")
      .select("referencia_id, quantidade_vendas, pops:referencia_id(nome)")
      .eq("mes_ano", mesAtual)
      .eq("escopo", "pop"),
    ehGestor
      ? import("@/lib/comissao/aprovacoes")
          .then((m) => m.filaAprovacao(mesAtual))
          .then((f) => f.pendentes.filter((i) => !i.bloqueioAbsoluto).length)
          .catch(() => 0)
      : Promise.resolve(0),
  ]);
  const metaPorPop = new Map(
    (metasPop ?? []).map((m) => [
      ((m.pops as unknown as { nome: string } | null)?.nome ?? "").toLowerCase(),
      Number(m.quantidade_vendas ?? 0),
    ])
  );
  const popsAbaixo = d.vendasPorPop.filter((p) => {
    const meta = metaPorPop.get(p.pop.toLowerCase());
    return meta && meta > 0 && p.vendas / meta < 0.7;
  });

  // vendas gerais dos últimos 6 meses (mesma régua 5.1: erro/duplicidade fora)
  const inicio6m = (() => {
    const dt = new Date(`${mesAtual}T00:00:00Z`);
    dt.setUTCMonth(dt.getUTCMonth() - 5);
    return dt.toISOString().slice(0, 10);
  })();
  const porMes = new Map<string, { vendas: number; receita: number }>();
  const porDia6m = new Map<string, number>();
  for (let de = 0; de < 30_000; de += 1000) {
    const { data: pg } = await admin
      .from("contratos")
      .select("data_venda, valor_mensalidade, status, motivo_cancelamento")
      .gte("data_venda", inicio6m)
      .range(de, de + 999);
    for (const c of pg ?? []) {
      const motivo = String(c.motivo_cancelamento ?? "").toLowerCase();
      if (c.status === "cancelado" && (motivo.includes("erro de cadastro") || motivo.includes("duplicidade"))) continue;
      const m = String(c.data_venda).slice(0, 7);
      const atual = porMes.get(m) ?? { vendas: 0, receita: 0 };
      atual.vendas += 1;
      atual.receita += Number(c.valor_mensalidade ?? 0);
      porMes.set(m, atual);
      const dia = String(c.data_venda).slice(0, 10);
      porDia6m.set(dia, (porDia6m.get(dia) ?? 0) + 1);
    }
    if (!pg || pg.length < 1000) break;
  }
  const vendas6m = [...porMes.entries()]
    .sort()
    .slice(-6)
    .map(([m, v]) => ({ mes: m, ...v }));
  const max6m = Math.max(1, ...vendas6m.map((v) => v.vendas));

  // série diária contínua (dias sem venda = 0) do início 6m até hoje
  const serieDiaria: { dia: string; vendas: number }[] = [];
  {
    const fim = new Date().toISOString().slice(0, 10);
    for (let d = new Date(`${inicio6m}T00:00:00Z`); d.toISOString().slice(0, 10) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      const dia = d.toISOString().slice(0, 10);
      serieDiaria.push({ dia, vendas: porDia6m.get(dia) ?? 0 });
    }
  }
  // meta total do mês (metas por vendedora) e dias úteis (seg–sáb)
  const { data: metasMesRows } = await admin
    .from("metas")
    .select("quantidade_vendas")
    .eq("mes_ano", mesAtual)
    .eq("escopo", "vendedora");
  const metaMensalTotal = (metasMesRows ?? []).reduce((t, m) => t + Number(m.quantidade_vendas ?? 0), 0);
  const diasUteisMes = (() => {
    const d = new Date(`${mesAtual}T00:00:00Z`);
    let n = 0;
    while (d.toISOString().slice(0, 7) === mesAtual.slice(0, 7)) {
      if (d.getUTCDay() !== 0) n += 1; // seg–sáb
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return n;
  })();

  // base das unidades (Relatórios > Crescimento do SGP, sincronizado 1x/dia)
  const { data: baseUnidades } = await admin
    .from("crescimento_base")
    .select("mes, unidade, ativos, novos, cancelados_mes, cancelados_acum, suspensos")
    .order("mes");
  const unidadesBase = ["Altamira", "Vitória do Xingu", "Brasil Novo"]
    .map((unidade) => {
      const serie = (baseUnidades ?? []).filter((b) => b.unidade === unidade).slice(-6);
      return { unidade, serie };
    })
    .filter((u) => u.serie.length > 0);
  const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const deltaVendas =
    d.vendasPeriodoAnterior === 0
      ? null
      : (d.vendasPeriodo - d.vendasPeriodoAnterior) / d.vendasPeriodoAnterior;

  const alertas = [
    {
      icone: "🕐",
      titulo: "Ativações paradas",
      sub: `${d.ativacoesPendentes.emAlerta} há mais de 7 dias sem andamento.`,
      qtd: d.ativacoesPendentes.emAlerta,
      href: "/esteira",
      cor: "text-rose-700",
    },
    {
      icone: "📝",
      titulo: "Assinaturas pendentes",
      sub: `${d.pendentesAssinatura.emAlerta} contrato(s) há 48h ou mais aguardando assinatura.`,
      qtd: d.pendentesAssinatura.emAlerta,
      href: "/esteira",
      cor: "text-amber-700",
    },
    {
      icone: "📉",
      titulo: "POPs abaixo da meta",
      sub: popsAbaixo.length
        ? `${popsAbaixo.map((p) => p.pop).join(", ")} abaixo de 70% da meta mensal.`
        : "Todas as POPs no ritmo.",
      qtd: popsAbaixo.length,
      href: "/vendedoras",
      cor: "text-amber-700",
    },
    ...(ehGestor
      ? [
          {
            icone: "✅",
            titulo: "Vendas aguardando decisão",
            sub: "Pendentes de liberação da Administração.",
            qtd: aguardandoDecisao,
            href: "/metas/aprovacoes",
            cor: "text-sky-700",
          },
        ]
      : []),
  ];
  const totalAlertas = alertas.reduce((s, a) => s + a.qtd, 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard geral"
        descricao={
          ehGestor
            ? `Visão consolidada · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
            : `Sua POP · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
        }
      />

      <FiltrosDashboard pops={d.pops} mostrarPop={ehGestor} de={periodo.de} ate={periodo.ate} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        {/* coluna principal */}
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi
              icone={<ShoppingCart className="h-4 w-4" />}
              cor="#2563eb"
              rotulo={`Vendas ${ROTULO_PERIODO[periodo.tipo]}`}
              valor={formatarNumero(d.vendasPeriodo)}
              delta={
                deltaVendas === null
                  ? null
                  : {
                      texto: `${formatarPercentual(Math.abs(deltaVendas), 0)} vs anterior`,
                      sobe: deltaVendas >= 0,
                    }
              }
              serie={d.vendasDiarias.map((v) => v.vendas)}
            />
            <Kpi
              icone={<CircleDollarSign className="h-4 w-4" />}
              cor="#059669"
              rotulo="Receita contratada"
              valor={formatarMoedaKpi(d.receitaPeriodo)}
            />
            <Kpi
              icone={<Tag className="h-4 w-4" />}
              cor="#7c3aed"
              rotulo="Ticket médio"
              valor={formatarMoeda(d.ticketMedioPeriodo)}
            />
            <Kpi
              icone={<Target className="h-4 w-4" />}
              cor="#0284c7"
              rotulo="Meta do mês"
              valor={d.metaMensal ? formatarPercentual(d.percentualMeta, 0) : "—"}
              barraPct={d.metaMensal ? d.percentualMeta * 100 : null}
              sub={
                d.metaMensal
                  ? d.paceNecessario > 0
                    ? `pace: ${d.paceNecessario.toFixed(1).replace(".", ",")}/dia útil · meta ${d.metaMensal}`
                    : "meta batida 🎉"
                  : "sem meta cadastrada"
              }
              tom={d.metaMensal ? d.farol : null}
            />
            <Kpi
              icone={<Clock3 className="h-4 w-4" />}
              cor="#d97706"
              rotulo="Ativações pendentes"
              valor={formatarNumero(d.ativacoesPendentes.total)}
              sub={
                d.ativacoesPendentes.foraDoPeriodo > 0
                  ? `+${d.ativacoesPendentes.foraDoPeriodo} de antes`
                  : d.ativacoesPendentes.emAlerta > 0
                    ? `${d.ativacoesPendentes.emAlerta} em alerta`
                    : "nenhuma em alerta"
              }
              tom={d.ativacoesPendentes.emAlerta > 0 ? "vermelho" : null}
            />
          </div>

          {/* evolução diária */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Evolução diária de vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <GraficoVendasDiarias dados={d.vendasDiarias} metaDiaria={d.metaDiaria} />
            </CardContent>
          </Card>

          {/* vendas gerais — últimos 6 meses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Evolução diária de vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <EvolucaoVendas serie={serieDiaria} metaMensal={metaMensalTotal} diasUteisMes={diasUteisMes} />
            </CardContent>
          </Card>

                    {/* base das 3 unidades — Relatórios > Crescimento do SGP (1x/dia), modelo do mock 04/09 */}
          {unidadesBase.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Base das unidades, últimos 6 meses</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Fonte: SGP (Relatórios &gt; Contratos &gt; Crescimento) · residencial + corporativo · atualizado diariamente
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-3">
                {unidadesBase.map(({ unidade, serie }) => {
                  const atual = serie[serie.length - 1];
                  const maxU = Math.max(...serie.map((b) => Math.max(b.ativos, b.cancelados_acum, b.suspensos)), 1);
                  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                  return (
                    <div key={unidade} className="rounded-lg border p-3">
                      <p className="text-sm font-semibold">{unidade}</p>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded-md border px-1 py-1.5">
                          <p className="text-[10px] font-medium text-[#2563eb]">Ativos</p>
                          <p className="text-sm font-bold tabular-nums text-[#2563eb]">{atual.ativos.toLocaleString("pt-BR")}</p>
                        </div>
                        <div className="rounded-md border px-1 py-1.5">
                          <p className="text-[10px] font-medium text-slate-700">Cancelados</p>
                          <p className="text-sm font-bold tabular-nums text-slate-800">{atual.cancelados_acum.toLocaleString("pt-BR")}</p>
                        </div>
                        <div className="rounded-md border px-1 py-1.5">
                          <p className="text-[10px] font-medium text-orange-600">Suspensos</p>
                          <p className="text-sm font-bold tabular-nums text-orange-600">{atual.suspensos.toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex h-28 items-end justify-around gap-1 border-b pb-0.5">
                        {serie.map((b) => (
                          <div
                            key={b.mes}
                            className="flex h-full w-full items-end justify-center gap-0.5"
                            title={`${MESES[Number(b.mes.slice(5, 7)) - 1]}/${b.mes.slice(0, 4)} — Ativos: ${b.ativos.toLocaleString("pt-BR")} · Cancelados: ${b.cancelados_acum.toLocaleString("pt-BR")} (${b.cancelados_mes} no mês) · Suspensos: ${b.suspensos.toLocaleString("pt-BR")}`}
                          >
                            <div className="w-1/3 max-w-3 rounded-t-sm bg-[#2563eb]" style={{ height: `${Math.max(3, (b.ativos / maxU) * 100)}%` }} />
                            <div className="w-1/3 max-w-3 rounded-t-sm bg-slate-800" style={{ height: `${Math.max(2, (b.cancelados_acum / maxU) * 100)}%` }} />
                            <div className="w-1/3 max-w-3 rounded-t-sm bg-orange-500" style={{ height: `${Math.max(2, (b.suspensos / maxU) * 100)}%` }} />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-around pt-0.5">
                        {serie.map((b) => (
                          <span key={b.mes} className="w-full text-center text-[9px] text-muted-foreground">
                            {MESES[Number(b.mes.slice(5, 7)) - 1]}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#2563eb]" /> Ativos</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-800" /> Cancelados</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-500" /> Suspensos</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* linha inferior */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-baseline justify-between">
                  <CardTitle className="text-sm">Vendas por POP</CardTitle>
                  <Link href="/ranking" className="text-[11px] font-medium text-primary hover:underline">
                    Ver ranking
                  </Link>
                </div>
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
                <CardTitle className="text-sm">Mix de planos</CardTitle>
              </CardHeader>
              <CardContent>
                <Donut
                  total={d.vendasPeriodo}
                  fatias={d.mixPlanos.slice(0, 5).map((m) => ({ rotulo: m.plano, valor: m.vendas }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Origem de cadastro</CardTitle>
              </CardHeader>
              <CardContent>
                <Donut
                  total={d.vendasPeriodo}
                  fatias={d.origemDistribuicao.map((o) => ({
                    rotulo: ROTULO_ORIGEM[o.origem],
                    valor: o.vendas,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Projeção de fechamento</CardTitle>
              </CardHeader>
              <CardContent>
                <GraficoProjecao dados={d.projecaoSerie} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Projeção: {formatarNumero(Math.round(d.projecao))} venda(s)
                  {d.metaMensal ? ` para meta de ${formatarNumero(d.metaMensal)}` : ""} · ritmo 70/30
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* trilho lateral */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Alertas e prioridades
                </CardTitle>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                  {totalAlertas}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {alertas.map((a) => (
                <Link
                  key={a.titulo}
                  href={a.href}
                  className="flex items-start gap-2.5 rounded-lg p-1 transition hover:bg-muted/60"
                >
                  <span className="text-base leading-6">{a.icone}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs font-semibold ${a.qtd > 0 ? a.cor : "text-muted-foreground"}`}>
                      {a.titulo}
                    </span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{a.sub}</span>
                  </span>
                  <span className={`text-lg font-bold tabular-nums ${a.qtd > 0 ? "" : "text-muted-foreground"}`}>
                    {a.qtd}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Zap className="h-4 w-4 text-sky-600" /> Ações rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Link
                href="/crm/novo"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Novo ticket
              </Link>
              {ehGestor ? (
                <Link
                  href="/metas/aprovacoes"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-semibold hover:bg-muted"
                >
                  <ListChecks className="h-3.5 w-3.5" /> Ver pendências
                </Link>
              ) : (
                <Link
                  href="/esteira"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-semibold hover:bg-muted"
                >
                  <ListChecks className="h-3.5 w-3.5" /> Esteira
                </Link>
              )}
              {ehGestor && (
                <Link
                  href="/financeiro"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-semibold hover:bg-muted"
                >
                  <Receipt className="h-3.5 w-3.5" /> Financeiro
                </Link>
              )}
              <Link
                href={`/dashboard?periodo=${periodo.tipo}${popFiltro ? `&pop=${popFiltro}` : ""}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-semibold hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar dados
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
