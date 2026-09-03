"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarCpfTicket } from "@/app/(app)/crm/acoes";

/**
 * CPF/CNPJ do cliente no ticket — editável inline depois do cadastro.
 * Pedido da venda externa (03/09/2026): a prospecção nasce sem documento e o
 * CPF chega depois; sem ele a busca ativa no SGP e a reconciliação não rodam.
 */
export function CpfTicket({ ticketId, cpf }: { ticketId: string; cpf: string | null }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(cpf ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, comecar] = useTransition();

  if (!editando)
    return (
      <span>
        {cpf ?? <span className="text-muted-foreground">—</span>}{" "}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {cpf ? "editar" : "incluir"}
        </button>
      </span>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="000.000.000-00"
        inputMode="numeric"
        className="h-7 w-40 rounded-md border border-input bg-background px-2 text-xs"
      />
      <button
        type="button"
        disabled={salvando}
        onClick={() =>
          comecar(async () => {
            setErro(null);
            const dados = new FormData();
            dados.set("ticket_id", ticketId);
            dados.set("cpf", valor);
            const r = await salvarCpfTicket({}, dados);
            if (r.erro) return setErro(r.erro);
            setEditando(false);
            router.refresh();
          })
        }
        className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-60"
      >
        Salvar
      </button>
      <button
        type="button"
        onClick={() => {
          setEditando(false);
          setValor(cpf ?? "");
          setErro(null);
        }}
        className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
      >
        Cancelar
      </button>
      {erro && <span className="text-[11px] text-destructive">{erro}</span>}
    </span>
  );
}
