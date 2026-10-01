"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { excluirTicket } from "@/app/(app)/crm/acoes";

/**
 * Exclusão rápida de ticket DUPLICADO direto do quadro (gestor, 01/10/2026).
 * Mesma ação do detalhe (apaga histórico e filhos) — permanente, com confirmação.
 */
export function ExcluirTicketMini({ ticketId, cliente }: { ticketId: string; cliente: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      disabled={ocupado}
      title="Excluir ticket (duplicidade) — permanente"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Excluir DEFINITIVAMENTE o ticket de "${cliente}"?\nUse apenas para duplicidade/teste — apaga o histórico.`)) return;
        setOcupado(true);
        try {
          await excluirTicket(ticketId); // sucesso redireciona /crm
          router.refresh();
        } finally {
          setOcupado(false);
        }
      }}
      className="shrink-0 rounded-md px-1 text-[13px] leading-none text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
    >
      {ocupado ? "…" : "🗑"}
    </button>
  );
}
