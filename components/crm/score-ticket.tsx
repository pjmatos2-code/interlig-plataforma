"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarScoreTicket, confirmarAdiantamentoTicket } from "@/app/(app)/crm/acoes";

/**
 * Filtro de entrada por score (modelo Adiantamento de Fatura, 17/09/2026):
 * a vendedora lança o score, a plataforma enquadra na faixa e mostra a
 * condição de entrada. Amarelo/vermelho pagam adiantamento de mensalidade
 * ANTES da ativação — valor que vira crédito nas faturas (não é taxa).
 */

const FAIXA_UI: Record<string, { rotulo: string; cls: string }> = {
  verde: { rotulo: "🟢 Verde — sem antecipação", cls: "bg-emerald-100 text-emerald-800" },
  amarelo: { rotulo: "🟡 Amarelo", cls: "bg-amber-100 text-amber-900" },
  vermelho: { rotulo: "🔴 Vermelho", cls: "bg-rose-100 text-rose-800" },
};

export function ScoreTicket({
  ticketId,
  score,
  faixa,
  adiantamentoValor,
  recebidoEm,
  podeEditar,
}: {
  ticketId: string;
  score: number | null;
  faixa: string | null;
  adiantamentoValor: number | null;
  recebidoEm: string | null;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(score !== null ? String(score) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, comecar] = useTransition();

  const ui = faixa ? FAIXA_UI[faixa] : null;
  const precisaAdiantamento = (adiantamentoValor ?? 0) > 0;

  return (
    <div className="space-y-1">
      <span className="inline-flex flex-wrap items-center gap-2">
        {score !== null && ui ? (
          <>
            <span className="font-semibold tabular-nums">{score}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ui.cls}`}>
              {ui.rotulo}
              {precisaAdiantamento &&
                ` — R$ ${Number(adiantamentoValor).toFixed(2).replace(".", ",")} antecipados`}
            </span>
          </>
        ) : (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
            score não lançado
          </span>
        )}
        {podeEditar && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            {score !== null ? "editar" : "lançar score"}
          </button>
        )}
        {editando && (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0 a 1000"
              inputMode="numeric"
              className="h-7 w-24 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              type="button"
              disabled={salvando}
              onClick={() =>
                comecar(async () => {
                  setErro(null);
                  const dados = new FormData();
                  dados.set("ticket_id", ticketId);
                  dados.set("score", valor);
                  const r = await salvarScoreTicket({}, dados);
                  if (r.erro) return setErro(r.erro);
                  setEditando(false);
                  router.refresh();
                })
              }
              className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-60"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => { setEditando(false); setErro(null); }}
              className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
            >
              Cancelar
            </button>
          </span>
        )}
        {erro && <span className="text-[11px] text-destructive">{erro}</span>}
      </span>

      {precisaAdiantamento && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {recebidoEm ? (
            <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
              ✓ Adiantamento recebido em{" "}
              {new Date(recebidoEm).toLocaleDateString("pt-BR", { timeZone: "America/Santarem" })} —
              vira crédito nas faturas
            </span>
          ) : (
            <>
              <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-900">
                ⏳ Receber R$ {Number(adiantamentoValor).toFixed(2).replace(".", ",")} antes de ativar
                (abatido integralmente das faturas)
              </span>
              {podeEditar && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() =>
                    comecar(async () => {
                      setErro(null);
                      const r = await confirmarAdiantamentoTicket(ticketId);
                      if (r.erro) return setErro(r.erro);
                      router.refresh();
                    })
                  }
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                >
                  Confirmar recebimento
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
