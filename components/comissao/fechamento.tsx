"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fecharComissoes, refazerFechamento, type EstadoFechamento } from "@/app/(app)/metas/acoes";
import { Button } from "@/components/ui/button";

export function PainelFechamento({ mesAnterior, jaFechado }: { mesAnterior: string; jaFechado: boolean }) {
  const router = useRouter();
  const [aguardando, setAguardando] = useState(false);
  const [estado, setEstado] = useState<EstadoFechamento | null>(null);
  const rotuloMes = mesAnterior.slice(0, 7).split("-").reverse().join("/");

  async function executar(refazer: boolean) {
    const confirmacao = refazer
      ? `Refazer o fechamento de ${rotuloMes}? Os snapshots atuais serão substituídos (recálculo retroativo explícito).`
      : `Fechar as comissões de ${rotuloMes}? Os valores viram snapshot imutável.`;
    if (!confirm(confirmacao)) return;
    setAguardando(true);
    setEstado(refazer ? await refazerFechamento(mesAnterior) : await fecharComissoes(mesAnterior));
    setAguardando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => executar(false)} disabled={aguardando || jaFechado}>
        {jaFechado ? `Mês ${rotuloMes} já fechado` : aguardando ? "Fechando…" : `Fechar comissões de ${rotuloMes}`}
      </Button>
      {jaFechado && (
        <Button variant="outline" onClick={() => executar(true)} disabled={aguardando}>
          Refazer (recálculo explícito)
        </Button>
      )}
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      {estado?.fechadas !== undefined && (
        <p className="text-sm text-muted-foreground">
          {estado.fechadas} de {estado.total} snapshot(s) gravado(s).
        </p>
      )}
    </div>
  );
}
