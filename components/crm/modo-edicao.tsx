"use client";

import { createContext, useContext, useState } from "react";
import { Check, Pencil } from "lucide-react";

/**
 * Modo de edição do cartão "Dados do cliente" (10/10/2026): o botão Editar do
 * cabeçalho libera os links de edição dos campos preenchidos. Campo vazio
 * mostra "Incluir" sempre — completar o cadastro não pode depender de achar
 * o botão.
 */
const Contexto = createContext<{ ativo: boolean; alternar: () => void }>({ ativo: true, alternar: () => {} });

export function ModoEdicaoProvider({ children }: { children: React.ReactNode }) {
  const [ativo, setAtivo] = useState(false);
  return <Contexto.Provider value={{ ativo, alternar: () => setAtivo((x) => !x) }}>{children}</Contexto.Provider>;
}

export const useModoEdicao = () => useContext(Contexto).ativo;

export function BotaoEditarDados() {
  const { ativo, alternar } = useContext(Contexto);
  return (
    <button
      type="button"
      onClick={alternar}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-interlig-azul hover:bg-muted"
    >
      {ativo ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
      {ativo ? "Concluir" : "Editar"}
    </button>
  );
}
