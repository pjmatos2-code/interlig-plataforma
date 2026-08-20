"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { salvarMeta, excluirMeta, type EstadoMeta } from "./acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inicial: EstadoMeta = {};

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar meta"}
    </Button>
  );
}

export function FormularioMeta({
  pops,
  vendedoras,
  mesPadrao,
}: {
  pops: { id: string; nome: string }[];
  vendedoras: { id: string; nome: string }[];
  mesPadrao: string; // aaaa-mm
}) {
  const [estado, acao] = useFormState(salvarMeta, inicial);
  const [escopo, setEscopo] = useState<"global" | "pop" | "vendedora">("vendedora");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado]);

  const opcoes = escopo === "pop" ? pops : vendedoras;

  return (
    <form ref={formRef} action={acao} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1.5">
        <Label htmlFor="escopo">Escopo</Label>
        <select
          id="escopo"
          name="escopo"
          value={escopo}
          onChange={(e) => setEscopo(e.target.value as typeof escopo)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="vendedora">Vendedora</option>
          <option value="pop">POP</option>
          <option value="global">Global</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="referencia_id">{escopo === "pop" ? "POP" : "Vendedora"}</Label>
        <select
          id="referencia_id"
          name="referencia_id"
          disabled={escopo === "global"}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
        >
          {escopo === "global" ? (
            <option value="">— toda a operação —</option>
          ) : (
            opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mes_ano">Mês</Label>
        <Input id="mes_ano" name="mes_ano" type="month" defaultValue={mesPadrao} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quantidade_vendas">Meta (vendas)</Label>
        <Input
          id="quantidade_vendas"
          name="quantidade_vendas"
          type="number"
          min={1}
          step={1}
          required
          placeholder="ex.: 24"
        />
      </div>

      <div className="flex items-end">
        <BotaoSalvar />
      </div>

      {estado.erro && (
        <p className="sm:col-span-2 lg:col-span-5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p className="sm:col-span-2 lg:col-span-5 rounded-md bg-farol-verde/10 px-3 py-2 text-sm text-farol-verde">
          Meta salva. A meta diária e o pace já refletem o novo valor.
        </p>
      )}
    </form>
  );
}

export function BotaoExcluirMeta({ id }: { id: string }) {
  const [aguardando, setAguardando] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={aguardando}
      onClick={async () => {
        if (!confirm("Excluir esta meta?")) return;
        setAguardando(true);
        await excluirMeta(id);
        setAguardando(false);
      }}
      className="text-destructive hover:text-destructive"
    >
      Excluir
    </Button>
  );
}
