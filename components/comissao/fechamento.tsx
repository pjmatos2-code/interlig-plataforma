"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  fecharComissoes,
  refazerFechamento,
  excluirFechamento,
  type EstadoFechamento,
} from "@/app/(app)/metas/acoes";
import { Button } from "@/components/ui/button";

/**
 * Fechamento da competência. O mês é ESCOLHIDO (padrão: mês atual) — fechar
 * "o anterior" automático já gerou fechamento de julho por engano em 31/08.
 */
export function PainelFechamento({
  mesAtual,
  mesAnterior,
  fechados,
}: {
  mesAtual: string;
  mesAnterior: string;
  /** competências que já têm fechamento gravado */
  fechados: string[];
}) {
  const router = useRouter();
  const [mes, setMes] = useState(mesAtual);
  const [aguardando, setAguardando] = useState(false);
  const [estado, setEstado] = useState<EstadoFechamento | null>(null);
  const rotulo = (m: string) => m.slice(0, 7).split("-").reverse().join("/");
  const jaFechado = fechados.includes(mes);

  async function rodar(fn: () => Promise<EstadoFechamento>) {
    setAguardando(true);
    setEstado(await fn());
    setAguardando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm">
        <span className="mr-2 text-xs text-muted-foreground">Competência</span>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value={mesAtual}>{rotulo(mesAtual)} (mês atual)</option>
          <option value={mesAnterior}>{rotulo(mesAnterior)}</option>
        </select>
      </label>

      <Button
        onClick={() => {
          if (
            confirm(
              `Fechar as comissões de ${rotulo(mes)}? Os valores viram snapshot imutável e liberam o módulo Financeiro.`
            )
          )
            void rodar(() => fecharComissoes(mes));
        }}
        disabled={aguardando || jaFechado}
      >
        {jaFechado ? `${rotulo(mes)} já fechado` : aguardando ? "Fechando…" : `Fechar comissões de ${rotulo(mes)}`}
      </Button>

      {jaFechado && (
        <>
          <Button
            variant="outline"
            disabled={aguardando}
            onClick={() => {
              // reabrir invalida demonstrativos já entregues: exige motivo
              const motivo = prompt(
                `Reabrir o fechamento de ${rotulo(mes)}?\n\nO fechamento atual vai para o histórico, a versão sobe e os demonstrativos já entregues deixam de valer. Descreva o motivo:`
              );
              if (motivo !== null) void rodar(() => refazerFechamento(mes, motivo));
            }}
          >
            Reabrir (com motivo)
          </Button>
          <Button
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            disabled={aguardando}
            onClick={() => {
              const motivo = prompt(
                `EXCLUIR o fechamento de ${rotulo(mes)}?\n\nUse apenas quando a competência foi fechada por engano (nenhum pagamento registrado). Descreva o motivo:`
              );
              if (motivo !== null) void rodar(() => excluirFechamento(mes, motivo));
            }}
          >
            Excluir fechamento (engano)
          </Button>
        </>
      )}

      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      {estado?.fechadas !== undefined && (
        <p className="text-sm text-muted-foreground">
          {estado.fechadas > 0
            ? `${estado.fechadas} de ${estado.total} snapshot(s) gravado(s).`
            : `${estado.total} snapshot(s) excluído(s).`}
        </p>
      )}
    </div>
  );
}
