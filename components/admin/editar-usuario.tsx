"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { editarUsuario, redefinirSenha, type EstadoEdicao } from "@/app/(app)/admin/acoes";
import { Input } from "@/components/ui/input";
import { ROTULO_PERFIL, exigeVinculoAgente, type Perfil } from "@/lib/tipos";

const inicial: EstadoEdicao = {};
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const PERFIS: Perfil[] = [
  "vendedora",
  "vendedora_externa",
  "agente_corporativo",
  "agente_atendimento",
  "agente_retencao",
  "supervisor",
  "financeiro",
  "gestor_tecnico",
  "direcao",
  "gestor",
];

/**
 * Edição do usuário já cadastrado. Fica recolhida atrás do botão "Editar" para
 * não transformar a lista num formulário gigante — abre só a linha que o
 * gestor quer mexer.
 */
export function EditarUsuario({
  usuario,
  pops,
  vendedoras,
}: {
  usuario: {
    id: string;
    nome: string;
    email: string;
    perfil: Perfil;
    vendedorId: string | null;
    popId: string | null;
  };
  pops: { id: string; nome: string }[];
  vendedoras: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [perfil, setPerfil] = useState<Perfil>(usuario.perfil);
  const [estadoEdicao, acaoEditar] = useFormState(editarUsuario, inicial);
  const [estadoSenha, acaoSenha] = useFormState(redefinirSenha, inicial);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
      >
        Editar
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-left">
      <form action={acaoEditar} className="grid gap-2 md:grid-cols-2">
        <input type="hidden" name="id" value={usuario.id} />
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Nome</span>
          <Input name="nome" defaultValue={usuario.nome} required />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">E-mail</span>
          <Input name="email" type="email" defaultValue={usuario.email} required />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Perfil</span>
          <select
            name="perfil"
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as Perfil)}
            className={selectCls}
          >
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERFIL[p]}
              </option>
            ))}
          </select>
        </label>
        {perfil === "supervisor" && (
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">POP</span>
            <select name="pop_id" defaultValue={usuario.popId ?? ""} className={selectCls} required>
              <option value="">POP…</option>
              {pops.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {exigeVinculoAgente(perfil) && (
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Agente do SGP</span>
            <select
              name="vendedor_id"
              defaultValue={usuario.vendedorId ?? ""}
              className={selectCls}
              required
            >
              <option value="">Agente…</option>
              {vendedoras.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Fechar
          </button>
          {estadoEdicao.erro && (
            <span className="text-xs text-farol-vermelho">{estadoEdicao.erro}</span>
          )}
          {estadoEdicao.ok && <span className="text-xs text-farol-verde">{estadoEdicao.ok}</span>}
        </div>
      </form>

      <form action={acaoSenha} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <input type="hidden" name="id" value={usuario.id} />
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Nova senha provisória</span>
          <Input name="senha" type="text" placeholder="mín. 8 caracteres" className="w-56" />
        </label>
        <button
          type="submit"
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Redefinir senha
        </button>
        {estadoSenha.erro && <span className="text-xs text-farol-vermelho">{estadoSenha.erro}</span>}
        {estadoSenha.ok && <span className="text-xs text-farol-verde">{estadoSenha.ok}</span>}
      </form>
    </div>
  );
}
