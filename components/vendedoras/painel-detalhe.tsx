"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { aprovarVenda, revogarAprovacao } from "@/app/(app)/metas/aprovacoes/acoes";
import { desfazerDesistencia } from "@/app/(app)/esteira/acoes";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { GraficoHistorico } from "@/components/vendedoras/grafico-historico";
import { GraficoBarrasHorizontais } from "@/components/dashboard/graficos";
import { BadgeStatus } from "@/components/vendedoras/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from "@/lib/format";
import { ROTULO_ORIGEM } from "@/lib/tipos";
import type { DetalheVendedora } from "@/lib/vendedoras/dados";

/**
 * Corpo do drill-down da vendedora (PRD 3.2). Reutilizado em duas telas:
 * /vendedoras/[id] (gestor/supervisor) e /minhas-vendas (a própria vendedora).
 */
const MESES_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];
/** "2026-05-01" -> "mai/26" */
function rotuloMesCurto(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES_CURTO[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

/** Resumo colorido da situação atual das vendas do período (ao lado do título). */
function ResumoStatus({ vendas }: { vendas: { status: string }[] }) {
  const contagem = new Map<string, number>();
  for (const v of vendas) contagem.set(v.status, (contagem.get(v.status) ?? 0) + 1);

  const ORDEM: { chave: string; rotulo: string; classe: string }[] = [
    { chave: "ativo", rotulo: "ativos", classe: "bg-farol-verde/12 text-farol-verde ring-farol-verde/25" },
    { chave: "aguardando_ativacao", rotulo: "aguardando ativação", classe: "bg-amber-100 text-amber-800 ring-amber-300/60" },
    { chave: "pendente_assinatura", rotulo: "pendente assinatura", classe: "bg-sky-100 text-sky-800 ring-sky-300/60" },
    { chave: "suspenso", rotulo: "suspensos", classe: "bg-orange-100 text-orange-800 ring-orange-300/60" },
    { chave: "cancelado", rotulo: "cancelados", classe: "bg-rose-100 text-rose-800 ring-rose-300/60" },
  ];
  const visiveis = ORDEM.filter((o) => (contagem.get(o.chave) ?? 0) > 0);
  if (visiveis.length === 0) return null;

  const naoAtivos = vendas.length - (contagem.get("ativo") ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visiveis.map((o) => (
        <span
          key={o.chave}
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${o.classe}`}
          title={`${contagem.get(o.chave)} ${o.rotulo} no período`}
        >
          {contagem.get(o.chave)} {o.rotulo}
        </span>
      ))}
      {naoAtivos > 0 && (
        <span className="text-xs text-muted-foreground">
          · {naoAtivos} não {naoAtivos === 1 ? "ativo" : "ativos"} (
          {Math.round((naoAtivos / Math.max(1, vendas.length)) * 100)}%)
        </span>
      )}
    </div>
  );
}

export function PainelDetalheVendedora({
  detalhe,
  linkTemplate = "",
  ehGestor = false,
}: {
  detalhe: DetalheVendedora;
  /** template do link do SGP — deixa cliente e contrato clicáveis */
  linkTemplate?: string;
  /** gestor aprova/revoga a liberação direto na lista */
  ehGestor?: boolean;
}) {
  const k = detalhe.kpis;
  const router = useRouter();
  const [fStatus, setFStatus] = useState("");
  const [aprovando, setAprovando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const statusDisponiveis = useMemo(
    () => [...new Set(detalhe.vendas.map((v) => v.status))].sort(),
    [detalhe.vendas]
  );
  const vendasFiltradas = useMemo(
    () => (fStatus ? detalhe.vendas.filter((v) => v.status === fStatus) : detalhe.vendas),
    [detalhe.vendas, fStatus]
  );

  async function executar(fn: () => Promise<{ erro?: string; ok?: string }>) {
    setOcupado(true);
    setAviso(null);
    const r = await fn();
    setOcupado(false);
    setAviso(r.erro ?? r.ok ?? null);
    if (!r.erro) {
      setAprovando(null);
      setMotivo("");
      router.refresh();
    }
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <CartaoKpi
          rotulo={k.doPeriodo ? "Vendas no período" : "Vendas no mês"}
          valor={formatarNumero(k.vendasMes)}
        />
        <CartaoKpi rotulo="Receita contratada" valor={formatarMoeda(k.receitaMes)} />
        <CartaoKpi rotulo="Ticket médio" valor={formatarMoeda(k.ticketMedio)} />
        <CartaoKpi
          rotulo={
            k.doPeriodo
              ? k.mesReferencia
                ? `Meta de ${rotuloMesCurto(k.mesReferencia)}`
                : "Meta"
              : "Meta do mês"
          }
          valor={k.percentualMeta === null ? "—" : formatarPercentual(k.percentualMeta, 0)}
          contexto={
            k.metaMensal === null
              ? k.doPeriodo
                ? "período não coincide com um mês fechado"
                : "sem meta cadastrada"
              : k.doPeriodo
                ? `${k.vendasMes} de ${k.metaMensal} no período`
                : k.pace === 0
                  ? "meta batida 🎉"
                  : `pace: ${k.pace!.toFixed(1).replace(".", ",")}/dia útil · meta ${k.metaMensal} (${k.metaDiaria!.toFixed(1).replace(".", ",")}/dia)`
          }
          tom={k.farol ?? undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Funil do período</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoBarrasHorizontais
              dados={detalhe.funil.map((f) => ({ nome: f.etapa, valor: f.quantidade }))}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Conversão vendida → instalada:{" "}
              {detalhe.funil[0].quantidade === 0
                ? "—"
                : formatarPercentual(detalhe.funil[2].quantidade / detalhe.funil[0].quantidade, 0)}{" "}
              (regra 5.12 · funil completo com o CRM na Fase 2)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Meta × realizado — últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoHistorico dados={detalhe.historico} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <CardTitle>Vendas do período ({vendasFiltradas.length})</CardTitle>
              <ResumoStatus vendas={detalhe.vendas} />
              <select
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Status: todos</option>
                {statusDisponiveis.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              {aviso && <span className="text-xs text-muted-foreground">{aviso}</span>}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Contrato</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Plano</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    {ehGestor && <th className="px-3 py-2 font-medium">Comissão</th>}
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map((v) => {
                    const link = aplicarLinkSgp(linkTemplate, {
                      clienteId: v.sgpClienteId,
                      contratoId: v.sgpContratoId,
                      cpf: v.cpf,
                    });
                    return (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {formatarData(v.data_venda)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {v.sgpContratoId && link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-interlig-ceu hover:underline"
                            title="Abrir contrato no SGP"
                          >
                            #{v.sgpContratoId} ↗
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{v.sgpContratoId ? `#${v.sgpContratoId}` : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            title="Abrir cliente no SGP"
                          >
                            {v.cliente}
                          </a>
                        ) : (
                          v.cliente
                        )}
                      </td>
                      <td className="px-3 py-2">{v.plano}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(v.valor)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.origem ? ROTULO_ORIGEM[v.origem] : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <BadgeStatus status={v.status} />
                      </td>
                      {ehGestor && (
                        <td className="whitespace-nowrap px-3 py-2">
                          {v.desistiu ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                desistiu
                              </span>
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() => executar(() => desfazerDesistencia(v.id))}
                                className="rounded-md border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
                                title="Desfaz a desistência — volta às pendências"
                              >
                                Desfazer
                              </button>
                            </span>
                          ) : v.liberada ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                liberada pela gestão
                              </span>
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() =>
                                  executar(() =>
                                    revogarAprovacao(v.id, `${v.data_venda.slice(0, 7)}-01`)
                                  )
                                }
                                className="rounded-md border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
                                title="Desfaz a liberação — a venda volta a depender da ativação"
                              >
                                Revogar
                              </button>
                            </span>
                          ) : v.assinaturaPendente ? (
                            <span
                              className="text-[11px] text-rose-700"
                              title="Sem Termo de Adesão + Fidelidade assinados a política não permite liberar — nem pela gestão."
                            >
                              🔒 sem assinatura
                            </span>
                          ) : v.status === "ativo" ? (
                            <span className="text-[11px] text-muted-foreground">conta ✓</span>
                          ) : v.status === "cancelado" ? (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          ) : aprovando === v.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                autoFocus
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                placeholder="motivo (ex.: instala amanhã)"
                                className="h-7 w-44 rounded-md border border-input bg-background px-2 text-[11px]"
                              />
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() =>
                                  executar(() =>
                                    aprovarVenda(v.id, `${v.data_venda.slice(0, 7)}-01`, motivo, [v.status])
                                  )
                                }
                                className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                onClick={() => setAprovando(null)}
                                className="rounded-md border px-1.5 py-1 text-[11px] hover:bg-muted"
                              >
                                ✕
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setAprovando(v.id); setMotivo(""); }}
                              className="rounded-md border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                              title="Libera a venda para a comissão mesmo antes da ativação"
                            >
                              Aprovar p/ comissão
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                  {vendasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={ehGestor ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhuma venda no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
