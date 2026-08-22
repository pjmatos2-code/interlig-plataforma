"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { concluirFollowup, adiarFollowup } from "@/app/(app)/crm/acoes";
import type { CartaoTicket } from "@/lib/crm/dados";
import { cn } from "@/lib/utils";

/**
 * Painel "Fechar o dia": retornos de hoje + vencidos com ações rápidas —
 * ✓ concluir (registra a tratativa) ou → empurrar para amanhã.
 */
export function FecharODia({
  retornosHoje,
  retornosVencidos,
}: {
  retornosHoje: CartaoTicket[];
  retornosVencidos: CartaoTicket[];
}) {
  const router = useRouter();
  const [pendente, comecar] = useTransition();
  const [agindo, setAgindo] = useState<string | null>(null);

  function agir(id: string, acao: "feito" | "amanha") {
    setAgindo(id);
    comecar(async () => {
      if (acao === "feito") await concluirFollowup(id);
      else await adiarFollowup(id, 1);
      setAgindo(null);
      router.refresh();
    });
  }

  const Linha = ({ t, vencido }: { t: CartaoTicket; vencido: boolean }) => (
    <li className="flex items-center gap-2 py-1.5">
      <span
        className={cn(
          "w-12 shrink-0 text-xs font-semibold tabular-nums",
          vencido ? "text-farol-vermelho" : "text-muted-foreground"
        )}
      >
        {vencido
          ? t.followup_em!.slice(8, 10) + "/" + t.followup_em!.slice(5, 7)
          : t.followup_em!.slice(11, 16)}
      </span>
      <Link
        href={`/crm/${t.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
      >
        {t.cliente_nome}
      </Link>
      <button
        type="button"
        disabled={pendente}
        onClick={() => agir(t.id, "feito")}
        title="Retorno feito — concluir"
        className={cn(
          "rounded-md border border-farol-verde/40 bg-farol-verde/10 px-1.5 py-0.5 text-xs font-bold text-farol-verde hover:bg-farol-verde/20",
          agindo === t.id && "animate-pulse opacity-50"
        )}
      >
        ✓
      </button>
      <button
        type="button"
        disabled={pendente}
        onClick={() => agir(t.id, "amanha")}
        title="Empurrar para amanhã"
        className={cn(
          "rounded-md border px-1.5 py-0.5 text-xs font-bold text-muted-foreground hover:bg-accent",
          agindo === t.id && "animate-pulse opacity-50"
        )}
      >
        →1d
      </button>
    </li>
  );

  const nada = retornosHoje.length === 0 && retornosVencidos.length === 0;

  return (
    <div>
      {nada && (
        <p className="py-3 text-center text-sm text-muted-foreground">
          Nenhum retorno pendente — dia fechado! 🎉
        </p>
      )}
      {retornosVencidos.length > 0 && (
        <>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-farol-vermelho">
            Vencidos ({retornosVencidos.length})
          </p>
          <ul className="mb-2 divide-y divide-border/60">
            {retornosVencidos.slice(0, 6).map((t) => (
              <Linha key={t.id} t={t} vencido />
            ))}
          </ul>
        </>
      )}
      {retornosHoje.length > 0 && (
        <>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Hoje ({retornosHoje.length})
          </p>
          <ul className="divide-y divide-border/60">
            {retornosHoje.slice(0, 8).map((t) => (
              <Linha key={t.id} t={t} vencido={false} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
