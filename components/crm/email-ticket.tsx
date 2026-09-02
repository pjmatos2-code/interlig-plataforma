"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarEmailTicket } from "@/app/(app)/crm/acoes";

/** E-mail do cliente no ticket — opcional, editável inline. */
export function EmailTicket({ ticketId, email }: { ticketId: string; email: string | null }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(email ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, comecar] = useTransition();

  if (!editando)
    return (
      <span>
        {email ? (
          <a href={`mailto:${email}`} className="text-interlig-ceu hover:underline">{email}</a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}{" "}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {email ? "editar" : "incluir"}
        </button>
      </span>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        autoFocus
        type="email"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="cliente@email.com"
        className="h-7 w-52 rounded-md border border-input bg-background px-2 text-xs"
      />
      <button
        type="button"
        disabled={salvando}
        onClick={() =>
          comecar(async () => {
            setErro(null);
            const dados = new FormData();
            dados.set("ticket_id", ticketId);
            dados.set("email", valor);
            const r = await salvarEmailTicket({}, dados);
            if (r.erro) return setErro(r.erro);
            setEditando(false);
            router.refresh();
          })
        }
        className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-60"
      >
        Salvar
      </button>
      <button type="button" onClick={() => setEditando(false)} className="rounded-md border px-1.5 py-1 text-[11px] hover:bg-muted">✕</button>
      {erro && <span className="text-[11px] text-rose-700">{erro}</span>}
    </span>
  );
}
