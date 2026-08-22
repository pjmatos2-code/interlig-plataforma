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

  /** Reduz a foto no navegador (máx. 640px, JPEG) — celular manda 8 MB+ e o
   * limite do servidor derrubaria o envio. */
  async function reduzir(arquivo: File): Promise<Blob> {
    try {
      const img = await createImageBitmap(arquivo);
      const maior = Math.max(img.width, img.height);
      const escala = Math.min(1, 640 / maior);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      if (!ctx) return arquivo;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.close();
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.85)
      );
      return blob ?? arquivo;
    } catch {
      return arquivo; // navegador sem suporte: envia como veio
    }
  }

  function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    comecar(async () => {
      try {
        const menor = await reduzir(arquivo);
        if (menor.size > 4 * 1024 * 1024) {
          setErro("Imagem grande demais mesmo após reduzir.");
          return;
        }
        const dados = new FormData();
        dados.set("vendedor_id", vendedorId);
        dados.set(
          "foto",
          new File([menor], "foto.jpg", { type: menor.type || "image/jpeg" })
        );
        const r = await salvarFotoVendedora({}, dados);
        setErro(r.erro ?? null);
        if (r.ok) router.refresh();
      } catch (e) {
        // nunca deixa a exceção derrubar a página
        setErro(e instanceof Error ? e.message : "Falha ao enviar a foto. Tente de novo.");
      }
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
