"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anexarVisitaManual } from "@/app/(app)/crm/acoes";

/**
 * Complemento manual do pré-cadastro pelo ticket: fotos da casa e do
 * documento (frente/verso) e endereço informado pelo cliente — para a
 * prospecção lançada da base, longe da residência.
 */

function CampoArquivo({
  rotulo,
  nome,
  arquivo,
  aoEscolher,
}: {
  rotulo: string;
  nome: string;
  arquivo: File | null;
  aoEscolher: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className={`flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs transition ${
        arquivo ? "border-emerald-400 bg-emerald-50/60 text-emerald-800" : "text-muted-foreground hover:border-primary/60"
      }`}
    >
      <span className="text-lg">{arquivo ? "✓" : "📷"}</span>
      <span className="px-1 text-center leading-tight">{arquivo ? arquivo.name.slice(0, 24) : rotulo}</span>
      <input
        ref={ref}
        type="file"
        name={nome}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => aoEscolher(e.target.files?.[0] ?? null)}
      />
    </button>
  );
}

export function AnexosVisita({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [casa, setCasa] = useState<File | null>(null);
  const [doc, setDoc] = useState<File | null>(null);
  const [verso, setVerso] = useState<File | null>(null);
  const [endereco, setEndereco] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, comecar] = useTransition();

  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
        title="Prospecção lançada da base: anexe as fotos e o endereço informados pelo cliente."
      >
        📎 Incluir fotos / endereço (pré-cadastro)
      </button>
    );

  return (
    <div className="w-full rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
      <p className="mb-2 text-xs font-semibold text-indigo-900">
        Anexos do pré-cadastro — dados fornecidos pelo cliente
      </p>
      <div className="grid grid-cols-3 gap-2">
        <CampoArquivo rotulo="Foto da casa" nome="foto_casa" arquivo={casa} aoEscolher={setCasa} />
        <CampoArquivo rotulo="Documento (frente)" nome="foto_doc" arquivo={doc} aoEscolher={setDoc} />
        <CampoArquivo rotulo="Documento (verso)" nome="foto_doc_verso" arquivo={verso} aoEscolher={setVerso} />
      </div>
      <input
        value={endereco}
        onChange={(e) => setEndereco(e.target.value)}
        placeholder="Endereço da instalação (rua, número, bairro, referência)"
        className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      {erro && <p className="mt-1 text-xs text-rose-700">{erro}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() =>
            comecar(async () => {
              setErro(null);
              const dados = new FormData();
              dados.set("ticket_id", ticketId);
              if (casa) dados.set("foto_casa", casa);
              if (doc) dados.set("foto_doc", doc);
              if (verso) dados.set("foto_doc_verso", verso);
              if (endereco.trim()) dados.set("endereco_manual", endereco.trim());
              const r = await anexarVisitaManual({}, dados);
              if (r.erro) return setErro(r.erro);
              setAberto(false);
              setCasa(null);
              setDoc(null);
              setVerso(null);
              setEndereco("");
              router.refresh();
            })
          }
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? "Enviando…" : "Salvar anexos"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
}
