"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { atualizarDoSzAgora } from "@/app/(app)/crm/acoes";

/** Botão de atualização forçada do SZ Chat (01/10/2026). */
export function AtualizarSz() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          setMsg("Buscando no SZ Chat… (até 1 min)");
          try {
            const r = await atualizarDoSzAgora();
            if (r.erro) setMsg(r.erro);
            else if (r.detalhe && !r.criados) setMsg(r.detalhe);
            else setMsg(`SZ: ${r.criados ?? 0} ticket(s) novo(s) · ${r.enriquecidos ?? 0} enriquecido(s)`);
            router.refresh();
          } finally {
            setOcupado(false);
          }
        }}
        className="rounded-xl border border-white/60 bg-white/55 px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-xl hover:bg-white/80 disabled:opacity-60"
        title="Puxa agora as conversas encerradas do SZ e enriquece os tickets abertos"
      >
        {ocupado ? "⏳ Atualizando…" : "⟳ Atualizar do SZ"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}
