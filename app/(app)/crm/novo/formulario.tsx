"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { criarTicket, type EstadoAcao } from "../acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inicial: EstadoAcao = {};

function BotaoCriar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando…" : rotulo}
    </Button>
  );
}

/** Venda externa: o lead sondado na rua entra direto no funil Pré-Cadastro. */
function BotaoPreCadastro() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="modo" value="pre_cadastro" variant="outline" disabled={pending}>
      {pending ? "Criando…" : "Criar Pré-Cadastro"}
    </Button>
  );
}

/** Formulário de 20 segundos (PRD 3.9): nome, telefone, origem/vendedora. */
export function FormularioNovoTicket({
  vendedoras,
  perfilVendedora,
  permitePreCadastro = false,
}: {
  vendedoras: { id: string; nome: string }[];
  perfilVendedora: boolean;
  permitePreCadastro?: boolean;
}) {
  const [estado, acao] = useFormState(criarTicket, inicial);

  return (
    <form action={acao} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cliente_nome">Nome do cliente *</Label>
        <Input id="cliente_nome" name="cliente_nome" required autoFocus />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="telefone">Telefone / WhatsApp</Label>
          <Input id="telefone" name="telefone" placeholder="(93) 9xxxx-xxxx" inputMode="tel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cpf">CNPJ (opcional)</Label>
          <Input id="cpf" name="cpf" placeholder="00.000.000/0000-00" inputMode="numeric" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail (opcional)</Label>
          <Input id="email" name="email" type="email" placeholder="cliente@email.com" inputMode="email" />
        </div>
      </div>

      {!perfilVendedora && (
        <div className="space-y-1.5">
          <Label htmlFor="vendedor_id">Vendedora responsável</Label>
          <select
            id="vendedor_id"
            name="vendedor_id"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— deixar não atribuído (supervisor distribui) —</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {estado.erro && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}

      {estado.ticketExistenteId && (
        <div className="rounded-md border border-farol-amarelo/60 bg-farol-amarelo/10 px-3 py-3 text-sm">
          <p className="font-medium">Já existe um ticket aberto para este contato.</p>
          <p className="mt-1 text-muted-foreground">
            Anti-duplicidade (PRD 3.9): a nova conversa deve ser tratada no ticket existente.
          </p>
          <div className="mt-2 flex gap-2">
            <Link
              href={`/crm/${estado.ticketExistenteId}`}
              className={buttonVariants({ size: "sm" })}
            >
              Abrir o ticket existente
            </Link>
          </div>
        </div>
      )}

      {estado.ticketReabrivelId && (
        <div className="rounded-md border border-interlig-ceu/60 bg-interlig-ceu/10 px-3 py-3 text-sm">
          <p className="font-medium">
            Este contato teve um ticket fechado como não convertido há menos de 30 dias.
          </p>
          <p className="mt-1 text-muted-foreground">
            O sistema recomenda reabrir para preservar o histórico da negociação.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={`/crm/${estado.ticketReabrivelId}`}
              className={buttonVariants({ size: "sm" })}
            >
              Ver ticket e reabrir
            </Link>
            <button
              type="submit"
              name="forcar"
              value="sim"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Criar mesmo assim
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <BotaoCriar rotulo="Criar ticket" />
        {permitePreCadastro && <BotaoPreCadastro />}
      </div>
      {permitePreCadastro && (
        <p className="text-xs text-muted-foreground">
          Criar Pré-Cadastro: o lead entra na coluna Pré-Cadastro do funil — complete depois com as
          fotos e o endereço pelo próprio ticket.
        </p>
      )}
    </form>
  );
}
