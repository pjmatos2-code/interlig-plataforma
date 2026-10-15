"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Gift, MessageSquareHeart, UserPlus, X } from "lucide-react";
import { marcarBoasVindas, registrarIndicacao, registrarSemIndicacao } from "./acoes";
import type { CardPosVenda } from "@/lib/meu-dia/dados";

const data = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Bloco 4 — a única missão manual: boas-vindas → indicação ou sem indicação */
export function CartaoPosVenda({ item }: { item: CardPosVenda }) {
  const router = useRouter();
  const [pendente, comecar] = useTransition();
  const [abrirIndicacao, setAbrirIndicacao] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const agir = (fn: () => Promise<{ erro?: string; ok?: string }>) =>
    comecar(async () => {
      setMsg(null);
      const r = await fn();
      if (r.erro) return setMsg({ tipo: "erro", texto: r.erro });
      setMsg({ tipo: "ok", texto: r.ok ?? "Feito." });
      router.refresh();
    });

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.cliente}</p>
          <p className="text-xs text-muted-foreground">
            Ativado em {data(item.ativadoEm)}
            {item.plano ? ` · ${item.plano}` : ""}
            {item.sgpContratoId ? ` · contrato ${item.sgpContratoId}` : ""}
            {item.telefone ? ` · ${item.telefone}` : ""}
          </p>
        </div>
        {item.boasVindasEm && (
          <span className="inline-flex items-center gap-1 rounded-full bg-farol-verde/15 px-2 py-0.5 text-[11px] font-medium text-farol-verde">
            <Check className="h-3 w-3" /> Boas-vindas enviada
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {!item.boasVindasEm ? (
          <button
            type="button"
            disabled={pendente}
            onClick={() => agir(() => marcarBoasVindas(item.contratoId))}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60"
          >
            <MessageSquareHeart className="h-4 w-4" /> Boas-vindas enviada
          </button>
        ) : (
          !abrirIndicacao && (
            <>
              <button
                type="button"
                disabled={pendente}
                onClick={() => setAbrirIndicacao(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-farol-verde px-3 text-sm font-semibold text-white hover:bg-farol-verde/90 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" /> Registrar indicação
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => agir(() => registrarSemIndicacao(item.contratoId))}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                <X className="h-4 w-4" /> Sem indicação
              </button>
            </>
          )
        )}
      </div>

      {abrirIndicacao && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            agir(() => registrarIndicacao(item.contratoId, nome, telefone));
          }}
          className="mt-2.5 grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-end"
        >
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Nome de quem foi indicado</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Telefone com DDD</span>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} required inputMode="tel" placeholder="(93) 9xxxx-xxxx" className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pendente} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-farol-verde px-3 text-sm font-semibold text-white disabled:opacity-60">
              <Gift className="h-4 w-4" /> {pendente ? "Salvando…" : "Criar ticket"}
            </button>
            <button type="button" onClick={() => setAbrirIndicacao(false)} className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
              Cancelar
            </button>
          </div>
        </form>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.tipo === "erro" ? "text-destructive" : "text-farol-verde"}`}>{msg.texto}</p>}
    </li>
  );
}

/** recarrega os blocos em tempo real: a cada 5 min e ao voltar para a aba */
export function AtualizarSozinho() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5 * 60_000);
    const vis = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [router]);
  return null;
}
