"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  CircleDollarSign,
  Wallet,
  Target,
  Eye,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { formatarData, formatarMoeda, formatarPercentual } from "@/lib/format";
import type { AditivoLinha, ResultadoAgente } from "@/lib/refidelizacao/dados";
import { META_REFIDELIZACAO } from "@/lib/refidelizacao/regras";
import { sincronizar } from "@/app/(app)/refidelizacao/acoes";

/**
 * Visão da própria agente do Setor de Atendimento, no MESMO layout do painel
 * do gestor (lista + aba lateral de detalhes) — sem os botões de decisão:
 * quem aprova/reprova/ajusta é a gestão. O objetivo dela aqui é caçar as
 * assinaturas pendentes antes do fechamento.
 */

type Situacao = {
  chave: "aprovado" | "liberado" | "assinatura" | "venda_nova" | "reprovado";
  rotulo: string;
  cls: string;
  cor: string;
};

function situacaoDe(l: AditivoLinha): Situacao {
  if (l.decisao === "reprovado")
    return { chave: "reprovado", rotulo: "Reprovado", cls: "bg-rose-100 text-rose-800", cor: "#e11d48" };
  if (l.decisao === "aprovado")
    return { chave: "liberado", rotulo: "Liberado pela gestão", cls: "bg-sky-100 text-sky-800", cor: "#0284c7" };
  if (l.conta)
    return { chave: "aprovado", rotulo: "Aprovado ✓", cls: "bg-emerald-100 text-emerald-800", cor: "#059669" };
  if (l.vendaRecente)
    return { chave: "venda_nova", rotulo: "Venda nova", cls: "bg-violet-100 text-violet-800", cor: "#7c3aed" };
  return { chave: "assinatura", rotulo: "Aguardando assinatura", cls: "bg-amber-100 text-amber-800", cor: "#d97706" };
}

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
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${cor}18`, color: cor }}
      >
        {icone}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-xl font-semibold tabular-nums leading-tight">{valor}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Donut({ fatias }: { fatias: { rotulo: string; qtd: number; cor: string }[] }) {
  const total = fatias.reduce((s, f) => s + f.qtd, 0);
  let acc = 0;
  const stops = fatias
    .filter((f) => f.qtd > 0)
    .map((f) => {
      const de = (acc / total) * 360;
      acc += f.qtd;
      return `${f.cor} ${de}deg ${(acc / total) * 360}deg`;
    })
    .join(", ");
  return (
    <div className="flex items-center gap-4">
      <div
        className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
        style={{ background: total ? `conic-gradient(${stops})` : "#e5e7eb" }}
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-card text-sm font-semibold tabular-nums">
          {total}
        </div>
      </div>
      <ul className="space-y-1 text-xs">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.cor }} />
            <span className="text-muted-foreground">{f.rotulo}</span>
            <span className="font-medium tabular-nums">
              {f.qtd} ({total ? Math.round((f.qtd / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detalhe({
  l,
  baseSgp,
  onFechar,
}: {
  l: AditivoLinha;
  baseSgp: string | null;
  onFechar: () => void;
}) {
  const st = situacaoDe(l);
  const linkAditivos =
    baseSgp && l.sgpClienteId ? `${baseSgp}/cliente/${l.sgpClienteId}/aditivos/` : null;
  const linkContratos =
    baseSgp && l.sgpClienteId ? `${baseSgp}/cliente/${l.sgpClienteId}/contratos/` : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Detalhes do aditivo</CardTitle>
          <p className="mt-1 truncate text-sm font-medium">{l.cliente}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
            {st.rotulo}
          </span>
        </div>
        <button type="button" onClick={onFechar} className="text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">Aditivo</p>
            <p className="font-mono">#{l.sgpAditivoId}{l.sgpContratoId ? ` · ct ${l.sgpContratoId}` : ""}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Data</p>
            <p className="tabular-nums">{formatarData(l.data)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Plano</p>
            <p>{l.plano ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Mensal (base da comissão)</p>
            <p className="tabular-nums font-medium">
              {formatarMoeda(l.valorMensal)}
              {l.valorAjustado !== null && (
                <span className="ml-1 text-[11px] text-primary" title={l.ajusteMotivo ?? ""}>ajustado</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Desconto (não entra)</p>
            <p className="tabular-nums">{formatarMoeda(l.desconto)}</p>
          </div>
        </div>

        {!l.conta && l.pendencia && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-medium">O que falta</p>
            <p>{l.pendencia}</p>
          </div>
        )}
        {l.decisaoMotivo && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs">
            <p className="font-medium">Observação da gestão</p>
            <p className="text-muted-foreground">{l.decisaoMotivo}</p>
          </div>
        )}
        {l.descricao && <p className="text-xs text-muted-foreground">{l.descricao}</p>}

        <div className="grid grid-cols-2 gap-2">
          {linkAditivos && (
            <a
              href={linkAditivos}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Aditivos SGP
            </a>
          )}
          {linkContratos && (
            <a
              href={linkContratos}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver contrato
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function MinhaRefidelizacao({
  dados,
  baseSgp,
}: {
  dados: ResultadoAgente;
  /** raiz do painel do SGP, para abrir os aditivos do cliente */
  baseSgp?: string | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [soPendentes, setSoPendentes] = useState(true);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const pendentes = dados.linhas.filter((l) => !l.conta && l.decisao !== "reprovado");
  const pctMeta = dados.atingimentoPct;

  const linhas = useMemo(() => {
    let ls = dados.linhas;
    if (soPendentes) ls = ls.filter((l) => !l.conta && l.decisao !== "reprovado");
    if (statusFiltro !== "todos") ls = ls.filter((l) => situacaoDe(l).chave === statusFiltro);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      ls = ls.filter(
        (l) =>
          l.cliente.toLowerCase().includes(q) ||
          l.sgpAditivoId.includes(q) ||
          (l.sgpContratoId ?? "").includes(q)
      );
    }
    return ls;
  }, [dados.linhas, soPendentes, statusFiltro, busca]);

  const detalhe = dados.linhas.find((l) => l.id === detalheId) ?? null;

  const donut = useMemo(() => {
    const pend = dados.linhas.filter((l) => !l.conta || l.decisao === "reprovado");
    const conta = (ch: Situacao["chave"]) => pend.filter((l) => situacaoDe(l).chave === ch).length;
    return [
      { rotulo: "Aguardando assinatura", qtd: conta("assinatura"), cor: "#d97706" },
      { rotulo: "Venda nova (não conta)", qtd: conta("venda_nova"), cor: "#7c3aed" },
      { rotulo: "Reprovado", qtd: conta("reprovado"), cor: "#e11d48" },
    ];
  }, [dados.linhas]);

  // próxima faixa — projeção pelo ticket médio dela (estimativa, e o texto diz isso)
  const ticketMedio = dados.validos > 0 ? dados.vtv / dados.validos : 0;
  const proxima = [
    { nome: "MÍNIMA", planos: Math.ceil(0.8 * META_REFIDELIZACAO), pct: 3.5 },
    { nome: "SUPERAÇÃO", planos: Math.ceil(1.01 * META_REFIDELIZACAO), pct: 4 },
    { nome: "ALTA", planos: Math.ceil(1.21 * META_REFIDELIZACAO), pct: 5 },
    { nome: "DESAFIO", planos: 250, pct: 7 },
  ].find((f) => dados.validos < f.planos);
  const comissaoNaProxima = proxima ? (ticketMedio * proxima.planos * proxima.pct) / 100 : 0;
  const pendentesAjudam = proxima ? Math.min(pendentes.length, proxima.planos - dados.validos) : 0;

  return (
    <div className="mt-6 space-y-4">
      {/* identificação da agente com resumo de produtividade e comissão */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <AvatarAgente nome={dados.nome ?? dados.agente} foto={dados.foto} tamanho="lg" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-base font-semibold">
                  {dados.nome ?? dados.agente}
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: pctMeta >= 100 ? "#22c55e" : pctMeta >= 80 ? "#2563eb" : "#f59e0b" }}
                  />
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {dados.validos} planos · {formatarPercentual(pctMeta / 100, 0)} da meta
                </p>
              </div>
            </div>
            <div className="ml-auto grid grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">VTV</p>
                <p className="font-semibold tabular-nums">{formatarMoeda(dados.vtv)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pendências</p>
                <p className="font-semibold tabular-nums">{pendentes.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comissão</p>
                <p className="font-semibold tabular-nums text-emerald-700">{formatarMoeda(dados.comissao)}</p>
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, pctMeta)}%`,
                backgroundColor: pctMeta >= 100 ? "#059669" : pctMeta >= 80 ? "#2563eb" : "#d97706",
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Faixa {dados.faixa} · {dados.percentual}% · meta {META_REFIDELIZACAO} planos
          </p>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icone={<BadgeCheck className="h-5 w-5" />} cor="#059669" rotulo="Aprovados" valor={String(dados.validos)} sub="assinados — já contam" />
        <Kpi icone={<Clock3 className="h-5 w-5" />} cor="#d97706" rotulo="Pendentes" valor={String(pendentes.length)} sub={pendentes.length > 0 ? "corra atrás da assinatura" : "nada pendente"} />
        <Kpi icone={<CircleDollarSign className="h-5 w-5" />} cor="#0284c7" rotulo="VTV refidelizado" valor={formatarMoeda(dados.vtv)} sub="base: valor mensal" />
        <Kpi icone={<Wallet className="h-5 w-5" />} cor="#7c3aed" rotulo="Minha comissão" valor={formatarMoeda(dados.comissao)} sub={`faixa ${dados.faixa} · ${dados.percentual}%`} />
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#05966918", color: "#059669" }}>
              <Target className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Meta ({META_REFIDELIZACAO} planos)</p>
              <p className="text-xl font-semibold tabular-nums leading-tight">
                {formatarPercentual(pctMeta / 100, 0)}
              </p>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, pctMeta)}%`,
                backgroundColor: pctMeta >= 100 ? "#059669" : pctMeta >= 80 ? "#2563eb" : "#d97706",
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {dados.validos} / {META_REFIDELIZACAO} planos
          </p>
        </div>
      </div>

      {proxima ? (
        <div className="rounded-xl border border-farol-amarelo/50 bg-farol-amarelo/10 px-4 py-3 text-sm">
          🎯 Faltam <strong>{proxima.planos - dados.validos} plano(s)</strong> para a faixa{" "}
          <strong>{proxima.nome}</strong> ({proxima.pct}%) — sua comissão passaria a cerca de{" "}
          <strong>{formatarMoeda(comissaoNaProxima)}</strong>
          {pendentesAjudam > 0 && (
            <>
              .{" "}
              <span className="text-amber-900">
                Você tem {pendentes.length} aguardando assinatura: {pendentesAjudam} deles já
                {pendentesAjudam === proxima.planos - dados.validos ? " fecham a faixa" : " contam para isso"}
                .
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-farol-verde/50 bg-farol-verde/10 px-4 py-3 text-sm">
          🏆 Você está na faixa máxima — <strong>{dados.faixa}</strong>, {dados.percentual}% sobre o
          VTV refidelizado.
        </div>
      )}

      {/* filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Status</span>
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="assinatura">Aguardando assinatura</option>
              <option value="venda_nova">Venda nova</option>
              <option value="aprovado">Aprovado</option>
              <option value="liberado">Liberado pela gestão</option>
              <option value="reprovado">Reprovado</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Busca por aditivo / contrato / cliente</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex.: #12345 ou nome"
              className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            Somente pendentes
          </label>
          <div className="ml-auto flex items-center gap-2">
            {aviso && <span className="max-w-[16rem] text-xs text-muted-foreground">{aviso}</span>}
            <button
              type="button"
              disabled={sincronizando}
              onClick={async () => {
                setSincronizando(true);
                setAviso(null);
                const r = await sincronizar();
                setSincronizando(false);
                setAviso(r.erro ?? r.ok ?? null);
                router.refresh();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              title="Regularizou a assinatura no SGP? Atualize aqui — o aditivo sai de pendente na hora."
            >
              <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Buscando no SGP…" : "Atualizar com o SGP"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* lista | lateral */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {soPendentes ? "Minhas pendências" : "Meus aditivos do mês"}{" "}
              <span className="text-sm font-normal text-muted-foreground">· {linhas.length} registro(s)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-2 py-2">Aditivo</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Plano</th>
                    <th className="px-2 py-2 text-right">Mensal</th>
                    <th className="px-2 py-2">Situação</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const st = situacaoDe(l);
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setDetalheId(l.id)}
                        className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${detalheId === l.id ? "bg-primary/5" : ""}`}
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{formatarData(l.data)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">#{l.sgpAditivoId}</td>
                        <td className="max-w-[12rem] truncate px-2 py-2">{l.cliente}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{l.plano ?? "—"}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatarMoeda(l.valorMensal)}</td>
                        <td className="px-2 py-2">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.rotulo}</span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          <Eye className="h-4 w-4" />
                        </td>
                      </tr>
                    );
                  })}
                  {linhas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {soPendentes ? "✓ Nenhuma pendência com esses filtros." : "Nenhum aditivo com esses filtros."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {detalhe && <Detalhe l={detalhe} baseSgp={baseSgp ?? null} onFechar={() => setDetalheId(null)} />}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pendências por status</CardTitle>
            </CardHeader>
            <CardContent>
              <Donut fatias={donut} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
