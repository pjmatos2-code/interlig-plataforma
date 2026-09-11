"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarTelefoneTicket } from "@/app/(app)/crm/acoes";

/**
 * Telefone do cliente editável inline — mesmo padrão do CPF/e-mail. Necessário
 * para corrigir números digitados errado (e os casos em que o SZ mandou o ID
 * interno do WhatsApp no lugar do número).
 */
export function TelefoneTicket({ ticketId, telefone }: { ticketId: string; telefone: string | null }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(telefone ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, comecar] = useTransition();

  if (!editando)
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="text-[11px] font-medium text-primary hover:underline"
      >
        {telefone ? "editar" : "incluir"}
      </button>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="(93) 9xxxx-xxxx"
        inputMode="tel"
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
            dados.set("telefone", valor);
            const r = await salvarTelefoneTicket({}, dados);
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
          setValor(telefone ?? "");
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
