"use client";

import { useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { BellRing, Megaphone, Search, Send } from "lucide-react";
import { criarAviso, type Resultado } from "./acoes";
import { cn } from "@/lib/utils";

type Pessoa = { id: string; nome: string; perfil: string; popId: string | null; pop: string | null };

function Enviar({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || total === 0}
      className="inline-flex h-10 items-center gap-2 rounded-md bg-interlig-azul px-5 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-50"
    >
      <Send className="h-4 w-4" />
      {pending ? "Enviando…" : total === 0 ? "Escolha os destinatários" : `Enviar para ${total} ${total === 1 ? "pessoa" : "pessoas"}`}
    </button>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        ativo ? "border-interlig-azul bg-interlig-azul text-white" : "bg-card hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

export function NovoAviso({
  pessoas,
  rotuloPerfil,
  autorId,
}: {
  pessoas: Pessoa[];
  rotuloPerfil: Record<string, string>;
  autorId: string;
}) {
  const [estado, acao] = useFormState<Resultado, FormData>(criarAviso, {});
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [importante, setImportante] = useState(false);
  const [todos, setTodos] = useState(false);
  const [perfis, setPerfis] = useState<string[]>([]);
  const [pops, setPops] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const [ultimoOk, setUltimoOk] = useState<string | undefined>();

  // limpa o formulário depois de enviar
  if (estado.ok && estado.ok !== ultimoOk) {
    setUltimoOk(estado.ok);
    setTitulo(""); setMensagem(""); setImportante(false); setTodos(false); setPerfis([]); setPops([]); setUsuarios([]); setBusca("");
  }

  const outros = pessoas.filter((p) => p.id !== autorId);
  const grupos = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of outros) m.set(p.perfil, (m.get(p.perfil) ?? 0) + 1);
    return [...m].sort((a, b) => (rotuloPerfil[a[0]] ?? a[0]).localeCompare(rotuloPerfil[b[0]] ?? b[0]));
  }, [outros, rotuloPerfil]);
  const unidades = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number }>();
    for (const p of outros) if (p.popId) m.set(p.popId, { nome: p.pop ?? "—", qtd: (m.get(p.popId)?.qtd ?? 0) + 1 });
    return [...m].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [outros]);
  const destinatarios = outros.filter(
    (p) => todos || perfis.includes(p.perfil) || (p.popId && pops.includes(p.popId)) || usuarios.includes(p.id)
  );
  const alterna = (lista: string[], set: (v: string[]) => void, v: string) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const filtradas = outros.filter((p) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <form ref={form} action={acao} className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="titulo" className="text-sm font-medium">Título</label>
          <input
            id="titulo"
            name="titulo"
            required
            maxLength={120}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Novo motivo de não conversão no CRM"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mensagem" className="text-sm font-medium">Mensagem</label>
          <textarea
            id="mensagem"
            name="mensagem"
            required
            maxLength={4000}
            rows={7}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Escreva o aviso. Quebras de linha e links (https://…) aparecem para quem recebe."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-right text-[11px] text-muted-foreground">{mensagem.length}/4000</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Tipo:</span>
          <Chip ativo={!importante} onClick={() => setImportante(false)}>Aviso</Chip>
          <Chip ativo={importante} onClick={() => setImportante(true)}>Importante (vermelho, aparece primeiro)</Chip>
          <input type="hidden" name="importancia" value={importante ? "importante" : "normal"} />
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-semibold">Para quem</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="todos" checked={todos} onChange={(e) => setTodos(e.target.checked)} className="h-4 w-4" />
            Todos ({outros.length} pessoas)
          </label>
          {!todos && (
            <>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Equipe / perfil</p>
                <div className="flex flex-wrap gap-1.5">
                  {grupos.map(([perfil, qtd]) => (
                    <Chip key={perfil} ativo={perfis.includes(perfil)} onClick={() => alterna(perfis, setPerfis, perfil)}>
                      {rotuloPerfil[perfil] ?? perfil} ({qtd})
                    </Chip>
                  ))}
                </div>
              </div>
              {unidades.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Unidade</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unidades.map(([id, u]) => (
                      <Chip key={id} ativo={pops.includes(id)} onClick={() => alterna(pops, setPops, id)}>
                        {u.nome} ({u.qtd})
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Pessoas</p>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar pelo nome"
                    className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
                  />
                </div>
                <div className="grid max-h-56 auto-rows-min content-start gap-1 overflow-y-auto rounded-md border p-1 sm:grid-cols-2">
                  {filtradas.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={usuarios.includes(p.id)} onChange={() => alterna(usuarios, setUsuarios, p.id)} className="h-4 w-4" />
                      <span className="min-w-0">
                        <span className="block truncate">{p.nome}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {rotuloPerfil[p.perfil] ?? p.perfil}
                          {p.pop ? ` · ${p.pop}` : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          {perfis.map((v) => <input key={`p${v}`} type="hidden" name="perfis" value={v} />)}
          {pops.map((v) => <input key={`u${v}`} type="hidden" name="pops" value={v} />)}
          {usuarios.map((v) => <input key={`s${v}`} type="hidden" name="usuarios" value={v} />)}
          <p className="text-xs text-muted-foreground">
            {destinatarios.length === 0
              ? "Ninguém selecionado ainda."
              : `Vai para ${destinatarios.length}: ${destinatarios.slice(0, 8).map((p) => p.nome.split(" ")[0]).join(", ")}${destinatarios.length > 8 ? "…" : ""}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Enviar total={destinatarios.length} />
          {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
          {estado.ok && <p className="text-sm font-medium text-farol-verde">{estado.ok}</p>}
        </div>
      </div>

      {/* pré-visualização do popup */}
      <div className="lg:pt-6">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Como a agente vai ver</p>
        <div className="overflow-hidden rounded-2xl border shadow-lg">
          <div className={cn("flex items-center gap-3 px-5 py-4 text-white", importante ? "bg-farol-vermelho" : "bg-interlig-azul")}>
            {importante ? <BellRing className="h-6 w-6 shrink-0" /> : <Megaphone className="h-6 w-6 shrink-0" />}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{importante ? "Aviso importante" : "Aviso"}</p>
              <p className="break-words text-lg font-bold leading-snug">{titulo || "Título do aviso"}</p>
            </div>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">
              {mensagem || "A mensagem aparece aqui, com as quebras de linha que você escrever."}
            </p>
          </div>
          <div className="border-t bg-muted/30 px-5 py-4">
            <div className="flex h-11 w-full items-center justify-center rounded-lg bg-interlig-azul text-sm font-semibold text-white">
              Li e estou ciente
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">O popup só fecha quando ela confirma a leitura.</p>
          </div>
        </div>
      </div>
    </form>
  );
}
