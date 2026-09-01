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
  Clock3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { formatarMoeda, formatarData } from "@/lib/format";
import type { TecnicaMes, OsLinha } from "@/lib/tecnica/dados";
import { sincronizarOsDoMes } from "./acoes";

/** Painel da Equipe Técnica — mesmo padrão visual dos demais setores. */

const UNIDADE: Record<string, string> = { atm: "Altamira", bn: "Brasil Novo", vtx: "VTX" };

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
    return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">retorno 72h — não pontua</span>;
  if (l.categoria === "ativacao")
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">ativação/mudança</span>;
  if (l.categoria === "suporte")
    return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">suporte</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">não comissionada</span>;
}

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

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi icone={<Wrench className="h-4 w-4" />} cor="#0284c7" rotulo="OS encerradas" valor={String(dados.totais.encerradas)} sub="no mês" />
        <Kpi icone={<PlugZap className="h-4 w-4" />} cor="#059669" rotulo="Ativações + mudanças" valor={String(dados.totais.ativacoes)} sub="pontuam por unidade" />
        <Kpi icone={<LifeBuoy className="h-4 w-4" />} cor="#2563eb" rotulo="Suportes pontuados" valor={String(dados.totais.suportes)} sub="R$ 10 (habilitados)" />
        <Kpi icone={<Undo2 className="h-4 w-4" />} cor="#e11d48" rotulo="Anuladas por retorno" valor={String(dados.totais.anuladasRetorno)} sub="nova OS em <72h" />
        <Kpi icone={<Clock3 className="h-4 w-4" />} cor="#7c3aed" rotulo="Técnicos ativos" valor={String(dados.tecnicos.length)} />
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
            <select value={fTecnico} onChange={(e) => setFTecnico(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos</option>
              {dados.tecnicos.map((t) => <option key={t.tecnicoId} value={t.tecnicoId}>{t.nome}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] text-muted-foreground">Categoria</span>
            <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}
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
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: 80205"
              className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={soEncerradas} onChange={(e) => setSoEncerradas(e.target.checked)} />
            Somente encerradas no mês
          </label>
          <div className="ml-auto flex items-center gap-2">
            {aviso && <span className="max-w-[16rem] text-xs text-muted-foreground">{aviso}</span>}
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

      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        {/* técnicos */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Técnicos</p>
          {dados.tecnicos.map((t) => (
            <button
              key={t.tecnicoId}
              type="button"
              onClick={() => setFTecnico(fTecnico === t.tecnicoId ? "" : t.tecnicoId)}
              className={`w-full rounded-xl border bg-card p-3 text-left transition ${
                fTecnico === t.tecnicoId ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <AvatarAgente nome={t.nome} foto={t.foto} tamanho="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {UNIDADE[t.unidade] ?? t.unidade}{t.recebeSuporte ? " · suporte" : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-emerald-700">{formatarMoeda(t.comissao)}</p>
              </div>
              {t.ajuste && (
                <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-[10px] text-sky-800" title={t.ajuste.motivo}>
                  ⚙ ajuste da gestão ({t.ajuste.modo === "substituir" ? "substitui o cálculo" : "soma"}):{" "}
                  {formatarMoeda(t.ajuste.valor)}
                </p>
              )}
              <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>Ativ. <strong className="text-foreground">{t.ativacoes}</strong></span>
                <span>Sup. <strong className="text-foreground">{t.suportes}</strong></span>
                <span>Retorno <strong className={t.anuladasRetorno > 0 ? "text-rose-700" : "text-foreground"}>
                  {t.anuladasRetorno}{t.valorAnuladoRetorno > 0 ? ` (−R$ ${t.valorAnuladoRetorno})` : ""}
                </strong></span>
                <span>Tempo médio <strong className="text-foreground">{t.tempoMedioHoras !== null ? `${t.tempoMedioHoras.toFixed(1).replace(".", ",")}h` : "—"}</strong></span>
              </div>
            </button>
          ))}
        </div>

        {/* lista de OS */}
        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Ordens de serviço <span className="text-sm font-normal text-muted-foreground">· {linhas.length} registro(s)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="max-h-[38rem] overflow-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="sticky top-0 z-10 bg-background">
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
                  {linhas.slice(0, 300).map((l) => {
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
                  {linhas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma OS com esses filtros — use “Sincronizar com o SGP” para importar o mês.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {linhas.length > 300 && (
              <p className="px-4 pt-2 text-xs text-muted-foreground">Mostrando 300 de {linhas.length} — refine os filtros.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
