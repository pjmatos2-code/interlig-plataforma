"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { concluirFollowupIa } from "@/app/(app)/crm/acoes";

/**
 * Marca o follow-up pendente como FEITO, com campo para registrar o retorno
 * obtido. Usado no painel de follow-ups do CRM e dentro do ticket.
 */
export function FollowupFeito({ ticketId, compacto = false }: { ticketId: string; compacto?: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [retorno, setRetorno] = useState("");
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setAguardando(true);
    const fd = new FormData();
    fd.set("ticket_id", ticketId);
    fd.set("retorno", retorno);
    const r = await concluirFollowupIa({}, fd);
    setErro(r.erro ?? null);
    setAguardando(false);
    if (!r.erro) {
      setAberto(false);
      router.refresh();
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className={
          compacto
            ? "rounded-md bg-emerald-600/10 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-600/20"
            : "rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
        }
      >
        ✓ Follow-up feito
      </button>
    );
  }

  return (
    <div className="mt-1 w-full space-y-1.5">
      <textarea
        value={retorno}
        onChange={(e) => setRetorno(e.target.value)}
        placeholder="Qual foi o retorno? (ex.: cliente pediu para ligar sexta · fechou o plano · sem resposta)"
        rows={2}
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          onClick={confirmar}
          disabled={aguardando}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {aguardando ? "Salvando…" : "Confirmar"}
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-md px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700"
        >
          Cancelar
        </button>
        {erro && <span className="text-xs text-destructive">{erro}</span>}
      </div>
    </div>
  );
}
