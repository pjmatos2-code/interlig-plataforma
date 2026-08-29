"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirDebitoCompetencia } from "@/app/(app)/metas/aprovacoes/acoes";

/**
 * Controle do débito de inadimplentes na competência. Fica no topo do
 * fechamento porque muda a meta efetiva de todo mundo — não é ajuste fino.
 */
export function ChaveDebito({
  competencia,
  aplicado,
  observacao,
}: {
  competencia: string;
  aplicado: boolean;
  observacao: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [motivo, setMotivo] = useState(observacao ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(aplicar: boolean) {
    setOcupado(true);
    setErro(null);
    const r = await definirDebitoCompetencia(competencia, aplicar, motivo);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setEditando(false);
    router.refresh();
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        aplicado ? "border-border" : "border-amber-400/60 bg-amber-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Débito de inadimplentes:{" "}
            {aplicado ? (
              <span className="text-farol-verde">contando na meta</span>
            ) : (
              <span className="text-amber-800">não conta neste mês</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {aplicado
              ? "Cada cliente da coorte que não estiver ativo soma +1 na meta da vendedora."
              : observacao ?? "A lista continua visível para acompanhamento, mas não desconta."}
          </p>
        </div>
        {editando ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="motivo (aparece para a vendedora)"
              className="h-8 w-64 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={() => salvar(false)}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => (aplicado ? setEditando(true) : salvar(true))}
            className="whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {aplicado ? "Fechar sem débito" : "Voltar a aplicar"}
          </button>
        )}
      </div>
      {erro && <p className="mt-1 text-xs text-farol-vermelho">{erro}</p>}
    </div>
  );
}
