"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { alterarMembrosGrupo, criarGrupo } from "@/app/(app)/interchat/acoes";
import { useInterChat } from "./provedor";

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onFechar}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">{titulo}</p>
          <button type="button" onClick={onFechar} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EscolherPessoas({ selecionados, alternar, excluir = [] }: { selecionados: Set<string>; alternar: (id: string) => void; excluir?: string[] }) {
  const { pessoas, eu } = useInterChat();
  const [busca, setBusca] = useState("");
  const lista = [...pessoas.values()]
    .filter((p) => p.id !== eu.id && !excluir.includes(p.id))
    .filter((p) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <div className="relative px-4 pt-3">
        <Search className="pointer-events-none absolute left-6 top-5 h-4 w-4 text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm" />
      </div>
      <ul className="max-h-[45vh] overflow-y-auto px-2 py-2">
        {lista.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
              <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} className="h-4 w-4" />
              <AvatarAgente nome={p.nome} foto={p.foto} tamanho="sm" />
              <span className="truncate text-sm">{p.nome}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Novo grupo — só o administrador */
export function NovoGrupo({ onFechar, onCriado }: { onFechar: () => void; onCriado: (id: string) => void }) {
  const { recarregar } = useInterChat();
  const [nome, setNome] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal titulo="Novo grupo" onFechar={onFechar}>
      <div className="px-4 pt-3">
        <label className="text-xs font-medium">
          Nome do grupo
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Comercial Altamira" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
        </label>
        <p className="mt-3 text-xs font-medium">Participantes ({sel.size})</p>
      </div>
      <EscolherPessoas selecionados={sel} alternar={(id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        {erro ? <p className="text-xs text-destructive">{erro}</p> : <span />}
        <button
          type="button"
          disabled={salvando || nome.trim().length < 2 || sel.size === 0}
          onClick={async () => {
            setSalvando(true);
            const r = await criarGrupo(nome.trim(), [...sel]);
            setSalvando(false);
            if (r.erro || !r.dados) return setErro(r.erro ?? "Falha ao criar.");
            await recarregar();
            onCriado(r.dados.id);
          }}
          className="h-9 rounded-md bg-interlig-azul px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {salvando ? "Criando…" : "Criar grupo"}
        </button>
      </div>
    </Modal>
  );
}

/** Participantes do grupo; o administrador adiciona e remove */
export function MembrosGrupo({ conversaId, podeEditar, onFechar }: { conversaId: string; podeEditar: boolean; onFechar: () => void }) {
  const { supabase, nomeDe, fotoDe, online, recarregar, eu } = useInterChat();
  const [membros, setMembros] = useState<string[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () =>
    supabase
      .from("chat_membros")
      .select("usuario_id")
      .eq("conversa_id", conversaId)
      .then(({ data }) => setMembros((data ?? []).map((m) => m.usuario_id as string)));
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId]);

  const alterar = async (adicionar: string[], remover: string[]) => {
    setErro(null);
    const r = await alterarMembrosGrupo(conversaId, adicionar, remover);
    if (r.erro) return setErro(r.erro);
    await carregar();
    await recarregar();
  };

  return (
    <Modal titulo={adicionando ? "Adicionar participantes" : `Participantes (${membros.length})`} onFechar={onFechar}>
      {adicionando ? (
        <>
          <EscolherPessoas selecionados={sel} excluir={membros} alternar={(id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
          <div className="flex justify-end gap-2 border-t px-4 py-3">
            <button type="button" onClick={() => setAdicionando(false)} className="h-9 rounded-md border px-3 text-sm">Voltar</button>
            <button
              type="button"
              disabled={sel.size === 0}
              onClick={async () => {
                await alterar([...sel], []);
                setSel(new Set());
                setAdicionando(false);
              }}
              className="h-9 rounded-md bg-interlig-azul px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Adicionar {sel.size || ""}
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="max-h-[55vh] overflow-y-auto px-2 py-2">
            {membros
              .sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)))
              .map((id) => (
                <li key={id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                  <span className="relative">
                    <AvatarAgente nome={nomeDe(id)} foto={fotoDe(id)} tamanho="sm" />
                    {online.has(id) && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-farol-verde" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{nomeDe(id)}{id === eu.id ? " (você)" : ""}</span>
                  {podeEditar && id !== eu.id && (
                    <button type="button" onClick={() => alterar([], [id])} className="text-xs text-destructive hover:underline">
                      Remover
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {(podeEditar || erro) && (
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
              {erro ? <p className="text-xs text-destructive">{erro}</p> : <span />}
              {podeEditar && (
                <button type="button" onClick={() => setAdicionando(true)} className="h-9 rounded-md bg-interlig-azul px-4 text-sm font-semibold text-white">
                  Adicionar pessoas
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
