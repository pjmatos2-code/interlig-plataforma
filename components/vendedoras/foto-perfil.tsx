"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarFotoVendedora } from "@/app/(app)/vendedoras/acoes";
import { cn } from "@/lib/utils";

/**
 * Avatar clicável na lista de vendedoras: clicar abre o seletor de arquivo e
 * envia a foto direto (aparece no ranking/totem na hora).
 */
export function FotoPerfil({
  vendedorId,
  nome,
  fotoUrl,
  podeEditar,
}: {
  vendedorId: string;
  nome: string;
  fotoUrl: string | null;
  podeEditar: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [enviando, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    const dados = new FormData();
    dados.set("vendedor_id", vendedorId);
    dados.set("foto", arquivo);
    comecar(async () => {
      const r = await salvarFotoVendedora({}, dados);
      setErro(r.erro ?? null);
      if (r.ok) router.refresh();
    });
  }

  return (
    <span className="relative inline-flex items-center" title={podeEditar ? "Trocar foto de perfil" : nome}>
      <button
        type="button"
        disabled={!podeEditar || enviando}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "h-9 w-9 overflow-hidden rounded-full border bg-muted",
          podeEditar && "cursor-pointer transition-shadow hover:ring-2 hover:ring-interlig-ceu",
          enviando && "animate-pulse opacity-60"
        )}
      >
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt={nome} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
            {iniciais}
          </span>
        )}
      </button>
      {podeEditar && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => aoEscolher(e.target.files?.[0])}
        />
      )}
      {erro && <span className="absolute left-11 top-1 whitespace-nowrap text-xs text-destructive">{erro}</span>}
    </span>
  );
}
