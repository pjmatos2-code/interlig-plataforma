"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import type { ClienteDeixado } from "@/lib/operacao/deixados-dados";
import { ROTULO_SITUACAO_DEIXADO, type SituacaoDeixado } from "@/lib/operacao/deixados";

const UNIDADES = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
const COR: Record<SituacaoDeixado, string> = {
  falta_assinatura: "bg-amber-100 text-amber-900",
  atendido_falta_ativar: "bg-sky-100 text-sky-800",
  os_encerrada: "bg-sky-100 text-sky-800",
  pendente: "bg-farol-vermelho/15 text-farol-vermelho",
  agendado: "bg-farol-verde/15 text-farol-verde",
  agendamento_vencido: "bg-farol-vermelho/15 text-farol-vermelho",
  sem_agendamento: "bg-farol-vermelho/15 text-farol-vermelho",
};
const dataBr = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3_600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
};

export function ListaDeixados({ lista, janela, linkTemplate, agora }: { lista: ClienteDeixado[]; janela: { de: string; ate: string }; linkTemplate: string | null; agora: number }) {
  const [unidade, setUnidade] = useState("todas");
  const [situacao, setSituacao] = useState<SituacaoDeixado | "todas">("todas");
  const [busca, setBusca] = useState("");
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(
      (c) =>
        (unidade === "todas" || c.unidade === unidade) &&
        (situacao === "todas" || c.situacao === situacao) &&
        (!q || [c.cliente, c.bairro, c.tecnico, c.vendedora, c.osId, c.sgpContratoId].some((v) => (v ?? "").toLowerCase().includes(q)))
    );
  }, [lista, unidade, situacao, busca]);
  const contagem = useMemo(() => {
    const m = new Map<SituacaoDeixado, number>();
    for (const c of lista.filter((x) => unidade === "todas" || x.unidade === unidade)) m.set(c.situacao, (m.get(c.situacao) ?? 0) + 1);
    return m;
  }, [lista, unidade]);
  const situacoes = (Object.keys(ROTULO_SITUACAO_DEIXADO) as SituacaoDeixado[]).filter((s) => contagem.get(s));
  const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  void agora;

  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border-2 p-4", lista.length ? "border-farol-vermelho/50 bg-farol-vermelho/5" : "border-farol-verde/50 bg-farol-verde/5")}>
        <p className="text-sm font-medium text-muted-foreground">Deixados para trás · OS criadas de {fmt(janela.de)} a {fmt(janela.ate)}</p>
        <p className={cn("text-3xl font-semibold tabular-nums", lista.length ? "text-farol-vermelho" : "text-farol-verde")}>{lista.length}</p>
        <p className="text-xs text-muted-foreground">{lista.length ? "Meta zero: cada cliente desta lista precisa de uma ação." : "Nenhum cliente ficou para trás."}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unidade">
          {["todas", ...UNIDADES].map((u) => (
            <button key={u} type="button" onClick={() => setUnidade(u)} aria-pressed={unidade === u} className={cn("rounded-full border px-3 py-1 text-xs font-medium", unidade === u ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:bg-muted")}>
              {u === "todas" ? "Todas as unidades" : u}
            </button>
          ))}
        </div>
        <label className="relative block lg:w-72">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, bairro, técnico, vendedora…" className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-interlig-ceu" />
        </label>
      </div>

      {situacoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="O que trava">
          <button type="button" onClick={() => setSituacao("todas")} aria-pressed={situacao === "todas"} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", situacao === "todas" ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:bg-muted")}>
            Todas
          </button>
          {situacoes.map((s) => (
            <button key={s} type="button" onClick={() => setSituacao(s)} aria-pressed={situacao === s} className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-black/5", COR[s], situacao === s && "ring-2 ring-interlig-azul")}>
              {ROTULO_SITUACAO_DEIXADO[s]} · {contagem.get(s)}
            </button>
          ))}
        </div>
      )}

      <ul className="grid gap-2 lg:grid-cols-2">
        {filtrados.map((c) => {
          const link = aplicarLinkSgp(linkTemplate, { clienteId: c.sgpClienteId, contratoId: c.sgpContratoId, cpf: c.documento });
          return (
            <li key={c.sgpContratoId} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{c.cliente}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.unidade}
                    {c.bairro ? ` · ${c.bairro}` : ""}
                    {c.vendedora ? ` · vendido por ${c.vendedora}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-farol-vermelho/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-farol-vermelho">{c.diasEsperando} dias</span>
              </div>
              <p className="mt-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", COR[c.situacao])}>
                  {ROTULO_SITUACAO_DEIXADO[c.situacao]}
                  {(c.situacao === "agendado" || c.situacao === "agendamento_vencido") && c.agendamento ? ` · ${dataBr(c.agendamento)}` : ""}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  OS {c.osId} criada em {dataBr(c.osCriadaEm)} · Contrato {c.sgpContratoId}
                  {c.tecnico ? ` · ${c.tecnico}` : " · sem técnico"}
                </span>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-interlig-ceu hover:underline">
                    SGP <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {filtrados.length === 0 && lista.length > 0 && <p className="text-center text-sm text-muted-foreground">Nenhum cliente com esses filtros.</p>}
    </div>
  );
}
