"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import {
  ShieldCheck,
  XCircle,
  AlertTriangle,
  Lock,
  Crosshair,
  Percent,
  CircleDollarSign,
  Wallet,
  RefreshCw,
  MessageCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatarMoeda, formatarData } from "@/lib/format";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import type { RetencaoMes, CasoLinha } from "@/lib/retencao/dados";
import {
  criarCasoRetencao,
  atualizarCaso,
  rodarAuditoria,
  analisarCaso,
  buscarConversasCanal,
  decidirIrreversivel,
  type Resultado,
} from "./acoes";

/** Layout aprovado pelo gestor (mock 31/08): KPIs com ícone → filtros → lista | detalhe | desempenho. */

const STATUS: Record<string, { t: string; cls: string; cor: string }> = {
  retido: { t: "Retido ✓", cls: "bg-emerald-100 text-emerald-800", cor: "#10b981" },
  perdido: { t: "Perdido ✕", cls: "bg-rose-100 text-rose-800", cor: "#f43f5e" },
  em_risco: { t: "Em risco ⚠", cls: "bg-amber-100 text-amber-800", cor: "#f59e0b" },
  irreversivel: { t: "Irreversível", cls: "bg-slate-200 text-slate-700", cor: "#94a3b8" },
  transferido: { t: "Transferido", cls: "bg-sky-100 text-sky-800", cor: "#38bdf8" },
  sem_resposta: { t: "Sem resposta", cls: "bg-slate-100 text-slate-600", cor: "#cbd5e1" },
};

const TRILHAS: [string, string][] = [
  ["A", "A — Técnica/suporte"], ["B", "B — Valor/concorrência"], ["C", "C — Financeira"],
  ["D", "D — Mudança/cobertura"], ["E", "E — Atendimento"], ["F", "F — Falta de uso"],
];

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
        <p className="text-lg font-semibold tabular-nums leading-tight">{valor}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Donut({
  partes,
  centro,
}: {
  partes: { valor: number; cor: string; rotulo: string }[];
  centro?: string;
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  let acc = 0;
  const stops = partes
    .filter((p) => p.valor > 0)
    .map((p) => {
      const de = (acc / total) * 360;
      acc += p.valor;
      return `${p.cor} ${de}deg ${(acc / total) * 360}deg`;
    })
    .join(", ");
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-card text-sm font-bold tabular-nums">
          {centro ?? ""}
        </div>
      </div>
      <div className="space-y-0.5 text-[11px]">
        {partes.map((p) => (
          <p key={p.rotulo} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.cor }} />
            {p.rotulo}{" "}
            <strong className="tabular-nums">
              {p.valor} ({Math.round((p.valor / total) * 100)}%)
            </strong>
          </p>
        ))}
      </div>
    </div>
  );
}

