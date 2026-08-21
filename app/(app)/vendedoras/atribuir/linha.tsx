"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { atribuirVenda } from "./acoes";

export function SeletorVendedora({
  contratoId,
  atualId,
  vendedoras,
}: {
  contratoId: string;
  atualId: string | null;
  vendedoras: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={atualId ?? ""}
        disabled={salvando}
        onChange={async (e) => {
          setSalvando(true);
          setErro(null);
          const r = await atribuirVenda(contratoId, e.target.value || null);
          setErro(r.erro ?? null);
          setSalvando(false);
          router.refresh();
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">— não atribuída —</option>
        {vendedoras.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nome}
          </option>
        ))}
      </select>
      {salvando && <span className="text-xs text-muted-foreground">salvando…</span>}
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </div>
  );
}
