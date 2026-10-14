"use client";

import { useState } from "react";
import { Check, Copy, MessagesSquare } from "lucide-react";

/**
 * Contato com o cliente pelo SZ Chat (14/10/2026): toda tratativa acontece no
 * chat da Fortics — o link do WhatsApp Web saiu. O atalho abre o SZ e copia o
 * telefone para a vendedora iniciar o contato lá (com o modelo aprovado). A
 * abertura automática pela API depende de liberação da Fortics: as rotas de
 * iniciar contato só aceitam login de agente.
 */
export function ContatoSz({ telefone, linkSz }: { telefone: string | null; linkSz: string }) {
  const [copiado, setCopiado] = useState(false);
  const digitos = (telefone ?? "").replace(/\D/g, "");
  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={linkSz}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir o SZ Chat para falar com o cliente"
        className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-interlig-azul hover:underline"
      >
        <MessagesSquare className="h-3 w-3" /> SZ Chat
      </a>
      {digitos.length >= 10 && (
        <button
          type="button"
          title="Copiar o telefone para iniciar o contato no SZ"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(digitos);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              /* sem permissão de área de transferência: nada a fazer */
            }
          }}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
        >
          {copiado ? <Check className="h-3 w-3 text-farol-verde" /> : <Copy className="h-3 w-3" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      )}
    </span>
  );
}
