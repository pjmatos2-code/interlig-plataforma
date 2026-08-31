"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatarMoeda, formatarData } from "@/lib/format";
import type { RetencaoMes, CasoLinha } from "@/lib/retencao/dados";
import { criarCasoRetencao, atualizarCaso, rodarAuditoria, analisarCaso, type Resultado } from "./acoes";
import { useFormState } from "react-dom";

const ROTULO_DESFECHO: Record<string, { t: string; cls: string }> = {
  retido: { t: "Retido ✓", cls: "bg-emerald-100 text-emerald-800" },
  perdido: { t: "Perdido", cls: "bg-rose-100 text-rose-800" },
  em_risco: { t: "Em risco", cls: "bg-amber-100 text-amber-800" },
  irreversivel: { t: "Irreversível", cls: "bg-slate-200 text-slate-700" },
  transferido: { t: "Transferido", cls: "bg-sky-100 text-sky-800" },
  sem_resposta: { t: "Sem resposta", cls: "bg-slate-100 text-slate-600" },
};

const TRILHAS: [string, string][] = [
  ["A", "A — Técnica/suporte"], ["B", "B — Valor/concorrência"], ["C", "C — Financeira"],
  ["D", "D — Mudança/cobertura"], ["E", "E — Atendimento"], ["F", "F — Falta de uso"],
];

