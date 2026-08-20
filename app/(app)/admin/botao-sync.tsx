"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sincronizarAgora, type EstadoSync } from "./acoes";
import { Button } from "@/components/ui/button";

export function BotaoSincronizar() {
  const router = useRouter();
  const [aguardando, setAguardando] = useState(false);
  const [estado, setEstado] = useState<EstadoSync | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={aguardando}
        onClick={async () => {
          setAguardando(true);
          setEstado(await sincronizarAgora());
          setAguardando(false);
          router.refresh();
        }}
      >
        {aguardando ? "Sincronizando…" : "Sincronizar agora"}
      </Button>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      {estado?.resultado && (
        <p className="text-sm text-muted-foreground">
          Modo <strong>{estado.resultado.modo}</strong>:{" "}
          {estado.resultado.execucoes
            .map((e) => `${e.entidade} ${e.registros} (${e.status})`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
