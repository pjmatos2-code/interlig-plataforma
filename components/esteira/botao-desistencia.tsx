"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marcarDesistencia } from "@/app/(app)/esteira/acoes";

/**
 * Botão do gestor no card da esteira: cliente desistiu antes de ativar.
 * Pede o motivo ali mesmo e tira o contrato das pendências.
 */
export function BotaoDesistencia({ contratoId, cliente }: { contratoId: string; cliente: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
        title={`${cliente} desistiu? Tira o contrato das pendências (com motivo).`}
      >
        ✕ desistiu
      </button>
    );

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="motivo da desistência"
        className="h-6 w-36 rounded border border-input bg-background px-1.5 text-[11px]"
      />
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          setErro(null);
          const r = await marcarDesistencia(contratoId, motivo);
          setOcupado(false);
          if (r.erro) return setErro(r.erro);
          setAberto(false);
          router.refresh();
        }}
        className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
      >
        OK
      </button>
      <button type="button" onClick={() => setAberto(false)} className="text-[11px] text-muted-foreground">✕</button>
      {erro && <span className="text-[10px] text-rose-700">{erro}</span>}
    </span>
  );
}