function Caso({ c, podeEditar }: { c: CasoLinha; podeEditar: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [trilha, setTrilha] = useState(c.trilha ?? "");
  const [motivo, setMotivo] = useState(c.motivoDeclarado ?? "");
  const [alcada, setAlcada] = useState(c.alcadaUsada ?? "");
  const [resumo, setResumo] = useState(c.resumo ?? "");
  const [desfecho, setDesfecho] = useState("");
  const [irrevMotivo, setIrrevMotivo] = useState("");
  const [transcript, setTranscript] = useState("");

  async function executar(fn: () => Promise<Resultado>) {
    setOcupado(true); setErro(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  const d = c.desfecho ? ROTULO_DESFECHO[c.desfecho] : null;
  const analise = c.analise as null | {
    motivo_real?: string; trilha_sugerida?: string; oferta_feita?: string;
    divergencia?: string | null; aderencia_pop?: string; resumo?: string;
  };

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
      >
        <span className="w-16 shrink-0 tabular-nums text-xs text-muted-foreground">
          {formatarData(c.criadoEm.slice(0, 10))}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{c.clienteNome}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {c.sgpContratoId ? `#${c.sgpContratoId}` : "—"}
        </span>
        {c.reincidente && <Badge variant="outline" className="shrink-0">reincidente</Badge>}
        {c.clawback && <Badge variant="vermelho" className="shrink-0">clawback</Badge>}
        {c.analise ? <span title="conversa analisada">🧠</span> : null}
        {d ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${d.cls}`}>{d.t}</span>
        ) : (
          <Badge variant="amarelo" className="shrink-0">{c.etapa}</Badge>
        )}
      </button>

      {aberto && (
        <div className="space-y-3 bg-muted/20 px-4 py-3 text-sm">
          {analise && (
            <div className="rounded-md border border-sky-200 bg-sky-50/60 p-3 text-xs">
              <p className="mb-1 font-semibold text-sky-900">🧠 Análise da conversa</p>
              <p><strong>Motivo real:</strong> {analise.motivo_real} · trilha sugerida {analise.trilha_sugerida}</p>
              <p><strong>Oferta:</strong> {analise.oferta_feita}</p>
              {analise.divergencia && (
                <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-amber-900">
                  ⚠ Divergência: {analise.divergencia}
                </p>
              )}
              <p className="mt-1 text-muted-foreground">{analise.aderencia_pop}</p>
              <p className="mt-1">{analise.resumo}</p>
            </div>
          )}

          {podeEditar && c.etapa !== "fechado" ? (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <select value={trilha} onChange={(e) => setTrilha(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Trilha da dor…</option>
                  {TRILHAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <Input placeholder="motivo declarado pelo cliente" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <Input placeholder="alçada/oferta usada (ex.: titularidade, F2...)" value={alcada} onChange={(e) => setAlcada(e.target.value)} />
                <Input placeholder="resumo (como chegou, o que fez, resultado)" value={resumo} onChange={(e) => setResumo(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={ocupado}
                  onClick={() => executar(() => atualizarCaso(c.id, { etapa: "negociacao", trilha, motivoDeclarado: motivo, alcadaUsada: alcada, resumo }))}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                  Salvar tratativa
                </button>
                <select value={desfecho} onChange={(e) => setDesfecho(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                  <option value="">fechar como…</option>
                  <option value="irreversivel">Irreversível (não penaliza)</option>
                  <option value="transferido">Transferido (não era cancelamento)</option>
                  <option value="sem_resposta">Sem resposta</option>
                </select>
                {desfecho === "irreversivel" && (
                  <Input placeholder="motivo obrigatório (mudança sem cobertura...)" value={irrevMotivo}
                    onChange={(e) => setIrrevMotivo(e.target.value)} className="h-8 w-64 text-xs" />
                )}
                {desfecho && (
                  <button type="button" disabled={ocupado}
                    onClick={() => executar(() => atualizarCaso(c.id, { desfecho: desfecho as never, irreversivelMotivo: irrevMotivo, trilha, motivoDeclarado: motivo, alcadaUsada: alcada, resumo }))}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                    Confirmar fechamento
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Retido e Perdido são carimbados pela auditoria (status no SGP) — não se marcam à mão.
              </p>
            </>
          ) : (
            <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              <p><strong>Trilha:</strong> {c.trilha ?? "—"} · <strong>Motivo:</strong> {c.motivoDeclarado ?? "—"}</p>
              <p><strong>Alçada:</strong> {c.alcadaUsada ?? "—"} · <strong>VTV:</strong> {formatarMoeda(c.valorMensal)}</p>
              {c.irreversivelMotivo && <p className="md:col-span-2"><strong>Irreversível:</strong> {c.irreversivelMotivo}</p>}
              {c.resumo && <p className="md:col-span-2">{c.resumo}</p>}
            </div>
          )}

          {podeEditar && !c.analise && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                🧠 Analisar conversa (cole o histórico do SZ)
              </summary>
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)}
                placeholder="Cole aqui a conversa do SZ Chat…" rows={5}
                className="mt-2 w-full rounded-md border border-input bg-background p-2 text-xs" />
              <button type="button" disabled={ocupado}
                onClick={() => executar(() => analisarCaso(c.id, transcript))}
                className="mt-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                {ocupado ? "Analisando…" : "Analisar"}
              </button>
            </details>
          )}
          {erro && <p className="text-xs text-farol-vermelho">{erro}</p>}
        </div>
      )}
    </div>
  );
}

const inicial: Resultado = {};

export function PainelRetencao({
  meses,
  ehGestor,
}: {
  meses: RetencaoMes[];
  ehGestor: boolean;
}) {
  const router = useRouter();
  const [estadoNovo, acaoNovo] = useFormState(criarCasoRetencao, inicial);
  const [auditando, setAuditando] = useState(false);
  const [msgAud, setMsgAud] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action={acaoNovo} className="flex flex-wrap items-end gap-2">
          <Input name="cliente_nome" placeholder="cliente (telefone/loja)" className="w-52" />
          <Input name="sgp_contrato_id" placeholder="contrato SGP" className="w-32" />
          <Input name="telefone" placeholder="telefone" className="w-36" />
          <button type="submit" className="h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            + Novo caso
          </button>
          {estadoNovo.erro && <span className="text-xs text-farol-vermelho">{estadoNovo.erro}</span>}
          {estadoNovo.ok && <span className="text-xs text-farol-verde">{estadoNovo.ok}</span>}
        </form>
        {ehGestor && (
          <div className="flex items-center gap-2">
            {msgAud && <span className="text-xs text-muted-foreground">{msgAud}</span>}
            <button type="button" disabled={auditando}
              onClick={async () => {
                setAuditando(true);
                const r = await rodarAuditoria();
                setMsgAud(r.detalhe ?? r.erro ?? null);
                setAuditando(false);
                router.refresh();
              }}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {auditando ? "Auditando…" : "🔄 Auditar no SGP"}
            </button>
          </div>
        )}
      </div>

      {meses.map((m) => (
        <Card key={m.agente}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{m.agente}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="verde">retidos {m.retidos}</Badge>
                <Badge variant="vermelho">perdidos {m.perdidos}</Badge>
                <Badge variant="amarelo">em risco {m.emRisco}</Badge>
                <Badge variant="outline">irreversíveis {m.irreversiveis}</Badge>
                {m.clawbacks > 0 && <Badge variant="vermelho">claw {m.clawbacks}</Badge>}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Taxa <strong>{m.taxaPct.toFixed(0)}%</strong> ({m.retidos}/{m.elegiveis} elegíveis)
              {m.abaixoDoPiso
                ? " · abaixo do piso de 15 casos — avaliação manual"
                : ` · faixa ${m.faixaPct}% · VTV retido ${formatarMoeda(m.vtvRetido)} · comissão ${formatarMoeda(m.comissao)}`}
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="max-h-[32rem] overflow-y-auto">
              {m.linhas.map((c) => <Caso key={c.id} c={c} podeEditar={true} />)}
            </div>
          </CardContent>
        </Card>
      ))}
      {meses.length === 0 && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum caso neste mês ainda.
        </CardContent></Card>
      )}
    </div>
  );
}
