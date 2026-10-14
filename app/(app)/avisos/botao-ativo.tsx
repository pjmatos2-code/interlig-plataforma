"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarAviso } from "./acoes";

export function BotaoAtivo({ id, ativo }: { id: string; ativo: boolean }) {
  const router = useRouter();
  const [pendente, comecar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() =>
        comecar(async () => {
          if (ativo && !confirm("Desativar este aviso? Quem ainda não leu deixa de ver o popup.")) return;
          await alternarAviso(id, !ativo);
          router.refresh();
        })
      }
      className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
    >
      {pendente ? "…" : ativo ? "Desativar" : "Reativar"}
    </button>
  );
}
