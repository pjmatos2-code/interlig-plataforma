"use client";

import { useMemo, useState } from "react";
import {
  CircleDollarSign,
  TrendingUp,
  Clock3,
  Database,
  CalendarDays,
  Target,
} from "lucide-react";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoeda, formatarPercentual } from "@/lib/format";
import type { ApuracaoAndamento, LinhaApuracao } from "@/lib/comissao/financeiro";

/**
 * Apuração do mês corrente para o Financeiro — layout aprovado (31/08):
 * KPIs com ícone · resumo por agente · apuração detalhada · memória de
 * cálculo. Provisão, não pagamento: sem nenhuma ação, quem decide é a
 * Administração; o pagamento sai da competência fechada.
 */

const mesBr = (iso: string) => {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${meses[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
};

function Kpi({
  icone,
  cor,
  rotulo,
  valor,
  sub,
}: {
  icone: React.ReactNode;
  cor: string;
  rotulo: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-card p-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${cor}18`, color: cor }}
      >
        {icone}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-muted-foreground">{rotulo}</p>
        <p className="truncate text-lg font-semibold tabular-nums leading-tight">{valor}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Barra({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: cor }} />
    </div>
  );
}

const corAting = (pct: number) => (pct >= 100 ? "#059669" : pct >= 80 ? "#2563eb" : "#d97706");

function ChipAting({ pct }: { pct: number }) {
  const cls =
    pct >= 100 ? "bg-emerald-100 text-emerald-800" : pct >= 80 ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${cls}`}>{pct.toFixed(1).replace(".", ",")}%</span>;
}

/** memória de cálculo do agente selecionado — o "por que esse valor?".
 * Cada setor tem a própria régua, e os rótulos acompanham: venda (meta),
 * refidelização (aditivos assinados) e retenção (taxa sobre elegíveis). */
const ROTULOS = {
  comercial: {
    liberadas: "Vendas liberadas", pendentes: "Vendas pendentes", meta: "Meta",
    ating: "Atingimento", atingPasso: "Atingimento da meta", base: "Base do cálculo",
    comissao: "Comissão liberada", potencial: "Potencial pendente",
    compLib: "Liberadas", compPend: "Pendentes",
  },
  refidelizacao: {
    liberadas: "Aditivos aprovados (2 assinaturas)", pendentes: "Aguardando assinatura", meta: "Meta (planos)",
    ating: "Atingimento", atingPasso: "Atingimento da meta", base: "VTV refidelizado (mensal)",
    comissao: "Comissão liberada", potencial: "Potencial se todos assinarem",
    compLib: "Aprovados", compPend: "Aguard. assinatura",
  },
  retencao: {
    liberadas: "Clientes retidos (SGP)", pendentes: "Em risco (suspensos)", meta: "Elegíveis",
    ating: "Taxa de retenção", atingPasso: "Taxa = retidos / elegíveis", base: "VTV retido (mensal)",
    comissao: "Comissão liberada", potencial: "Potencial se os em risco reativarem",
    compLib: "Retidos", compPend: "Em risco",
  },
} as const;

function Memoria({ l, onFechar }: { l: LinhaApuracao; onFechar: () => void }) {
  const pct = l.atingimentoPct;
  const rot = ROTULOS[l.setor];
  const potencial = l.seLiberarPendentes - l.parcial;
  const total = l.vendasLiberadas + l.vendasPendentes;
  const passos: [string, string][] = [
    [rot.liberadas, String(l.vendasLiberadas)],
    ...(l.debitoQuantidade > 0
      ? [[l.debitoAplicado ? "Débito na meta (early churn)" : "Débito (não aplicado nesta competência)", `+${l.debitoQuantidade} · meta ${l.meta} → ${l.metaEfetiva}`] as [string, string]]
      : []),
    l.setor === "comercial"
      ? ([
          "Atingimento (a venda pontua ao ser cadastrada)",
          `${l.vendasLiberadas + l.vendasPendentes} cadastradas / ${l.metaEfetiva} = ${pct.toFixed(1).replace(".", ",")}% (${l.vendasLiberadas} liberadas + ${l.vendasPendentes} pendentes)`,
        ] as [string, string])
      : ([rot.atingPasso, `${l.vendasLiberadas} / ${l.metaEfetiva} = ${pct.toFixed(1).replace(".", ",")}%`] as [string, string]),
    ["Faixa aplicada", l.faixa],
    [rot.base, formatarMoeda(l.valorBase)],
    [rot.comissao, formatarMoeda(l.parcial)],
    ...(l.setor === "retencao" && l.estornos > 0
      ? [["Clawback (estorna na competência seguinte)", String(l.estornos)] as [string, string]]
      : []),
    ...(l.vendasPendentes > 0
      ? [
          [rot.pendentes, String(l.vendasPendentes)] as [string, string],
          [rot.potencial, formatarMoeda(potencial)] as [string, string],
        ]
      : []),
    ["Total projetado", formatarMoeda(l.seLiberarPendentes)],
  ];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Memória de cálculo</CardTitle>
        <button type="button" onClick={onFechar} className="text-muted-foreground hover:text-foreground">✕</button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2.5">
          <AvatarAgente nome={l.vendedora} foto={l.foto} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{l.vendedora}</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {l.setor !== "retencao" && pct >= 100 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">Meta batida</span>
              )}
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">Faixa {l.faixa}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          {[
            [rot.compLib, String(l.vendasLiberadas)],
            [rot.compPend, String(l.vendasPendentes)],
            [rot.meta, l.metaEfetiva !== l.meta ? `${l.meta} → ${l.metaEfetiva}` : String(l.meta)],
            [rot.ating, `${pct.toFixed(1).replace(".", ",")}%`],
          ].map(([r, v]) => (
            <div key={r} className="rounded-lg border p-2">
              <p className="text-muted-foreground">{r}</p>
              <p className="text-base font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold">Por que esse valor?</p>
          <div className="space-y-1">
            {passos.map(([r, v], i) => (
              <div key={r} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">{i + 1}</span>
                  <span className="truncate text-muted-foreground">{r}</span>
                </span>
                <span className="whitespace-nowrap font-medium tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* composição das vendas */}
        <div>
          <p className="mb-1 text-xs font-semibold">{l.setor === "comercial" ? "Composição das vendas" : l.setor === "refidelizacao" ? "Composição dos aditivos" : "Composição dos casos"}</p>
          <div className="flex items-center gap-3">
            <div
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
              style={{
                background: total
                  ? `conic-gradient(#2563eb 0deg ${(l.vendasLiberadas / total) * 360}deg, #f59e0b ${(l.vendasLiberadas / total) * 360}deg 360deg)`
                  : "#e5e7eb",
              }}
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-card text-[10px] font-semibold tabular-nums">{total}</div>
            </div>
            <div className="space-y-0.5 text-[11px]">
              <p><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#2563eb]" />{rot.compLib} <strong className="tabular-nums">{l.vendasLiberadas}{total ? ` (${Math.round((l.vendasLiberadas / total) * 100)}%)` : ""}</strong></p>
              <p><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f59e0b]" />{rot.compPend} <strong className="tabular-nums">{l.vendasPendentes}{total ? ` (${Math.round((l.vendasPendentes / total) * 100)}%)` : ""}</strong></p>
            </div>
          </div>
        </div>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          Prévia para provisão — os valores ainda mudam até o fechamento administrativo. O
          pagamento sai da competência fechada, na aba “A pagar”.
        </p>
      </CardContent>
    </Card>
  );
}

export function PainelApuracao({ dados }: { dados: ApuracaoAndamento }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ls = q ? dados.linhas.filter((l) => l.vendedora.toLowerCase().includes(q)) : dados.linhas;
    return [...ls].sort((a, b) => b.parcial - a.parcial);
  }, [dados.linhas, busca]);

  const sel = dados.linhas.find((l) => l.vendedorId === selecionado) ?? null;
  const metaBatida = dados.linhas.filter((l) => l.atingimentoPct >= 100).length;
  const baseTotal = dados.linhas.reduce((s, l) => s + l.valorBase, 0);

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
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi icone={<CircleDollarSign className="h-4 w-4" />} cor="#059669" rotulo="Comissão liberada" valor={formatarMoeda(dados.totais.parcial)} sub="prévia — muda até fechar" />
        <Kpi icone={<TrendingUp className="h-4 w-4" />} cor="#2563eb" rotulo="Projeção se liberar tudo" valor={formatarMoeda(dados.totais.seLiberarPendentes)} />
        <Kpi icone={<Clock3 className="h-4 w-4" />} cor="#d97706" rotulo="Pendências" valor={`${dados.totais.pendentes} vendas`} sub="aguardando a Administração" />
        <Kpi icone={<Database className="h-4 w-4" />} cor="#0284c7" rotulo="Base liberada (VTV)" valor={formatarMoeda(baseTotal)} />
        <Kpi icone={<CalendarDays className="h-4 w-4" />} cor="#7c3aed" rotulo="Competência" valor={mesBr(dados.competencia)} sub="período atual" />
        <Kpi icone={<Target className="h-4 w-4" />} cor="#059669" rotulo="Agentes com meta batida" valor={`${metaBatida} de ${dados.linhas.length}`} sub={dados.linhas.length ? `${Math.round((metaBatida / dados.linhas.length) * 100)}% da equipe` : undefined} />
      </div>

      {/* corpo: resumo | tabela | memória */}
      <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_21rem]">
        {/* resumo por agente */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Resumo por agente</p>
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar agente"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
          {linhas.slice(0, 6).map((l) => {
            const pct = l.atingimentoPct;
            return (
              <button
                key={l.vendedorId}
                type="button"
                onClick={() => setSelecionado(selecionado === l.vendedorId ? null : l.vendedorId)}
                className={`w-full rounded-xl border bg-card p-3 text-left transition ${
                  selecionado === l.vendedorId ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AvatarAgente nome={l.vendedora} foto={l.foto} tamanho="sm" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{l.vendedora}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatarMoeda(l.parcial)}</p>
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span>Liberadas <strong className="text-foreground">{l.vendasLiberadas}</strong></span>
                  <span>Pendentes <strong className="text-foreground">{l.vendasPendentes}</strong></span>
                  <span>Meta <strong className="text-foreground">{l.metaEfetiva}</strong></span>
                </div>
                <div className="mt-1.5">
                  <Barra pct={pct} cor={corAting(pct)} />
                </div>
                <p className="mt-1 text-right text-[11px] font-medium tabular-nums" style={{ color: corAting(pct) }}>
                  {pct.toFixed(1).replace(".", ",")}%
                </p>
              </button>
            );
          })}
          {linhas.length > 6 && (
            <p className="text-center text-[11px] text-muted-foreground">
              + {linhas.length - 6} agente(s) na tabela ao lado
            </p>
          )}
        </div>

        {/* apuração detalhada */}
        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Apuração detalhada</CardTitle>
            <p className="text-xs text-muted-foreground">
              Prévia para provisão — estes valores <strong>ainda mudam</strong> até o fechamento e não devem ser pagos.
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Agente</th>
                    <th className="px-2 py-2 text-center font-medium">Liberadas</th>
                    <th className="px-2 py-2 text-center font-medium">Pendentes</th>
                    <th className="px-2 py-2 text-center font-medium">Meta</th>
                    <th className="px-2 py-2 text-center font-medium">Atingimento</th>
                    <th className="px-2 py-2 font-medium">Faixa</th>
                    <th className="px-2 py-2 text-right font-medium">Comissão liberada</th>
                    <th className="px-2 py-2 text-right font-medium">Potencial pendente</th>
                    <th className="px-2 py-2 text-right font-medium">Total projetado</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const pct = l.atingimentoPct;
                    return (
                      <tr
                        key={l.vendedorId}
                        onClick={() => setSelecionado(l.vendedorId)}
                        className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${selecionado === l.vendedorId ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <AvatarAgente nome={l.vendedora} foto={l.foto} tamanho="sm" />
                            <span className="max-w-[9rem] truncate font-medium">{l.vendedora}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">{l.vendasLiberadas}</td>
                        <td className="px-2 py-2 text-center tabular-nums">
                          {l.vendasPendentes > 0 ? <span className="font-medium text-amber-700">{l.vendasPendentes}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">
                          {l.meta}
                          {l.metaEfetiva !== l.meta && <span className="text-xs text-muted-foreground"> → {l.metaEfetiva}</span>}
                        </td>
                        <td className="px-2 py-2 text-center"><ChipAting pct={pct} /></td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">{l.faixa}</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">{formatarMoeda(l.parcial)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {l.seLiberarPendentes - l.parcial > 0 ? formatarMoeda(l.seLiberarPendentes - l.parcial) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatarMoeda(l.seLiberarPendentes)}</td>
                        <td className="px-2 py-2">
                          <span className="whitespace-nowrap text-[11px] text-primary underline">Ver memória</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 font-semibold">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-2 py-2 text-center tabular-nums">{dados.linhas.reduce((s, l) => s + l.vendasLiberadas, 0)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{dados.totais.pendentes}</td>
                    <td colSpan={3} />
                    <td className="px-2 py-2 text-right tabular-nums">{formatarMoeda(dados.totais.parcial)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatarMoeda(dados.totais.seLiberarPendentes - dados.totais.parcial)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatarMoeda(dados.totais.seLiberarPendentes)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            {dados.totais.pendentes > 0 && (
              <p className="px-4 pt-2 text-xs text-muted-foreground">
                ℹ {dados.totais.pendentes} venda(s) aguardando liberação da Administração — a diferença entre
                comissão liberada e projeção representa o potencial ainda não fechado.
              </p>
            )}
          </CardContent>
        </Card>

        {/* memória de cálculo */}
        <div>
          {sel ? (
            <Memoria l={sel} onFechar={() => setSelecionado(null)} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Selecione um agente (ou “Ver memória”) para abrir a memória de cálculo.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
