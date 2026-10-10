"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { PhoneCall } from "lucide-react";
import { RESULTADOS } from "@/lib/prevencao/resultados";
import { registrarContato, type Resultado } from "./acoes";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

export function RegistrarContato({ contrato, fila }: { contrato: string; fila: "debito" | "insatisfacao" }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useFormState<Resultado, FormData>(registrarContato, {});
  useEffect(() => {
    if (estado.ok) setAberto(false);
  }, [estado]);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"
      >
        <PhoneCall className="h-3.5 w-3.5" />
        Registrar contato
      </button>
    );
  }
  return (
    <form action={acao} className="mt-2 flex w-full flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <input type="hidden" name="sgp_contrato_id" value={contrato} />
      <input type="hidden" name="fila" value={fila} />
      <label className="text-xs sm:w-48">
        <span className="mb-1 block text-muted-foreground">Resultado</span>
        <select name="resultado" required defaultValue="" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
          <option value="" disabled>Escolha…</option>
          {RESULTADOS[fila].map((r) => (
            <option key={r.valor} value={r.valor}>{r.rotulo}</option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1 text-xs">
        <span className="mb-1 block text-muted-foreground">Observação (opcional)</span>
        <input
          name="observacao"
          maxLength={500}
          placeholder={fila === "debito" ? "Ex.: paga dia 15, acordo em 2x" : "Ex.: técnico agendado para sexta"}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <Salvar />
        <button type="button" onClick={() => setAberto(false)} className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
          Cancelar
        </button>
      </div>
      {estado.erro && <p className="w-full text-xs text-farol-vermelho">{estado.erro}</p>}
    </form>
  );
}
