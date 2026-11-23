"use client";

import { useState, useTransition } from "react";
import { salvarAcessoModulo } from "@/app/(app)/admin/modulos-acoes";
import { MODULOS, PADRAO_MODULO, type AjusteModulo, type Modulo } from "@/lib/acessos";
import { ROTULO_PERFIL, type Perfil } from "@/lib/tipos";
import { cn } from "@/lib/utils";

type Usuario = { id: string; nome: string; perfil: Perfil };

function Celula({ usuario, modulo, ajuste, pops }: { usuario: Usuario; modulo: Modulo; ajuste: AjusteModulo | undefined; pops: { id: string; nome: string }[] }) {
  const inicial = !ajuste ? "padrao" : !ajuste.permitido ? "bloqueado" : ajuste.popId ? `pop:${ajuste.popId}` : "todas";
  const [valor, setValor] = useState(inicial);
  const [estado, setEstado] = useState<"" | "salvando" | "ok" | "erro">("");
  const [, iniciar] = useTransition();
  const padraoSim = PADRAO_MODULO[modulo].includes(usuario.perfil);
  const liberado = valor === "padrao" ? padraoSim : valor !== "bloqueado";
  return (
    <td className="px-2 py-1.5">
      <select
        aria-label={`${MODULOS.find((m) => m.chave === modulo)!.rotulo} para ${usuario.nome}`}
        value={valor}
        onChange={(e) => {
          const novo = e.target.value;
          setValor(novo);
          setEstado("salvando");
          iniciar(async () => {
            const r = await salvarAcessoModulo(usuario.id, modulo, novo);
            setEstado(r.erro ? "erro" : "ok");
          });
        }}
        className={cn("h-8 w-full min-w-[9.5rem] rounded-md border px-2 text-xs", liberado ? "border-farol-verde/40 bg-farol-verde/5" : "bg-background text-muted-foreground", valor !== "padrao" && "font-semibold")}
      >
        <option value="padrao">Padrão do perfil ({padraoSim ? "vê" : "não vê"})</option>
        <option value="todas">Liberado · todas as unidades</option>
        {pops.map((p) => (
          <option key={p.id} value={`pop:${p.id}`}>
            Liberado · só {p.nome}
          </option>
        ))}
        <option value="bloqueado">Bloqueado</option>
      </select>
      <span className={cn("block h-3 text-[10px]", estado === "erro" ? "text-farol-vermelho" : "text-muted-foreground")} aria-live="polite">
        {estado === "salvando" ? "salvando…" : estado === "ok" ? "salvo" : estado === "erro" ? "não salvou" : ""}
      </span>
    </td>
  );
}

/** Matriz de acesso: usuários nas linhas, módulos nas colunas. Cada mudança salva na hora. */
export function AcessoModulos({ usuarios, pops, ajustes }: { usuarios: Usuario[]; pops: { id: string; nome: string }[]; ajustes: (AjusteModulo & { usuarioId: string })[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-2 font-medium">Usuário</th>
            {MODULOS.map((m) => (
              <th key={m.chave} className="px-2 py-2 font-medium" title={m.descricao}>
                {m.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-t align-top">
              <td className="px-2 py-2">
                <span className="font-medium">{u.nome}</span>
                <span className="block text-xs text-muted-foreground">{ROTULO_PERFIL[u.perfil]}</span>
              </td>
              {MODULOS.map((m) => (
                <Celula key={m.chave} usuario={u} modulo={m.chave} ajuste={ajustes.find((a) => a.usuarioId === u.id && a.modulo === m.chave)} pops={pops} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
