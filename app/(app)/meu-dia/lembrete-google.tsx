"use client";

import { useState } from "react";
import { Check, Copy, Star } from "lucide-react";

export const IconeGoogle = () => <Star className="h-5 w-5" />;

/** link de avaliação do Perfil da Empresa da Interlig no Google ("Pedir avaliações") */
export const LINK_AVALIACAO_GOOGLE = "";

/** Lembrete simples — sem regra nem controle: só o texto pronto para mandar ao cliente */
export function CopiarMensagemGoogle({ agente }: { agente: string }) {
  const [copiado, setCopiado] = useState(false);
  if (!LINK_AVALIACAO_GOOGLE) return null;
  const mensagem = `Obrigada pelo atendimento! 😊 Se puder, deixe sua avaliação da Interlig no Google — leva menos de 1 minuto e ajuda muito: ${LINK_AVALIACAO_GOOGLE}\n${agente} · Interlig`;
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(mensagem);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }}
      className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90"
    >
      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copiado ? "Mensagem copiada" : "Copiar mensagem com o link"}
    </button>
  );
}
