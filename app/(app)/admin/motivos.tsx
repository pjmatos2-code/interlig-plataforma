"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { alternarMotivo, salvarMotivo, type EstadoAdmin } from "./acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const inicial: EstadoAdmin = {};

function BotaoAdicionar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Adicionar"}
    </Button>
  );
}

export function GestaoMotivos({
  motivos,
}: {
  motivos: { id: string; nome: string; ativo: boolean }[];
}) {
  const [estado, acao] = useFormState(salvarMotivo, inicial);
  const router = useRouter();
  const [aguardando, setAguardando] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <form action={acao} className="flex gap-2" key={estado.ok ? Date.now() : "motivo"}>
        <Input name="nome" placeholder="Novo motivo de não conversão…" className="max-w-sm" />
        <BotaoAdicionar />
      </form>
      {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}

      <ul className="divide-y rounded-md border">
        {motivos.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className={m.ativo ? "" : "text-muted-foreground line-through"}>{m.nome}</span>
            <div className="flex items-center gap-2">
              {m.ativo ? <Badge variant="verde">ativo</Badge> : <Badge variant="outline">inativo</Badge>}
              <Button
                variant="ghost"
                size="sm"
                disabled={aguardando === m.id}
                onClick={async () => {
                  setAguardando(m.id);
                  await alternarMotivo(m.id, !m.ativo);
                  setAguardando(null);
                  router.refresh();
                }}
              >
                {m.ativo ? "Desativar" : "Reativar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Motivos nunca são excluídos — tickets antigos continuam apontando para eles. O motivo
        &quot;Sem resposta&quot; é usado pelo fechamento automático por inatividade; mantenha-o ativo.
      </p>
    </div>
  );
}
