import Link from "next/link";
import { Plus, ListChecks, Receipt, RefreshCw, Tv } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { EvolucaoVendas } from "@/components/dashboard/evolucao-vendas";
import { hojeIso, primeiroDiaDoMes, resolverPeriodo } from "@/lib/datas";
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

/** Dashboard geral — visual revisto em 26/11/2026 (proposta aprovada pelo
 * gestor): números do período numa faixa só, sem ícone nem borda colorida ·
 * meta do ano como único bloco escuro, em régua dividida por unidade ·
 * base das unidades em tabela · alertas com ponto de gravidade. */

const ROTULO_PERIODO = {
  hoje: "hoje",
  semana: "na semana",
  mes: "no mês",
  personalizado: "no período",
} as const;

function Kpi({
  rotulo,
  valor,
  children,
  className = "",
}: {
  rotulo: string;
  valor: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 bg-card p-4 sm:px-5 ${className}`}>
      <p className="truncate text-[13px] leading-5 text-muted-foreground">{rotulo}</p>
      <p className="whitespace-nowrap text-2xl font-medium tabular-nums leading-8 tracking-tight">{valor}</p>
      <p className="min-h-4 text-xs leading-4 text-muted-foreground">{children}</p>
    </div>
  );
}

/** linha de evolução dos ativos (6 meses), com o último mês marcado */
function LinhaAtivos({ valores, titulo }: { valores: number[]; titulo: string }) {
  if (valores.length < 2) return <span className="text-muted-foreground">—</span>;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const pontos = valores.map((v, i) => {
    const x = 4 + (i / (valores.length - 1)) * 88;
    const y = max === min ? 12 : 20 - ((v - min) / (max - min)) * 16;
    return [x, y] as const;
  });
  const [ux, uy] = pontos[pontos.length - 1];
  return (
    <svg width="96" height="24" viewBox="0 0 96 24" className="ml-auto block" role="img" aria-label={titulo}>
      <title>{titulo}</title>
      <polyline
        points={pontos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="#64748b"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={ux} cy={uy} r="3" className="fill-primary" />
    </svg>
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
  // coordenador (21-23/09/2026): de TIME (Marcelo/Rayssa) vê o TIME em
  // qualquer cidade, com a meta do time; de UNIDADE vê o POP inteiro.
  // Gestor e direção filtram à vontade.
  const { timeDoCoordenador } = await import("@/lib/coordenacao");
  const timeIds =
    usuario.perfil === "supervisor" ? await timeDoCoordenador(usuario.id) : null;
  const popSupervisor =
    usuario.perfil === "supervisor" && !timeIds ? usuario.pop_id : null;
  const popFiltro = popSupervisor ?? (usuario.perfil === "supervisor" ? null : searchParams.pop || null);
  const ehGestor = usuario.perfil === "gestor";

  // meta e resultado do coordenador de TIME: só quem tem meta no mês atual
  // (férias/desligadas fora); o gráfico de 6 meses segue com o time inteiro
  const { timeComMetaNoMes } = await import("@/lib/coordenacao");
  const timeDoMes = timeIds ? await timeComMetaNoMes(timeIds, primeiroDiaDoMes(hojeIso())) : null;

  const d = await carregarDashboard(periodo, popFiltro, timeDoMes);

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


  // vendas por dia para o gráfico de evolução (mesma régua 5.1: erro/
  // duplicidade fora). A série acompanha o PERÍODO escolhido (07/10/2026):
  // termina no fim dele (ou hoje) e cobre ao menos os 6 meses anteriores.
  const hojeStm = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const fimSerie = periodo.ate < hojeStm ? periodo.ate : hojeStm;
  const inicio6m = (() => {
    const dt = new Date(`${fimSerie.slice(0, 7)}-01T00:00:00Z`);
    dt.setUTCMonth(dt.getUTCMonth() - 5);
    const seisMeses = dt.toISOString().slice(0, 10);
    return periodo.de < seisMeses ? periodo.de : seisMeses;
  })();
  const porMes = new Map<string, { vendas: number; receita: number }>();
  const porDia6m = new Map<string, number>();
  for (let de = 0; de < 30_000; de += 1000) {
    let consulta6m = admin
      .from("contratos")
      .select("data_venda, valor_mensalidade, status, motivo_cancelamento")
      .gte("data_venda", inicio6m)
      .lte("data_venda", fimSerie)
      // ordem fixa: sem ela o PostgREST repete e pula linhas entre as páginas
      // (o gráfico chegou a mostrar maio 486 e setembro 137)
      .order("id")
      .range(de, de + 999);
    if (timeIds) consulta6m = consulta6m.in("vendedor_id", timeIds);
    else if (popFiltro) consulta6m = consulta6m.eq("pop_id", popFiltro);
    const { data: pg } = await consulta6m;
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
    for (let d = new Date(`${inicio6m}T00:00:00Z`); d.toISOString().slice(0, 10) <= fimSerie; d.setUTCDate(d.getUTCDate() + 1)) {
      const dia = d.toISOString().slice(0, 10);
      serieDiaria.push({ dia, vendas: porDia6m.get(dia) ?? 0 });
    }
  }
  // meta total do mês (metas por vendedora) e dias úteis (seg–sáb)
  // meta da evolução diária = MESMA régua do card "Meta do mês" (23/09/2026):
  // meta por unidade cadastrada (BN/VTX 30) ou derivada dos agentes ativos
  // (Altamira), com coordenadores fora da soma (0094)
  const [{ data: metasMesRows }, { data: metasPopMes }, { data: vendsMeta }] = await Promise.all([
    admin
      .from("metas")
      .select("quantidade_vendas, referencia_id")
      .eq("mes_ano", mesAtual)
      .eq("escopo", "vendedora"),
    admin
      .from("metas")
      .select("quantidade_vendas, referencia_id")
      .eq("mes_ano", mesAtual)
      .eq("escopo", "pop"),
    admin.from("vendedores").select("id, pop_id, eh_coordenador").eq("ativo", true),
  ]);
  const metaVendPorId = new Map(
    (metasMesRows ?? []).map((m) => [m.referencia_id as string, Number(m.quantidade_vendas ?? 0)])
  );
  const somaAgentesDoPop = (pid: string) =>
    (vendsMeta ?? [])
      .filter((v) => !v.eh_coordenador && v.pop_id === pid)
      .reduce((t, v) => t + (metaVendPorId.get(v.id as string) ?? 0), 0);
  const metaUnidade = (pid: string) =>
    Number((metasPopMes ?? []).find((m) => m.referencia_id === pid)?.quantidade_vendas ?? 0) ||
    somaAgentesDoPop(pid);
  const metaMensalTotal = timeDoMes
    ? (metasMesRows ?? [])
        .filter((m) => timeDoMes.includes(m.referencia_id as string))
        .reduce((t, m) => t + Number(m.quantidade_vendas ?? 0), 0)
    : popSupervisor
      ? metaUnidade(popSupervisor)
      : d.pops.reduce((t, p) => t + metaUnidade(p.id), 0);
  // sem meta de POP cadastrada, vale a derivada (soma dos agentes ativos)
  const popsAbaixo = d.vendasPorPop.filter((p) => {
    const pid = d.pops.find((x) => x.nome.toLowerCase() === p.pop.toLowerCase())?.id;
    const meta = metaPorPop.get(p.pop.toLowerCase()) || (pid ? metaUnidade(pid) : 0);
    return meta > 0 && p.vendas / meta < 0.7;
  });
  const diasUteisMes = (() => {
    const d = new Date(`${mesAtual}T00:00:00Z`);
    let n = 0;
    while (d.toISOString().slice(0, 7) === mesAtual.slice(0, 7)) {
      if (d.getUTCDay() !== 0) n += 1; // seg–sáb
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return n;
  })();

  // META GERAL 2026 (30/09/2026): fechar o ano com 10.000 ativos — soma da
  // base ativa atual das 3 unidades (crescimento_base, atualizado 1x/dia)
  const META_ATIVOS_2026 = 10_000;

  // base das unidades (Relatórios > Crescimento do SGP, sincronizado 1x/dia)
  const { data: baseUnidades } = await admin
    .from("crescimento_base")
    .select("mes, unidade, ativos, novos, cancelados_mes, cancelados_acum, suspensos, atualizado_em")
    .order("mes");
  const nomePopSupervisor = popSupervisor
    ? (d.pops.find((p) => p.id === popSupervisor)?.nome ?? null)
    : null;
  const unidadesBase = (timeIds ? [] : ["Altamira", "Vitória do Xingu", "Brasil Novo"])
    .filter((u) => !nomePopSupervisor || u === nomePopSupervisor)
    .map((unidade) => {
      const serie = (baseUnidades ?? []).filter((b) => b.unidade === unidade).slice(-6);
      return { unidade, serie };
    })
    .filter((u) => u.serie.length > 0);
  const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const baseAtualPorUnidade = ["Altamira", "Vitória do Xingu", "Brasil Novo"]
    .map((unidade) => {
      const serie = (baseUnidades ?? []).filter((b) => b.unidade === unidade);
      const atual = serie[serie.length - 1];
      return atual ? { unidade, ativos: Number(atual.ativos ?? 0) } : null;
    })
    .filter(Boolean) as { unidade: string; ativos: number }[];
  const ativosTotal = baseAtualPorUnidade.reduce((t, u) => t + u.ativos, 0);
  const atualizadoEm = (baseUnidades ?? [])
    .map((b) => (b as { atualizado_em?: string }).atualizado_em ?? "")
    .sort()
    .at(-1);

  // ritmo para a meta do ano: ativos que faltam ÷ dias até 31/12
  const faltamAtivos = Math.max(0, META_ATIVOS_2026 - ativosTotal);
  const diasAteFimDoAno = Math.round(
    (Date.parse("2026-12-31T00:00:00Z") - Date.parse(`${hojeStm}T00:00:00Z`)) / 86_400_000
  );
  const ritmoMetaAno = faltamAtivos > 0 && diasAteFimDoAno > 0 ? Math.ceil(faltamAtivos / diasAteFimDoAno) : null;
  const escalaMetaAno = Math.max(META_ATIVOS_2026, ativosTotal);
  const COR_UNIDADE = ["bg-white", "bg-[#9db8ff]", "bg-[#5b82e6]"];
  const FAROL_PONTO = { verde: "bg-emerald-600", amarelo: "bg-amber-500", vermelho: "bg-rose-600" } as const;

  const deltaVendas =
    d.vendasPeriodoAnterior === 0
      ? null
      : (d.vendasPeriodo - d.vendasPeriodoAnterior) / d.vendasPeriodoAnterior;

  const alertas = [
    {
      titulo: "Ativações paradas",
      sub: "Há mais de 7 dias sem andamento",
      qtd: d.ativacoesPendentes.emAlerta,
      href: "/esteira",
      ponto: "bg-rose-600",
    },
    {
      titulo: "Assinaturas pendentes",
      sub: "Contratos há 48h ou mais sem assinatura",
      qtd: d.pendentesAssinatura.emAlerta,
      href: "/esteira",
      ponto: "bg-amber-500",
    },
    {
      titulo: "POPs abaixo da meta",
      sub: popsAbaixo.length
        ? `${popsAbaixo.map((p) => p.pop).join(", ")} abaixo de 70% da meta mensal`
        : "Todas as POPs no ritmo",
      qtd: popsAbaixo.length,
      href: "/vendedoras",
      ponto: "bg-amber-500",
    },
    ...(ehGestor
      ? [
          {
            titulo: "Vendas aguardando decisão",
            sub: "Pendentes de liberação da Administração",
            qtd: aguardandoDecisao,
            href: "/metas/aprovacoes",
            ponto: "bg-amber-500",
          },
        ]
      : []),
  ];
  const totalAlertas = alertas.reduce((s, a) => s + a.qtd, 0);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CabecalhoPagina
          titulo="Dashboard geral"
          descricao={
            ehGestor
              ? `Visão consolidada · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
              : `${timeIds ? "Seu time" : "Sua POP"} · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
          }
        />
        <a
          href="/tv/comercial"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-5 inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-[13px] font-medium transition-colors hover:bg-muted"
        >
          <Tv className="h-4 w-4" /> Modo TV
        </a>
      </div>

      <FiltrosDashboard pops={d.pops} mostrarPop={ehGestor} de={periodo.de} ate={periodo.ate} />

      {/* coordenador de unidade (22/09/2026): sem o trilho de alertas/ações
          rápidas — o dashboard dele é só o resultado do POP */}
      <div className={popSupervisor || timeIds ? "grid gap-4" : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]"}>
        {/* coluna principal */}
        <div className="space-y-4">
          {/* números do período numa faixa só; o 5º ocupa a sobra até caberem 5 colunas */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-sm sm:grid-cols-3 2xl:grid-cols-5">
            <Kpi rotulo={`Vendas ${ROTULO_PERIODO[periodo.tipo]}`} valor={formatarNumero(d.vendasPeriodo)}>
              {deltaVendas !== null && (
                <>
                  <span className={deltaVendas >= 0 ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                    {deltaVendas >= 0 ? "+" : "−"}
                    {formatarPercentual(Math.abs(deltaVendas), 0)}
                  </span>{" "}
                  vs período anterior
                </>
              )}
            </Kpi>
            <Kpi rotulo="Receita contratada" valor={formatarMoedaKpi(d.receitaPeriodo)}>
              em {formatarNumero(d.vendasPeriodo)} {d.vendasPeriodo === 1 ? "venda" : "vendas"}
            </Kpi>
            <Kpi rotulo="Ticket médio" valor={formatarMoeda(d.ticketMedioPeriodo)}>
              por venda
            </Kpi>
            <Kpi rotulo="Meta do mês" valor={d.metaMensal ? formatarPercentual(d.percentualMeta, 0) : "—"}>
              {d.metaMensal ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${FAROL_PONTO[d.farol] ?? "bg-slate-400"}`} />
                  {d.paceNecessario > 0
                    ? `${d.paceNecessario.toFixed(1).replace(".", ",")} por dia útil para a meta de ${formatarNumero(d.metaMensal)}`
                    : `Meta de ${formatarNumero(d.metaMensal)} batida`}
                </span>
              ) : (
                "sem meta cadastrada"
              )}
            </Kpi>
            <Kpi
              className="col-span-2 2xl:col-span-1"
              rotulo="Ativações pendentes"
              valor={formatarNumero(d.ativacoesPendentes.total)}
            >
              {d.ativacoesPendentes.foraDoPeriodo > 0 ? (
                `mais ${formatarNumero(d.ativacoesPendentes.foraDoPeriodo)} de vendas anteriores ao período`
              ) : d.ativacoesPendentes.emAlerta > 0 ? (
                <span className="font-medium text-rose-700">{d.ativacoesPendentes.emAlerta} em alerta</span>
              ) : (
                "nenhuma em alerta"
              )}
            </Kpi>
          </div>

          {/* META GERAL 2026: 10.000 ativos (soma das 3 bases, 1x/dia) — único bloco escuro da tela */}
          {ativosTotal > 0 && (
            <section className="rounded-xl bg-interlig-marinho p-5 text-white sm:p-6" aria-label="Meta de 2026">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div>
                  <p className="text-[13px] leading-5 text-sky-100/80">
                    Meta de 2026, fechar o ano com {META_ATIVOS_2026.toLocaleString("pt-BR")} ativos
                  </p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-4xl font-medium tabular-nums tracking-tight sm:text-5xl">
                      {ativosTotal.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-sm text-sky-100/80">
                      ativos hoje, {((ativosTotal / META_ATIVOS_2026) * 100).toFixed(1).replace(".", ",")}% da meta
                    </span>
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-2xl font-medium tabular-nums leading-7">
                    {faltamAtivos > 0 ? `Faltam ${faltamAtivos.toLocaleString("pt-BR")}` : "Meta batida"}
                  </p>
                  <p className="text-[13px] leading-5 text-sky-100/80">
                    até 31/12/2026
                    {ritmoMetaAno ? `, cerca de ${ritmoMetaAno.toLocaleString("pt-BR")} por dia` : ""}
                    {atualizadoEm ? ` · atualizado ${new Date(atualizadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit" })}` : ""}
                  </p>
                </div>
              </div>
              <div
                className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded bg-white/15"
                role="img"
                aria-label={`${ativosTotal.toLocaleString("pt-BR")} de ${META_ATIVOS_2026.toLocaleString("pt-BR")} ativos`}
              >
                {baseAtualPorUnidade.map((u, i) => (
                  <span
                    key={u.unidade}
                    className={`h-full ${COR_UNIDADE[i % COR_UNIDADE.length]}`}
                    style={{ width: `${(u.ativos / escalaMetaAno) * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[11px] leading-4 tabular-nums text-sky-100/70">
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <span key={f}>{Math.round(escalaMetaAno * f).toLocaleString("pt-BR")}</span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-sky-100/80">
                {baseAtualPorUnidade.map((u, i) => (
                  <span key={u.unidade} className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-sm ${COR_UNIDADE[i % COR_UNIDADE.length]}`} />
                    {u.unidade}
                    <span className="font-medium tabular-nums text-white">{u.ativos.toLocaleString("pt-BR")}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* evolução de vendas — modelo do mock 04/09 (diário/semanal/mensal) */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <EvolucaoVendas
                serie={serieDiaria}
                metaMensal={metaMensalTotal}
                diasUteisMes={diasUteisMes}
                inicio={periodo.de}
                fim={fimSerie}
                hoje={hojeStm}
              />
            </CardContent>
          </Card>

          {/* base das unidades — Relatórios > Crescimento do SGP (1x/dia); tabela em vez de três gráficos iguais */}
          {unidadesBase.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Base das unidades</CardTitle>
                <p className="text-[13px] text-muted-foreground">
                  Residencial e corporativo, últimos 6 meses. Fonte: SGP, relatório Crescimento, atualizado diariamente
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] border-collapse text-sm tabular-nums">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 text-left font-normal">Unidade</th>
                        <th className="pb-2 pr-4 text-right font-normal">Ativos</th>
                        <th className="pb-2 pr-4 text-right font-normal">Cancelados</th>
                        <th className="pb-2 pr-4 text-right font-normal">Suspensos</th>
                        <th className="pb-2 pr-4 text-right font-normal">Parte da base</th>
                        <th className="pb-2 text-right font-normal">
                          Ativos, {MES_CURTO[Number(unidadesBase[0].serie[0].mes.slice(5, 7)) - 1].toLowerCase()} a{" "}
                          {MES_CURTO[Number(unidadesBase[0].serie[unidadesBase[0].serie.length - 1].mes.slice(5, 7)) - 1].toLowerCase()}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {unidadesBase.map(({ unidade, serie }) => {
                        const atual = serie[serie.length - 1];
                        const parte = ativosTotal > 0 ? (Number(atual.ativos) / ativosTotal) * 100 : 0;
                        return (
                          <tr key={unidade} className="border-t">
                            <td className="whitespace-nowrap py-3 pr-4 font-medium">{unidade}</td>
                            <td className="py-3 pr-4 text-right">{atual.ativos.toLocaleString("pt-BR")}</td>
                            <td
                              className="py-3 pr-4 text-right"
                              title={`${atual.cancelados_mes} no mês`}
                            >
                              {atual.cancelados_acum.toLocaleString("pt-BR")}
                            </td>
                            <td className="py-3 pr-4 text-right">{atual.suspensos.toLocaleString("pt-BR")}</td>
                            <td className="w-[26%] py-3 pr-4">
                              <div className="flex items-center justify-end gap-3">
                                <span className="h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-muted">
                                  <span className="block h-full rounded-full bg-slate-500" style={{ width: `${Math.min(100, parte)}%` }} />
                                </span>
                                <span className="w-12 text-right">{parte.toFixed(1).replace(".", ",")}%</span>
                              </div>
                            </td>
                            <td className="py-3">
                              <LinhaAtivos
                                valores={serie.map((b) => Number(b.ativos))}
                                titulo={serie
                                  .map((b) => `${MES_CURTO[Number(b.mes.slice(5, 7)) - 1]}: ${Number(b.ativos).toLocaleString("pt-BR")}`)
                                  .join(" · ")}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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

        {/* trilho lateral (gestor e direção) */}
        {!popSupervisor && !timeIds && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-1">
              <div className="flex items-baseline justify-between">
                <CardTitle className="text-sm">Alertas e prioridades</CardTitle>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{totalAlertas}</span>
              </div>
            </CardHeader>
            <CardContent className="divide-y">
              {alertas.map((a) => (
                <Link
                  key={a.titulo}
                  href={a.href}
                  className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors last:pb-1 hover:bg-muted/60"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.qtd > 0 ? a.ponto : "bg-emerald-600"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] font-medium leading-5 ${a.qtd > 0 ? "" : "text-muted-foreground"}`}>
                      {a.titulo}
                    </span>
                    <span className="block text-xs leading-4 text-muted-foreground">{a.sub}</span>
                  </span>
                  <span className={`text-xl font-medium tabular-nums leading-6 ${a.qtd > 0 ? "" : "text-muted-foreground"}`}>
                    {a.qtd}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Ações rápidas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Link
                href="/crm/novo"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Novo ticket
              </Link>
              {ehGestor ? (
                <Link
                  href="/metas/aprovacoes"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-2 text-[13px] font-medium transition-colors hover:bg-muted"
                >
                  <ListChecks className="h-4 w-4" /> Pendências
                </Link>
              ) : (
                <Link
                  href="/esteira"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-2 text-[13px] font-medium transition-colors hover:bg-muted"
                >
                  <ListChecks className="h-4 w-4" /> Esteira
                </Link>
              )}
              {ehGestor && (
                <Link
                  href="/financeiro"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-2 text-[13px] font-medium transition-colors hover:bg-muted"
                >
                  <Receipt className="h-4 w-4" /> Financeiro
                </Link>
              )}
              <Link
                href={`/dashboard?periodo=${periodo.tipo}${popFiltro ? `&pop=${popFiltro}` : ""}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-2 text-[13px] font-medium transition-colors hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" /> Atualizar
              </Link>
            </CardContent>
          </Card>
        </div>
        )}
      </div>
    </>
  );
}
