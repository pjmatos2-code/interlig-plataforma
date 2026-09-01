"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  PlugZap,
  LifeBuoy,
  Undo2,
  Wallet,
  RefreshCw,
  Users,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FotoTecnico } from "@/components/tecnica/foto-tecnico";
import { formatarMoeda, formatarData } from "@/lib/format";
import type { TecnicaMes, OsLinha } from "@/lib/tecnica/dados";
import { sincronizarOsDoMes } from "./acoes";

/** Painel da Equipe Técnica — layout aprovado (01/09): KPIs · ranking com
 * foto · lista paginada · resumo da comissão · alertas · tendência. */

const UNIDADE: Record<string, string> = { atm: "Altamira", bn: "Brasil Novo", vtx: "VTX" };
const POR_PAGINA = 50;

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

function chipCategoria(l: OsLinha) {
  if (l.retornoOsId && l.categoria !== "outros")
    return <span className="whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">retorno 72h — não pontua</span>;
  if (!l.encerradaNoMes && (l.status ?? "").toLowerCase() === "encerrada")
    return <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">encerrada fora do mês</span>;
  if (l.categoria === "ativacao")
    return <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">ativação/mudança</span>;
  if (l.categoria === "suporte")
    return <span className="whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">suporte</span>;
  return <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">não comissionada</span>;
}

const mesCurto = (iso: string) => {
  const m = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return m[Number(iso.slice(5, 7)) - 1];
};