function horaDe(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function Detalhe({
  c,
  nomeAgente,
  linkTemplate,
  ehGestor,
  onFechar,
}: {
  c: CasoLinha & { agente: string };
  nomeAgente: string;
  linkTemplate: string | null;
  ehGestor: boolean;
  onFechar: () => void;
}) {
  const [obsGestor, setObsGestor] = useState("");
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [trilha, setTrilha] = useState(c.trilha ?? "");
  const [motivo, setMotivo] = useState(c.motivoDeclarado ?? "");
  const [alcada, setAlcada] = useState(c.alcadaUsada ?? "");
  const [resumo, setResumo] = useState(c.resumo ?? "");
  const [desfecho, setDesfecho] = useState("");
  const [irrevMotivo, setIrrevMotivo] = useState("");
  const [transcript, setTranscript] = useState("");
  const [mostraIa, setMostraIa] = useState(false);

  async function executar(fn: () => Promise<Resultado>, msg: string) {
    setOcupado(true); setErro(null); setOkMsg(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setOkMsg(msg);
    router.refresh();
  }

  const link = aplicarLinkSgp(linkTemplate, {
    clienteId: c.sgpClienteId, contratoId: c.sgpContratoId, cpf: null,
  });
  const st = c.desfecho ? STATUS[c.desfecho] : null;
  const a = c.analise as null | {
    motivo_real?: string; trilha_sugerida?: string; oferta_feita?: string;
    desfecho_aparente?: string; divergencia?: string | null; aderencia_pop?: string; resumo?: string;
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* cabeçalho */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold">{c.clienteNome}</p>
              {c.sgpContratoId && (
                <a href={link ?? undefined} target="_blank" rel="noopener noreferrer"
                  className="rounded-md border px-2 py-0.5 font-mono text-xs text-interlig-ceu hover:underline">
                  #{c.sgpContratoId} ↗ SGP
                </a>
              )}
              {st && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.t}</span>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              📞 {c.telefone ?? "sem telefone"} · {c.origem === "sz_auto" ? "canal SZ" : c.origem === "importado_rd" ? "histórico RD" : "manual"}
              {c.reincidente && " · 🔁 reincidente"}
            </p>
          </div>
          <button type="button" onClick={onFechar} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {/* grade de informações */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border bg-muted/20 p-3 text-xs md:grid-cols-3">
          <div><p className="text-muted-foreground">Motivo</p><p className="font-medium">{c.motivoDeclarado ?? "—"}</p></div>
          <div><p className="text-muted-foreground">Trilha</p><p className="font-medium">{c.trilha ?? "—"}</p></div>
          <div><p className="text-muted-foreground">Alçada</p><p className="font-medium">{c.alcadaUsada ?? "—"}</p></div>
          <div><p className="text-muted-foreground">VTV</p><p className="font-medium tabular-nums">{formatarMoeda(c.valorMensal)}</p></div>
          <div><p className="text-muted-foreground">Responsável</p><p className="font-medium">{nomeAgente}</p></div>
          <div><p className="text-muted-foreground">Validação</p><p className="font-medium">{c.desfechoAuto ? "SGP (automática)" : c.desfecho ? "manual" : "pendente"}</p></div>
        </div>

        {/* histórico resumido */}
        <div>
          <p className="mb-1 text-xs font-semibold">Histórico resumido</p>
          <div className="space-y-1 border-l-2 border-muted pl-3 text-xs text-muted-foreground">
            <p>
              <span className="tabular-nums">{formatarData(c.criadoEm.slice(0, 10))} {horaDe(c.criadoEm)}</span>{" "}
              · caso criado ({c.origem === "sz_auto" ? "robô do canal SZ" : c.origem === "importado_rd" ? "importado do RD" : `por ${nomeAgente}`})
            </p>
            {a && <p>· análise de conversa concluída (IA)</p>}
            {c.desfecho && (
              <p>
                · desfecho: {STATUS[c.desfecho]?.t ?? c.desfecho}
                {c.desfechoAuto ? " — validado no SGP" : ""}
              </p>
            )}
            {c.clawback && <p className="text-rose-700">· ↩ clawback: cancelou em até 30 dias após a retenção</p>}
          </div>
        </div>

        {c.desfecho === "irreversivel" && (
          <div className={`rounded-md border p-3 text-xs ${
            c.irreversivelStatus === "aprovado" ? "border-emerald-200 bg-emerald-50/60"
            : c.irreversivelStatus === "rejeitado" ? "border-rose-200 bg-rose-50/60"
            : "border-amber-300 bg-amber-50/70"}`}>
            <p className="font-semibold">
              {c.irreversivelStatus === "aprovado" ? "✓ Irreversível aprovado pela gestão — fora da taxa"
               : c.irreversivelStatus === "rejeitado" ? "✕ Irreversível rejeitado — voltou ao fluxo"
               : "⏳ Irreversível AGUARDANDO aprovação da gestão — ainda conta no denominador"}
            </p>
            <p className="mt-1">Motivo proposto: {c.irreversivelMotivo ?? "—"}</p>
            {ehGestor && c.irreversivelStatus !== "aprovado" && c.irreversivelStatus !== "rejeitado" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={ocupado}
                  onClick={() => executar(() => decidirIrreversivel(c.id, true), "Irreversível aprovado.")}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  Aprovar (evidência conferida)
                </button>
                <Input placeholder="observação (se rejeitar)" value={obsGestor}
                  onChange={(e) => setObsGestor(e.target.value)} className="h-8 w-52 text-xs" />
                <button type="button" disabled={ocupado}
                  onClick={() => executar(() => decidirIrreversivel(c.id, false, obsGestor), "Rejeitado — volta ao fluxo.")}
                  className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                  Rejeitar
                </button>
                <span className="text-[11px] text-muted-foreground">Analise a conversa (IA) ou as evidências antes de aprovar.</span>
              </div>
            )}
          </div>
        )}

        {/* tratativa: SEMPRE editável pela agente; a plataforma só valida o desfecho no SGP */}
        <div>
          <p className="mb-1 text-xs font-semibold">Tratativa / observações</p>
          <div className="grid gap-2 md:grid-cols-2">
            <select value={trilha} onChange={(e) => setTrilha(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Trilha da dor…</option>
              {TRILHAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <Input placeholder="motivo declarado pelo cliente" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <Input placeholder="alçada/oferta aplicada (titularidade, F2, visita…)" value={alcada} onChange={(e) => setAlcada(e.target.value)} className="md:col-span-2" />
          </div>
          <textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3}
            placeholder="observações da tratativa: como chegou, o que foi combinado, retorno…"
            className="mt-2 w-full rounded-md border border-input bg-background p-2 text-sm" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={ocupado}
            onClick={() => executar(() => atualizarCaso(c.id, { ...(c.etapa === "novo" ? { etapa: "negociacao" } : {}), trilha, motivoDeclarado: motivo, alcadaUsada: alcada, resumo }), "Tratativa salva.")}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">
            💾 Registrar contato
          </button>
          <select value={desfecho} onChange={(e) => setDesfecho(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">{c.desfecho ? "reclassificar…" : "encerrar caso como…"}</option>
            <option value="irreversivel">Irreversível (não penaliza)</option>
            <option value="transferido">Transferido</option>
            <option value="sem_resposta">Sem resposta</option>
          </select>
          {desfecho === "irreversivel" && (
            <Input placeholder="motivo obrigatório" value={irrevMotivo} onChange={(e) => setIrrevMotivo(e.target.value)} className="h-8 w-56 text-xs" />
          )}
          {desfecho && (
            <button type="button" disabled={ocupado}
              onClick={() => executar(() => atualizarCaso(c.id, { desfecho: desfecho as never, irreversivelMotivo: irrevMotivo, trilha, motivoDeclarado: motivo, alcadaUsada: alcada, resumo }), "Caso encerrado.")}
              className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              🚩 Confirmar encerramento
            </button>
          )}
        </div>
        {erro && <p className="text-xs text-farol-vermelho">{erro}</p>}
        {okMsg && <p className="text-xs text-farol-verde">{okMsg}</p>}
        <p className="text-[11px] text-muted-foreground">
          {c.desfechoAuto && (c.desfecho === "retido" || c.desfecho === "perdido")
            ? `“${STATUS[c.desfecho]?.t}” foi validado no SGP — a tratativa segue editável e você pode reclassificar.`
            : "Retido e Perdido são validados automaticamente pelo status do contrato no SGP."}
        </p>

        {/* análise da conversa (IA) */}
        <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-violet-900">Análise da conversa <span className="rounded bg-violet-200 px-1.5 py-0.5 text-[10px]">IA ✨</span></p>
            {!a && (
              <button type="button" onClick={() => setMostraIa(!mostraIa)}
                className="text-[11px] text-violet-800 underline">
                {mostraIa ? "fechar" : "analisar"}
              </button>
            )}
          </div>
          {a ? (
            <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
              <div>
                <p className="mb-1 font-medium">Insights principais</p>
                <p>✅ {a.motivo_real} (trilha {a.trilha_sugerida})</p>
                <p>✅ Oferta: {a.oferta_feita}</p>
                {a.divergencia && <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-amber-900">⚠ {a.divergencia}</p>}
              </div>
              <div>
                <p className="mb-1 font-medium">Leitura do atendimento</p>
                <p>• {a.aderencia_pop}</p>
                <p>• {a.resumo}</p>
              </div>
            </div>
          ) : mostraIa ? (
            <div className="mt-2">
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={4}
                placeholder="Cole a conversa do SZ Chat…"
                className="w-full rounded-md border border-input bg-background p-2 text-xs" />
              <button type="button" disabled={ocupado}
                onClick={() => executar(() => analisarCaso(c.id, transcript), "Conversa analisada.")}
                className="mt-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                {ocupado ? "Analisando…" : "Analisar"}
              </button>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">Sem análise ainda.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const inicial: Resultado = {};

export function PainelRetencao({
  meses,
  ehGestor,
  linkTemplate,
}: {
  meses: RetencaoMes[];
  ehGestor: boolean;
  linkTemplate: string | null;
}) {
  const router = useRouter();
  const [estadoNovo, acaoNovo] = useFormState(criarCasoRetencao, inicial);
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [fContrato, setFContrato] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fMotivo, setFMotivo] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mostraNovo, setMostraNovo] = useState(false);

  const nomeDe = useMemo(
    () => new Map(meses.map((m) => [m.agente, m.nomeAgente ?? m.agente])),
    [meses]
  );

  const tot = useMemo(() => {
    const soma = (f: (m: RetencaoMes) => number) => meses.reduce((s, m) => s + f(m), 0);
    const retidos = soma((m) => m.retidos), perdidos = soma((m) => m.perdidos),
      emRisco = soma((m) => m.emRisco), irrev = soma((m) => m.irreversiveis),
      irrevPend = soma((m) => m.irreversiveisPendentes),
      claw = soma((m) => m.clawbacks), eleg = soma((m) => m.elegiveis),
      vtv = soma((m) => m.vtvRetido), com = soma((m) => m.comissao),
      casos = soma((m) => m.casos);
    return { retidos, perdidos, emRisco, irrev, irrevPend, claw, eleg, vtv, com, casos,
      taxa: eleg ? (retidos / eleg) * 100 : 0 };
  }, [meses]);

  const motivos = useMemo(() => {
    const set = new Set<string>();
    for (const m of meses) for (const l of m.linhas) if (l.motivoDeclarado) set.add(l.motivoDeclarado);
    return [...set].sort();
  }, [meses]);

  const linhas = useMemo(() => {
    let todas = meses.flatMap((m) => m.linhas.map((l) => ({ ...l, agente: m.agente })));
    if (fStatus) todas = todas.filter((l) => (l.desfecho ?? "aberto") === fStatus);
    if (fMotivo) todas = todas.filter((l) => l.motivoDeclarado === fMotivo);
    if (fContrato.trim()) todas = todas.filter((l) => (l.sgpContratoId ?? "").includes(fContrato.trim()));
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      const dig = b.replace(/\D/g, "");
      todas = todas.filter(
        (l) =>
          l.clienteNome.toLowerCase().includes(b) ||
          (dig.length >= 4 && (l.telefone ?? "").replace(/\D/g, "").includes(dig))
      );
    }
    return todas;
  }, [meses, fStatus, fMotivo, fContrato, busca]);

  const caso = linhas.find((l) => l.id === selecionado) ?? null;
  const pct = (n: number) => (tot.casos ? ((n / tot.casos) * 100).toFixed(1).replace(".", ",") + "%" : "—");
  const temFiltro = busca || fContrato || fStatus || fMotivo;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Kpi icone={<ShieldCheck className="h-4 w-4" />} cor="#059669" rotulo="Retidos" valor={String(tot.retidos)} sub={`taxa ${tot.taxa.toFixed(0)}%`} />
        <Kpi icone={<XCircle className="h-4 w-4" />} cor="#e11d48" rotulo="Perdidos" valor={String(tot.perdidos)} sub={pct(tot.perdidos)} />
        <Kpi icone={<AlertTriangle className="h-4 w-4" />} cor="#d97706" rotulo="Em risco" valor={String(tot.emRisco)} sub={pct(tot.emRisco)} />
        <Kpi icone={<Lock className="h-4 w-4" />} cor={tot.irrevPend > 0 ? "#d97706" : "#64748b"} rotulo="Irreversíveis" valor={String(tot.irrev)} sub={tot.irrevPend > 0 ? `${tot.irrevPend} aguardando aprovação` : "todos aprovados"} />
        <Kpi icone={<Crosshair className="h-4 w-4" />} cor="#e11d48" rotulo="Clawback" valor={String(tot.claw)} sub={pct(tot.claw)} />
        <Kpi icone={<Percent className="h-4 w-4" />} cor="#0369a1" rotulo="Taxa de retenção" valor={`${tot.taxa.toFixed(0)}%`} sub={`${tot.retidos} de ${tot.eleg}`} />
        <Kpi icone={<CircleDollarSign className="h-4 w-4" />} cor="#0284c7" rotulo="VTV retido" valor={formatarMoeda(tot.vtv)} sub="total no período" />
        <Kpi icone={<Wallet className="h-4 w-4" />} cor="#059669" rotulo="Comissão" valor={formatarMoeda(tot.com)} sub="total no período" />
      </div>

      {/* filtros + ações */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-4">
          <label className="text-sm">
            <span className="mb-1 block text-[11px] text-muted-foreground">Cliente / telefone</span>
            <Input placeholder="Buscar cliente ou telefone" value={busca}
              onChange={(e) => setBusca(e.target.value)} className="h-9 w-52" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] text-muted-foreground">Contrato SGP</span>
            <Input placeholder="Buscar contrato" value={fContrato}
              onChange={(e) => setFContrato(e.target.value)} className="h-9 w-32" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] text-muted-foreground">Status</span>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos</option>
              <option value="aberto">Em aberto</option>
              {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.t}</option>)}
            </select>
          </label>
          {motivos.length > 0 && (
            <label className="text-sm">
              <span className="mb-1 block text-[11px] text-muted-foreground">Motivo</span>
              <select value={fMotivo} onChange={(e) => setFMotivo(e.target.value)}
                className="h-9 max-w-[11rem] rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Todos</option>
                {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          {temFiltro && (
            <button type="button"
              onClick={() => { setBusca(""); setFContrato(""); setFStatus(""); setFMotivo(""); }}
              className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted">
              Limpar filtros
            </button>
          )}
          <div className="ml-auto flex items-end gap-2">
            {msg && <span className="max-w-[14rem] text-xs text-muted-foreground">{msg}</span>}
            {ehGestor && (
              <>
                <button type="button" disabled={rodando}
                  onClick={async () => { setRodando(true); const r = await buscarConversasCanal(); setMsg(r.detalhe ?? r.erro ?? null); setRodando(false); router.refresh(); }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <MessageCircle className="h-4 w-4" /> Buscar canal SZ
                </button>
                <button type="button" disabled={rodando}
                  onClick={async () => { setRodando(true); const r = await rodarAuditoria(); setMsg(r.detalhe ?? r.erro ?? null); setRodando(false); router.refresh(); }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <RefreshCw className="h-4 w-4" /> Auditar no SGP
                </button>
              </>
            )}
            <button type="button" onClick={() => setMostraNovo(!mostraNovo)}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              + Novo caso
            </button>
          </div>
        </CardContent>
      </Card>

      {mostraNovo && (
        <form action={acaoNovo} className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
          <Input name="cliente_nome" placeholder="nome do cliente" className="w-56" />
          <Input name="sgp_contrato_id" placeholder="contrato SGP" className="w-32" />
          <Input name="telefone" placeholder="telefone" className="w-36" />
          <button type="submit" className="h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Abrir caso</button>
          {estadoNovo.erro && <span className="text-xs text-farol-vermelho">{estadoNovo.erro}</span>}
          {estadoNovo.ok && <span className="text-xs text-farol-verde">{estadoNovo.ok}</span>}
        </form>
      )}

      {/* lista | detalhe + desempenho */}
      <div className="grid gap-4 xl:grid-cols-[1fr_minmax(24rem,30rem)]">
        <Card className="self-start">
          <CardContent className="p-0">
            <p className="border-b px-4 py-2.5 text-sm font-semibold">Casos de retenção ({linhas.length})</p>
            <div className="max-h-[38rem] overflow-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Contrato</th>
                    <th className="px-3 py-2 font-medium">Motivo</th>
                    <th className="px-3 py-2 text-right font-medium">VTV</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Resp.</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const st = l.desfecho ? STATUS[l.desfecho] : null;
                    return (
                      <tr key={l.id} onClick={() => setSelecionado(l.id)}
                        className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${selecionado === l.id ? "bg-sky-50" : ""}`}>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                          {formatarData(l.criadoEm.slice(0, 10))}
                          <span className="block text-[10px]">{horaDe(l.criadoEm)}</span>
                        </td>
                        <td className="max-w-[13rem] truncate px-3 py-2 font-medium">
                          {l.clienteNome}
                          {l.reincidente && <span title="reincidente"> 🔁</span>}
                          {l.analise ? <span title="conversa analisada"> ✨</span> : null}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{l.sgpContratoId ? `#${l.sgpContratoId}` : "—"}</td>
                        <td className="max-w-[8rem] truncate px-3 py-2 text-xs text-muted-foreground">{l.motivoDeclarado ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">{formatarMoeda(l.valorMensal)}</td>
                        <td className="px-3 py-2">
                          {st ? (
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                              {st.t}
                              {l.desfecho === "irreversivel" && l.irreversivelStatus !== "aprovado" && " ⏳"}
                            </span>
                          ) : <Badge variant="amarelo">{l.etapa}</Badge>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {nomeDe.get(l.agente) ?? l.agente}
                        </td>
                      </tr>
                    );
                  })}
                  {linhas.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum caso com esses filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {caso ? (
            <Detalhe
              c={caso}
              nomeAgente={nomeDe.get(caso.agente) ?? caso.agente}
              linkTemplate={linkTemplate}
              ehGestor={ehGestor}
              onFechar={() => setSelecionado(null)}
            />
          ) : (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              Selecione um caso na lista para trabalhar.
            </CardContent></Card>
          )}

          {/* desempenho por agente */}
          {meses.map((m) => (
            <Card key={m.agente}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Desempenho do agente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex items-center gap-2.5">
                  <AvatarAgente nome={m.nomeAgente ?? m.agente} foto={m.foto} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.nomeAgente ?? m.agente}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {m.retidos} / {m.elegiveis} elegíveis
                    </p>
                  </div>
                  <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                    {m.taxaPct.toFixed(0)}%
                  </span>
                </div>
                <Donut
                  centro={`${m.taxaPct.toFixed(0)}%`}
                  partes={[
                    { valor: m.retidos, cor: "#10b981", rotulo: "Retidos" },
                    { valor: m.perdidos, cor: "#f43f5e", rotulo: "Perdidos" },
                    { valor: m.emRisco, cor: "#f59e0b", rotulo: "Em risco" },
                    { valor: m.irreversiveis, cor: "#94a3b8", rotulo: "Irreversíveis" },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {m.abaixoDoPiso
                    ? "Abaixo do piso (15 elegíveis) — avaliação manual."
                    : <>VTV retido <strong className="tabular-nums text-foreground">{formatarMoeda(m.vtvRetido)}</strong> · faixa {m.faixaPct}% · comissão <strong className="tabular-nums text-emerald-700">{formatarMoeda(m.comissao)}</strong></>}
                </p>
              </CardContent>
            </Card>
          ))}

        </div>
      </div>
    </div>
  );
}
