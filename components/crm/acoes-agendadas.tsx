"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarAcaoTicket, concluirAcaoTicket } from "@/app/(app)/crm/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AcaoAgendada = {
  id: string;
  descricao: string;
  quando: string; // ISO
  concluida_em: string | null;
  notificado_em: string | null;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Santarem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Ações agendadas do ticket: "ligar amanhã às 10:00" → lembrete no sino na
 * data/hora marcadas (para a vendedora responsável, o coordenador e o admin).
 */
export function AcoesAgendadas({ ticketId, acoes }: { ticketId: string; acoes: AcaoAgendada[] }) {
  const router = useRouter();
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function agendar() {
    setAguardando(true);
    const fd = new FormData();
    fd.set("ticket_id", ticketId);
    fd.set("descricao", descricao);
    fd.set("data", data);
    fd.set("hora", hora);
    const r = await criarAcaoTicket({}, fd);
    setErro(r.erro ?? null);
    setAguardando(false);
    if (!r.erro) {
      setDescricao(""); setData(""); setHora("");
      router.refresh();
    }
  }

  const agora = Date.now();
  const pendentes = acoes.filter((a) => !a.concluida_em);
  const feitas = acoes.filter((a) => a.concluida_em);

  return (
    <div className="space-y-3">
      {/* nova ação */}
      <div className="space-y-2">
        <Input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ação (ex.: ligar para o cliente)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button size="sm" onClick={agendar} disabled={aguardando}>
            {aguardando ? "Agendando…" : "⏰ Agendar"}
          </Button>
        </div>
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <p className="text-[11px] text-muted-foreground">
          No horário marcado, o lembrete chega no sino 🔔 da responsável, do coordenador e do admin.
        </p>
      </div>

      {/* pendentes */}
      {pendentes.length > 0 && (
        <ul className="space-y-1.5">
          {pendentes.map((a) => {
            const atrasada = Date.parse(a.quando) < agora;
            return (
              <li
                key={a.id}
                className={
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm " +
                  (atrasada ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white/70")
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{a.descricao}</span>
                  <span className={"ml-2 text-xs tabular-nums " + (atrasada ? "font-bold text-rose-600" : "text-muted-foreground")}>
                    {fmt(a.quando)}{atrasada ? " · atrasada" : a.notificado_em ? " · 🔔 avisada" : ""}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    await concluirAcaoTicket(a.id, ticketId);
                    router.refresh();
                  }}
                  className="shrink-0 rounded-md bg-emerald-600/10 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-600/20"
                >
                  ✓ Feita
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* concluídas (últimas 3) */}
      {feitas.length > 0 && (
        <ul className="space-y-1">
          {feitas.slice(0, 3).map((a) => (
            <li key={a.id} className="text-xs text-muted-foreground line-through">
              {a.descricao} · {fmt(a.quando)}
            </li>
          ))}
        </ul>
      )}
      {acoes.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma ação agendada ainda.</p>
      )}
    </div>
  );
}