export function PainelTecnica({
  dados,
  baseSgp,
  ehGestor,
}: {
  dados: TecnicaMes;
  baseSgp: string | null;
  ehGestor: boolean;
}) {
  const router = useRouter();
  const [fTecnico, setFTecnico] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [soEncerradas, setSoEncerradas] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [rankingCompleto, setRankingCompleto] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const linhas = useMemo(() => {
    let ls = dados.linhas;
    if (soEncerradas) ls = ls.filter((l) => l.encerradaNoMes);
    if (fCategoria === "retorno") ls = ls.filter((l) => l.retornoOsId && l.categoria !== "outros");
    else if (fCategoria) ls = ls.filter((l) => l.categoria === fCategoria);
    if (fTecnico) {
      const t = dados.tecnicos.find((x) => x.tecnicoId === fTecnico);
      const nome = (t?.nome ?? "").toLowerCase().split(" ").slice(0, 2).join(" ");
      ls = ls.filter(
        (l) =>
          (l.responsavel ?? "").toLowerCase().includes(nome) ||
          (l.auxiliares ?? "").toLowerCase().includes(nome)
      );
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      ls = ls.filter(
        (l) =>
          (l.cliente ?? "").toLowerCase().includes(q) ||
          (l.sgpContratoId ?? "").includes(q) ||
          l.sgpOsId.includes(q)
      );
    }
    return ls;
  }, [dados, fTecnico, fCategoria, busca, soEncerradas]);

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPaginas);
  const visiveis = linhas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  const deltaEncerradas =
    dados.totais.encerradasMesAnterior && dados.totais.encerradasMesAnterior > 0
      ? ((dados.totais.encerradas - dados.totais.encerradasMesAnterior) / dados.totais.encerradasMesAnterior) * 100
      : null;

  const semOs = dados.tecnicos.filter(
    (t) => t.ativacoes + t.suportes + t.outras + t.anuladasRetorno === 0 && !t.ajuste
  );
  const ranking = rankingCompleto ? dados.tecnicos : dados.tecnicos.slice(0, 6);
  const maxTend = Math.max(1, ...dados.tendencia.map((t) => t.encerradas));

  function irPagina(p: number) {
    setPagina(Math.max(1, Math.min(totalPaginas, p)));
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi icone={<Wrench className="h-4 w-4" />} cor="#0284c7" rotulo="OS encerradas no mês" valor={String(dados.totais.encerradas)}
          sub={deltaEncerradas !== null ? `${deltaEncerradas >= 0 ? "+" : ""}${deltaEncerradas.toFixed(1).replace(".", ",")}% vs mês anterior` : "sem base anterior"} />
        <Kpi icone={<PlugZap className="h-4 w-4" />} cor="#059669" rotulo="Ativações + mudanças" valor={String(dados.totais.ativacoes)} sub="pontuam por unidade" />
        <Kpi icone={<LifeBuoy className="h-4 w-4" />} cor="#2563eb" rotulo="Suportes pontuados" valor={String(dados.totais.suportes)} sub="R$ 10 (habilitados)" />
        <Kpi icone={<Undo2 className="h-4 w-4" />} cor="#e11d48" rotulo="Anuladas por retorno" valor={String(dados.totais.anuladasRetorno)} sub="nova OS em <72h" />
        <Kpi icone={<Users className="h-4 w-4" />} cor="#7c3aed" rotulo="Técnicos ativos" valor={String(dados.tecnicos.length)} sub="equipe operacional" />
        <Kpi icone={<Wallet className="h-4 w-4" />} cor="#059669" rotulo="Comissão do setor" valor={formatarMoeda(dados.totais.comissao)} sub="prévia — muda até fechar" />
      </div>

      {/* filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-4">
          <form method="get" className="flex items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-[11px] text-muted-foreground">Competência</span>
              <input type="month" name="mes" defaultValue={dados.competencia.slice(0, 7)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Aplicar</button>
          </form>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] text-muted-foreground">Técnico</span>
            <select value={fTecnico} onChange={(e) => { setFTecnico(e.target.value); setPagina(1); }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos</option>
              {dados.tecnicos.map((t) => <option key={t.tecnicoId} value={t.tecnicoId}>{t.nome}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] text-muted-foreground">Categoria</span>
            <select value={fCategoria} onChange={(e) => { setFCategoria(e.target.value); setPagina(1); }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todas</option>
              <option value="ativacao">Ativação/mudança</option>
              <option value="suporte">Suporte</option>
              <option value="retorno">Anuladas por retorno</option>
              <option value="outros">Não comissionadas</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] text-muted-foreground">Busca (cliente, contrato, OS)</span>
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Ex.: 80205"
              className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={soEncerradas} onChange={(e) => { setSoEncerradas(e.target.checked); setPagina(1); }} />
            Somente encerradas no mês
          </label>
          <div className="ml-auto flex items-center gap-2">
            {aviso && <span className="max-w-[16rem] text-xs text-muted-foreground">{aviso}</span>}
            {(busca || fTecnico || fCategoria) && (
              <button type="button" onClick={() => { setBusca(""); setFTecnico(""); setFCategoria(""); setPagina(1); }}
                className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted">
                Limpar
              </button>
            )}
            {ehGestor && (
              <button
                type="button"
                disabled={sincronizando}
                onClick={async () => {
                  setSincronizando(true);
                  setAviso(null);
                  const r = await sincronizarOsDoMes(dados.competencia);
                  setSincronizando(false);
                  setAviso(r.erro ?? r.ok ?? null);
                  router.refresh();
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
                {sincronizando ? "Buscando no SGP…" : "Sincronizar com o SGP"}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ranking | lista | resumo */}
      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_20rem]">
        {/* ranking dos técnicos */}
        <Card className="self-start">
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-base">Ranking dos técnicos</CardTitle>
              <span className="text-[11px] text-muted-foreground">Comissão (R$)</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {ranking.map((t, i) => (
              <button
                key={t.tecnicoId}
                type="button"
                onClick={() => { setFTecnico(fTecnico === t.tecnicoId ? "" : t.tecnicoId); setPagina(1); }}
                className={`w-full rounded-xl border bg-card p-2.5 text-left transition ${
                  fTecnico === t.tecnicoId ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">{i + 1}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <FotoTecnico tecnicoId={t.tecnicoId} nome={t.nome} fotoUrl={t.foto} podeEditar={ehGestor} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.nome}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {UNIDADE[t.unidade] ?? t.unidade}{t.recebeSuporte ? " · suporte" : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-emerald-700">{formatarMoeda(t.comissao)}</p>
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span>Ativ. <strong className="text-foreground">{t.ativacoes}</strong></span>
                  <span>Sup. <strong className="text-foreground">{t.suportes}</strong></span>
                  <span>Retorno <strong className={t.anuladasRetorno > 0 ? "text-rose-700" : "text-foreground"}>
                    {t.anuladasRetorno}{t.valorAnuladoRetorno > 0 ? ` (−R$ ${t.valorAnuladoRetorno})` : ""}
                  </strong></span>
                  <span>T. médio <strong className="text-foreground">{t.tempoMedioHoras !== null ? `${t.tempoMedioHoras.toFixed(1).replace(".", ",")}h` : "—"}</strong></span>
                </div>
                {t.ajuste && (
                  <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-[10px] text-sky-800" title={t.ajuste.motivo}>
                    ⚙ ajuste da gestão ({t.ajuste.modo === "substituir" ? "substitui o cálculo" : "soma"}): {formatarMoeda(t.ajuste.valor)}
                  </p>
                )}
              </button>
            ))}
            {dados.tecnicos.length > 6 && (
              <button type="button" onClick={() => setRankingCompleto(!rankingCompleto)}
                className="w-full rounded-md border px-3 py-2 text-center text-xs font-medium hover:bg-muted">
                {rankingCompleto ? "Mostrar só o top 6" : `Ver ranking completo (${dados.tecnicos.length}) →`}
              </button>
            )}
          </CardContent>
        </Card>

        {/* ordens de serviço */}
        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Ordens de serviço <span className="text-sm font-normal text-muted-foreground">· {linhas.length} registro(s)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[50rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">OS</th>
                    <th className="px-2 py-2 font-medium">Cliente</th>
                    <th className="px-2 py-2 font-medium">POP</th>
                    <th className="px-2 py-2 font-medium">Motivo</th>
                    <th className="px-2 py-2 font-medium">Encerrada</th>
                    <th className="px-2 py-2 font-medium">Técnico</th>
                    <th className="px-2 py-2 font-medium">Situação</th>
                    <th className="px-2 py-2 text-right font-medium">R$</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => {
                    const valor = Object.values(l.valorPorTecnico).reduce((s, v) => s + v, 0);
                    return (
                      <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                          {baseSgp ? (
                            <a href={`${baseSgp}/atendimento/relatorios/ocorrencia/os/?os_id=${l.sgpOsId}`} target="_blank" rel="noopener noreferrer"
                              className="text-interlig-ceu hover:underline">#{l.sgpOsId} ↗</a>
                          ) : `#${l.sgpOsId}`}
                        </td>
                        <td className="max-w-[13rem] truncate px-2 py-2">
                          {l.cliente ?? "—"}
                          {l.sgpContratoId && <span className="ml-1 font-mono text-[10px] text-muted-foreground">ct {l.sgpContratoId}</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{l.pop ?? "—"}</td>
                        <td className="max-w-[10rem] truncate px-2 py-2 text-xs">{l.motivo ?? "—"}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted-foreground">
                          {l.encerradaEm ? formatarData(l.encerradaEm.slice(0, 10)) : l.status ?? "—"}
                        </td>
                        <td className="max-w-[10rem] truncate px-2 py-2 text-xs">{l.responsavel ?? "—"}</td>
                        <td className="px-2 py-2">{chipCategoria(l)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                          {valor > 0 ? formatarMoeda(valor) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma OS com esses filtros — use “Sincronizar com o SGP” para importar o mês.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPaginas > 1 && (
              <div className="flex items-center justify-end gap-1 px-4 pt-2">
                <button type="button" onClick={() => irPagina(pag - 1)} disabled={pag === 1}
                  className="rounded-md border p-1 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - pag) <= 1)
                  .map((p, i, arr) => (
                    <span key={p} className="flex items-center gap-1">
                      {i > 0 && arr[i - 1] !== p - 1 && <span className="text-xs text-muted-foreground">…</span>}
                      <button type="button" onClick={() => irPagina(p)}
                        className={`h-7 min-w-7 rounded-md px-1.5 text-xs font-medium ${p === pag ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
                        {p}
                      </button>
                    </span>
                  ))}
                <button type="button" onClick={() => irPagina(pag + 1)} disabled={pag === totalPaginas}
                  className="rounded-md border p-1 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* resumo + alertas */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Resumo da comissão</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Comissão estimada do setor</p>
                <p className="text-3xl font-bold tabular-nums">{formatarMoeda(dados.totais.comissao)}</p>
                <p className="text-[11px] text-muted-foreground">prévia — valor pode mudar até o fechamento</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2.5 text-xs">
                <p className="mb-1 font-semibold">Como calculamos</p>
                <p>✓ Ativação/mudança de endereço: ATM R$ 30 · BN/VTX R$ 15</p>
                <p>✓ Suporte pontuado (técnico habilitado): R$ 10</p>
                <p>✓ Retorno em até 72h: anula a OS de origem</p>
                <p>✓ Auxiliar pontua igual ao responsável</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold">Quebra por categoria</p>
                <div className="space-y-1 text-xs">
                  <p className="flex justify-between">
                    <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />Ativações + mudanças ({dados.totais.ativacoes})</span>
                    <strong className="tabular-nums">{formatarMoeda(dados.totais.quebra.valorAtivacoes)}</strong>
                  </p>
                  <p className="flex justify-between">
                    <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-500" />Suportes ({dados.totais.suportes})</span>
                    <strong className="tabular-nums">{formatarMoeda(dados.totais.quebra.valorSuportes)}</strong>
                  </p>
                  {dados.totais.quebra.ajustes !== 0 && (
                    <p className="flex justify-between">
                      <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-slate-400" />Ajustes da gestão</span>
                      <strong className="tabular-nums">{formatarMoeda(dados.totais.quebra.ajustes)}</strong>
                    </p>
                  )}
                  <p className="flex justify-between border-t pt-1 font-semibold">
                    <span>Total estimado</span>
                    <span className="tabular-nums">{formatarMoeda(dados.totais.comissao)}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" /> Alertas e regras</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="rounded-md border border-rose-200 bg-rose-50/60 px-2.5 py-2">
                <p className="font-medium text-rose-800">
                  {dados.totais.anuladasRetorno} OS anuladas por retorno (&lt;72h)
                </p>
                <p className="text-rose-700">Impacto estimado: −{formatarMoeda(dados.totais.impactoRetornos)}</p>
              </div>
              {semOs.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2">
                  <p className="font-medium text-amber-800">{semOs.length} técnico(s) sem OS no mês</p>
                  <p className="text-amber-700">{semOs.map((t) => t.nome).join(", ")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* performance + tendência */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Performance do mês</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">OS encerradas</p>
              <p className="text-2xl font-bold tabular-nums">{dados.totais.encerradas}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Comissionáveis (válidas)</p>
              <p className="text-2xl font-bold tabular-nums">{dados.totais.ativacoes + dados.totais.suportes}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vs mês anterior</p>
              <p className={`text-2xl font-bold tabular-nums ${deltaEncerradas !== null && deltaEncerradas < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {deltaEncerradas !== null ? `${deltaEncerradas >= 0 ? "+" : ""}${deltaEncerradas.toFixed(1).replace(".", ",")}%` : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Tendência — OS encerradas por mês</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-28 items-end justify-around gap-3 border-b pb-1">
              {dados.tendencia.map((t) => (
                <div key={t.mes} className="flex h-full w-14 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] font-semibold tabular-nums">{t.encerradas}</span>
                  <div className="w-full rounded-t-md bg-[#2563eb]" style={{ height: `${Math.max(4, (t.encerradas / maxTend) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="flex justify-around pt-1">
              {dados.tendencia.map((t) => (
                <span key={t.mes} className="w-14 text-center text-xs text-muted-foreground">{mesCurto(t.mes)}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
