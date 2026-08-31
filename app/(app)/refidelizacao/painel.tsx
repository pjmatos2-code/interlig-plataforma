"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  XCircle,
  CircleDollarSign,
  Wallet,
  Target,
  RefreshCw,
  Stamp,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { formatarData, formatarMoeda, formatarPercentual } from "@/lib/format";
import type { AditivoLinha, RefidelizacaoMes } from "@/lib/refidelizacao/dados";
import { META_REFIDELIZACAO } from "@/lib/refidelizacao/regras";
import {
  decidirAditivo,
  decidirEmLote,
  limparDecisao,
  ajustarValor,
  sincronizar,
  type Resultado,
} from "./acoes";

/* ---------------------------------------------------------------- situação */

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

/* --------------------------------------------------------------------- KPI */

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

function Barra({ pct, cor }: { pct: number; cor?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: cor ?? "hsl(var(--primary))" }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- detalhe */

function Detalhe({
  l,
  baseSgp,
  onFechar,
}: {
  l: AditivoLinha;
  baseSgp: string | null;
  onFechar: () => void;
}) {
  const router = useRouter();
  const st = situacaoDe(l);
  const [modo, setModo] = useState<null | "aprovar" | "reprovar" | "valor">(null);
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState(String(l.valorMensal));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(fn: () => Promise<Resultado>) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setModo(null);
    setTexto("");
    router.refresh();
  }

  const linkAditivos =
    baseSgp && l.sgpClienteId ? `${baseSgp}/cliente/${l.sgpClienteId}/aditivos/` : null;
  const linkContratos = baseSgp && l.sgpClienteId ? `${baseSgp}/cliente/${l.sgpClienteId}/contratos/` : null;

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
            <p className="text-muted-foreground">Atendente</p>
            <p>{l.agente}</p>
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
            <p className="font-medium">Motivo da pendência</p>
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
        {erro && <p className="text-xs text-farol-vermelho">{erro}</p>}

        {modo ? (
          <div className="space-y-2">
            {modo === "valor" && (
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                placeholder="valor mensal correto"
              />
            )}
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={modo === "aprovar" ? "motivo da liberação" : modo === "reprovar" ? "motivo da reprovação" : "motivo do ajuste"}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() =>
                  executar(() =>
                    modo === "valor"
                      ? ajustarValor(l.id, Number(valor.replace(",", ".")), texto)
                      : decidirAditivo(l.id, modo === "aprovar" ? "aprovado" : "reprovado", texto)
                  )
                }
                className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Confirmar
              </button>
              <button type="button" onClick={() => setModo(null)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {!l.conta && (
              <button
                type="button"
                onClick={() => setModo("aprovar")}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
              >
                ✓ Aprovar
              </button>
            )}
            {l.conta && l.decisao !== "reprovado" && (
              <button
                type="button"
                onClick={() => setModo("reprovar")}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Reprovar
              </button>
            )}
            <button
              type="button"
              onClick={() => setModo("valor")}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
              title="Corrigir o valor mensal (ex.: cobrança anual no SGP)"
            >
              Ajustar valor
            </button>
            {l.decisao && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => executar(() => limparDecisao(l.id))}
                className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                title="Volta a valer a assinatura do SGPsign"
              >
                Desfazer
              </button>
            )}
            {linkAditivos && (
              <a
                href={linkAditivos}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Aditivos SGP
              </a>
            )}
            {linkContratos && (
              <a
                href={linkContratos}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ver contrato
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ painel */

export function PainelRefidelizacao({
  dados,
  baseSgp,
}: {
  dados: RefidelizacaoMes;
  baseSgp: string | null;
}) {
  const router = useRouter();
  const [agenteFiltro, setAgenteFiltro] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [motivoLote, setMotivoLote] = useState("");
  const [modoLote, setModoLote] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const todas = useMemo(
    () => dados.agentes.flatMap((a) => a.linhas.map((l) => ({ ...l, nomeAgente: a.nome ?? a.agente }))),
    [dados]
  );

  const linhas = useMemo(() => {
    let ls = todas;
    if (agenteFiltro) ls = ls.filter((l) => l.agente === agenteFiltro);
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
  }, [todas, agenteFiltro, soPendentes, statusFiltro, busca]);

  const detalhe = todas.find((l) => l.id === detalheId) ?? null;

  const donut = useMemo(() => {
    const pend = todas.filter((l) => !l.conta || l.decisao === "reprovado");
    const conta = (ch: Situacao["chave"]) => pend.filter((l) => situacaoDe(l).chave === ch).length;
    return [
      { rotulo: "Aguardando assinatura", qtd: conta("assinatura"), cor: "#d97706" },
      { rotulo: "Venda nova (não conta)", qtd: conta("venda_nova"), cor: "#7c3aed" },
      { rotulo: "Reprovado", qtd: conta("reprovado"), cor: "#e11d48" },
    ];
  }, [todas]);

  const metaSetor = META_REFIDELIZACAO * Math.max(1, dados.agentes.length);
  const pctSetor = (dados.totais.validos / metaSetor) * 100;
  const reprovados = todas.filter((l) => l.decisao === "reprovado").length;

  async function aprovarLote() {
    setOcupado(true);
    setAviso(null);
    const r = await decidirEmLote([...selecionados], motivoLote);
    setOcupado(false);
    setAviso(r.erro ?? r.ok ?? null);
    if (!r.erro) {
      setSelecionados(new Set());
      setModoLote(false);
      setMotivoLote("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icone={<BadgeCheck className="h-5 w-5" />} cor="#059669" rotulo="Aprovados" valor={String(dados.totais.validos)} sub="assinados ou liberados" />
        <Kpi icone={<Clock3 className="h-5 w-5" />} cor="#d97706" rotulo="Pendentes" valor={String(dados.totais.pendentes)} sub={dados.totais.pendentes > 0 ? "resolver antes do fechamento" : "nada pendente"} />
        <Kpi icone={<XCircle className="h-5 w-5" />} cor="#e11d48" rotulo="Reprovados" valor={String(reprovados)} />
        <Kpi icone={<CircleDollarSign className="h-5 w-5" />} cor="#0284c7" rotulo="VTV refidelizado" valor={formatarMoeda(dados.totais.vtv)} sub="base: valor mensal" />
        <Kpi icone={<Wallet className="h-5 w-5" />} cor="#7c3aed" rotulo="Comissão do setor" valor={formatarMoeda(dados.totais.comissao)} />
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#05966918", color: "#059669" }}>
              <Target className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Progresso da meta ({metaSetor})</p>
              <p className="text-xl font-semibold tabular-nums leading-tight">{formatarPercentual(pctSetor / 100, 0)}</p>
            </div>
          </div>
          <div className="mt-2">
            <Barra pct={pctSetor} cor="#059669" />
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              {dados.totais.validos} / {metaSetor} planos
            </p>
          </div>
        </div>
      </div>

      {/* filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <form method="get" className="flex items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Competência</span>
              <input
                type="month"
                name="mes"
                defaultValue={dados.competencia.slice(0, 7)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              Aplicar
            </button>
          </form>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Atendente</span>
            <select
              value={agenteFiltro ?? ""}
              onChange={(e) => setAgenteFiltro(e.target.value || null)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos</option>
              {dados.agentes.map((a) => (
                <option key={a.agente} value={a.agente}>{a.nome ?? a.agente}</option>
              ))}
            </select>
          </label>
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
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                const r = await sincronizar(dados.competencia);
                setOcupado(false);
                setAviso(r.erro ?? r.ok ?? null);
                router.refresh();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" /> Sincronizar com o SGP
            </button>
            <button
              type="button"
              disabled={selecionados.size === 0 || ocupado}
              onClick={() => setModoLote(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Stamp className="h-4 w-4" /> Aprovar em lote ({selecionados.size})
            </button>
          </div>
        </CardContent>
      </Card>

      {modoLote && (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <p className="text-sm font-medium">Liberar {selecionados.size} aditivo(s):</p>
            <input
              autoFocus
              value={motivoLote}
              onChange={(e) => setMotivoLote(e.target.value)}
              placeholder="motivo da liberação (vale para todos)"
              className="h-9 min-w-[18rem] flex-1 rounded-md border border-input bg-background px-2 text-sm"
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={aprovarLote}
              className="h-9 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setModoLote(false)} className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
              Cancelar
            </button>
          </CardContent>
        </Card>
      )}

      {/* corpo: atendentes · lista · lateral */}
      <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
        {/* atendentes */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Atendentes</p>
          {dados.agentes.map((a) => (
            <button
              key={a.agente}
              type="button"
              onClick={() => setAgenteFiltro(agenteFiltro === a.agente ? null : a.agente)}
              className={`w-full rounded-xl border bg-card p-3 text-left transition ${
                agenteFiltro === a.agente ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <AvatarAgente nome={a.nome ?? a.agente} foto={a.foto} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.nome ?? a.agente}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {a.validos} planos · {formatarPercentual(a.atingimentoPct / 100, 0)} da meta
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">VTV <strong className="tabular-nums text-foreground">{formatarMoeda(a.vtv)}</strong></span>
                <span className="text-muted-foreground">Pendências <strong className="tabular-nums text-foreground">{a.pendentes}</strong></span>
              </div>
              <div className="mt-2">
                <Barra pct={a.atingimentoPct} cor={a.atingimentoPct >= 100 ? "#059669" : a.atingimentoPct >= 80 ? "#2563eb" : "#d97706"} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Faixa {a.faixa} · {a.percentual}% · comissão {formatarMoeda(a.comissao)}
              </p>
            </button>
          ))}
        </div>

        {/* lista */}
        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {soPendentes ? "Pendências para aprovação" : "Aditivos do mês"}{" "}
              <span className="text-sm font-normal text-muted-foreground">· {linhas.length} registro(s)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={linhas.length > 0 && linhas.every((l) => selecionados.has(l.id))}
                        onChange={(e) =>
                          setSelecionados(e.target.checked ? new Set(linhas.map((l) => l.id)) : new Set())
                        }
                      />
                    </th>
                    <th className="px-2 py-2">Data</th>
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
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selecionados.has(l.id)}
                            onChange={(e) => {
                              const s = new Set(selecionados);
                              e.target.checked ? s.add(l.id) : s.delete(l.id);
                              setSelecionados(s);
                            }}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">{formatarData(l.data)}</td>
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
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {soPendentes ? "✓ Nenhuma pendência com esses filtros." : "Nenhum aditivo com esses filtros."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* lateral */}
        <div className="space-y-4">
          {detalhe && <Detalhe l={detalhe} baseSgp={baseSgp} onFechar={() => setDetalheId(null)} />}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pendências por status</CardTitle>
            </CardHeader>
            <CardContent>
              <Donut fatias={donut} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumo de comissão por atendente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...dados.agentes]
                .sort((a, b) => b.comissao - a.comissao)
                .map((a, i) => (
                  <div key={a.agente}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                        <AvatarAgente nome={a.nome ?? a.agente} foto={a.foto} tamanho="sm" />
                        <span className="truncate">{a.nome ?? a.agente}</span>
                      </span>
                      <strong className="tabular-nums">{formatarMoeda(a.comissao)}</strong>
                    </div>
                    <div className="mt-1">
                      <Barra
                        pct={dados.totais.comissao ? (a.comissao / dados.totais.comissao) * 100 : 0}
                      />
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
