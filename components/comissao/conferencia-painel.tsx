"use client";

import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConferenciaSgp, ConferenciaItem } from "@/lib/comissao/dados";

type FiltroStatus = "todos" | "elegivel" | "pendente" | "glosado" | "divergencia";

const ROTULO_STATUS: Record<FiltroStatus, string> = {
  todos: "Todas",
  elegivel: "Elegíveis",
  pendente: "Pendentes",
  glosado: "Glosadas",
  divergencia: "Divergências",
};

/** Planilha (CSV com BOM e ';' — abre direto no Excel pt-BR). */
function exportarPlanilha(itens: ConferenciaItem[], competencia: string, sufixo: string) {
  const cab = [
    "Data da venda", "Contrato", "Cliente", "Vendedora", "Plano",
    "Vl. base (R$)", "Status SGP", "Nossa validação", "O que falta / situação",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas = itens.map((i) =>
    [
      i.dataVenda ? i.dataVenda.split("-").reverse().join("/") : "",
      i.sgpContratoId,
      i.cliente ?? "",
      i.vendedora,
      i.plano ?? "",
      i.vlBase > 0 ? i.vlBase.toFixed(2).replace(".", ",") : "",
      i.statusSgp,
      i.nossaLiberada ? "liberada" : "não liberada",
      i.pendencias.join(" | "),
    ]
      .map(esc)
      .join(";")
  );
  const csv = "\ufeff" + [cab.map(esc).join(";"), ...linhas].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `conferencia-${sufixo}-${competencia.slice(0, 7)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function BadgeSgp({ s }: { s: ConferenciaItem["statusSgp"] }) {
  return s === "elegivel" ? (
    <Badge variant="verde">elegível</Badge>
  ) : s === "pendente" ? (
    <Badge variant="amarelo">pendente</Badge>
  ) : (
    <Badge variant="vermelho">glosado</Badge>
  );
}

/**
 * Conferência com o SGP com drill-down: os números da tabela são clicáveis e
 * filtram a lista de contratos abaixo — principalmente os PENDENTES, para agir
 * antes do fechamento da comissão sem prejudicar as agentes.
 */
export function ConferenciaPainel({
  conferencia,
  linkTemplate,
}: {
  conferencia: ConferenciaSgp;
  linkTemplate: string;
}) {
  const [vendedora, setVendedora] = useState<string | null>(null);
  const [status, setStatus] = useState<FiltroStatus>("todos");
  const lista = useRef<HTMLDivElement>(null);

  function filtrar(v: string | null, s: FiltroStatus) {
    setVendedora(v);
    setStatus(s);
    setTimeout(() => lista.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  const filtrados = useMemo(
    () =>
      conferencia.itens.filter((i) => {
        if (vendedora && i.vendedora !== vendedora) return false;
        if (status === "divergencia") return i.diverge;
        if (status !== "todos") return i.statusSgp === status;
        return true;
      }),
    [conferencia.itens, vendedora, status]
  );

  const t = conferencia.totais;
  const celula =
    "px-3 py-2.5 text-right tabular-nums cursor-pointer rounded transition-colors hover:bg-interlig-ceu/10 hover:underline";

  return (
    <div className="space-y-5">
      {/* KPIs clicáveis */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["SGP elegíveis", t.sgpElegivel, "text-farol-verde", "elegivel"],
            ["SGP pendentes", t.sgpPendente, "text-farol-amarelo", "pendente"],
            ["SGP glosadas", t.sgpGlosado, "text-farol-vermelho", "glosado"],
            ["Divergências", t.divergencias, "text-interlig-azul", "divergencia"],
          ] as const
        ).map(([rotulo, valor, cor, filtro]) => (
          <button
            key={rotulo}
            onClick={() => filtrar(null, filtro)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors hover:border-interlig-ceu/60 hover:bg-interlig-ceu/5",
              status === filtro && !vendedora && "border-interlig-ceu ring-1 ring-interlig-ceu/40"
            )}
            title={`Listar ${ROTULO_STATUS[filtro].toLowerCase()}`}
          >
            <p className="text-xs text-muted-foreground">{rotulo} ▾</p>
            <p className={cn("text-xl font-semibold", cor)}>{valor}</p>
          </button>
        ))}
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Nós liberamos (D5)</p>
          <p className="text-xl font-semibold">{t.nossaLiberada}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Receita base elegível</p>
          <p className="text-xl font-semibold tabular-nums">{formatarMoeda(t.receitaBaseElegivel)}</p>
        </div>
      </div>

      {/* tabela por vendedora — números clicáveis */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Vendedora</th>
              <th className="px-3 py-2.5 text-right font-medium">Vendas</th>
              <th className="px-3 py-2.5 text-right font-medium">SGP eleg.</th>
              <th className="px-3 py-2.5 text-right font-medium">SGP pend.</th>
              <th className="px-3 py-2.5 text-right font-medium">SGP glos.</th>
              <th className="px-3 py-2.5 text-right font-medium">Nós liberamos</th>
              <th className="px-3 py-2.5 text-right font-medium">Divergências</th>
            </tr>
          </thead>
          <tbody>
            {conferencia.porVendedora.map((v) => (
              <tr key={v.nome} className="border-b last:border-0">
                <td
                  className="cursor-pointer px-4 py-2.5 font-medium hover:text-primary hover:underline"
                  onClick={() => filtrar(v.nome, "todos")}
                  title="Listar todas as vendas dela"
                >
                  {v.nome}
                </td>
                <td className={celula} onClick={() => filtrar(v.nome, "todos")}>{v.total}</td>
                <td className={cn(celula, "text-farol-verde")} onClick={() => filtrar(v.nome, "elegivel")}>{v.sgpElegivel}</td>
                <td className={cn(celula, "font-semibold text-farol-amarelo")} onClick={() => filtrar(v.nome, "pendente")}>{v.sgpPendente}</td>
                <td className={cn(celula, "text-muted-foreground")} onClick={() => filtrar(v.nome, "glosado")}>{v.sgpGlosado || "—"}</td>
                <td className={celula} onClick={() => filtrar(v.nome, "todos")}>{v.nossaLiberada}</td>
                <td className={celula} onClick={() => filtrar(v.nome, "divergencia")}>
                  {v.divergencias > 0 ? <Badge variant="amarelo">{v.divergencias}</Badge> : <span className="text-farol-verde">✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* drill-down */}
      <div ref={lista} className="scroll-mt-24 rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <p className="text-sm font-semibold">
            {ROTULO_STATUS[status]}
            {vendedora ? ` · ${vendedora}` : ""}
            <span className="ml-1.5 text-muted-foreground">({filtrados.length})</span>
          </p>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {(Object.keys(ROTULO_STATUS) as FiltroStatus[]).map((skey) => (
              <button
                key={skey}
                onClick={() => setStatus(skey)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  status === skey ? "border-interlig-ceu bg-interlig-ceu/10 font-semibold text-interlig-azul" : "text-muted-foreground hover:border-interlig-ceu/50"
                )}
              >
                {ROTULO_STATUS[skey]}
              </button>
            ))}
            {vendedora && (
              <button
                onClick={() => setVendedora(null)}
                className="rounded-full border border-rose-200 px-2.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
              >
                ✕ {vendedora}
              </button>
            )}
            <button
              onClick={() =>
                exportarPlanilha(
                  conferencia.itens.filter(
                    (i) => i.statusSgp === "pendente" && (!vendedora || i.vendedora === vendedora)
                  ),
                  conferencia.competencia,
                  "pendentes"
                )
              }
              className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              title="Baixa a planilha dos contratos pendentes (respeita a vendedora filtrada)"
            >
              ⬇ Exportar pendentes
            </button>
            <button
              onClick={() => exportarPlanilha(filtrados, conferencia.competencia, "filtro")}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-interlig-ceu/50"
              title="Baixa a planilha exatamente do que está listado abaixo"
            >
              ⬇ Exportar esta lista
            </button>
          </div>
        </div>
        <div className="max-h-[28rem] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Contrato</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Vendedora</th>
                <th className="px-3 py-2 font-medium">Plano</th>
                <th className="px-3 py-2 text-right font-medium">Vl. base</th>
                <th className="px-3 py-2 font-medium">SGP</th>
                <th className="px-3 py-2 font-medium">O que falta / situação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i) => {
                const link = aplicarLinkSgp(linkTemplate, {
                  clienteId: i.sgpClienteId,
                  contratoId: i.sgpContratoId,
                  cpf: null,
                });
                return (
                  <tr key={i.sgpContratoId} className={cn("border-b last:border-0", i.statusSgp === "pendente" && "bg-amber-50/40")}>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {i.dataVenda ? `${i.dataVenda.slice(8, 10)}/${i.dataVenda.slice(5, 7)}` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-interlig-ceu hover:underline" title="Abrir no SGP">
                          #{i.sgpContratoId} ↗
                        </a>
                      ) : (
                        `#${i.sgpContratoId}`
                      )}
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2">{i.cliente ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{i.vendedora}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-muted-foreground">{i.plano ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.vlBase > 0 ? formatarMoeda(i.vlBase) : "—"}</td>
                    <td className="px-3 py-2"><BadgeSgp s={i.statusSgp} /></td>
                    <td className="px-3 py-2">
                      {i.pendencias.length === 0 ? (
                        <span className="text-xs font-medium text-farol-verde">✓ tudo certo</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {i.pendencias.map((p) => (
                            <span key={p} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum contrato neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
