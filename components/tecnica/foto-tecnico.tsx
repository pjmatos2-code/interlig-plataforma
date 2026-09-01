"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarFotoTecnico } from "@/app/(app)/tecnica/acoes";
import { cn } from "@/lib/utils";

/** Avatar do técnico: gestor clica e envia a foto (reduzida no navegador). */
export function FotoTecnico({
  tecnicoId,
  nome,
  fotoUrl,
  podeEditar,
  tamanho = "md",
}: {
  tecnicoId: string;
  nome: string;
  fotoUrl: string | null;
  podeEditar: boolean;
  tamanho?: "md" | "lg";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [enviando, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  const cls = tamanho === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-xs";

  async function reduzir(arquivo: File): Promise<Blob> {
    try {
      const img = await createImageBitmap(arquivo);
      const escala = Math.min(1, 640 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      if (!ctx) return arquivo;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.close();
      return (await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85))) ?? arquivo;
    } catch {
      return arquivo;
    }
  }

  return (
    <span className="relative inline-flex items-center" title={podeEditar ? "Trocar foto do técnico" : nome}>
      <button
        type="button"
        disabled={!podeEditar || enviando}
        onClick={() => inputRef.current?.click()}
        className={cn(
          `${cls} overflow-hidden rounded-full border bg-primary/10`,
          podeEditar && "cursor-pointer transition-shadow hover:ring-2 hover:ring-interlig-ceu",
          enviando && "animate-pulse opacity-60"
        )}
      >
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt={nome} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-bold text-primary">{iniciais}</span>
        )}
      </button>
      {podeEditar && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (!arquivo) return;
            setErro(null);
            comecar(async () => {
              const menor = await reduzir(arquivo);
              const dados = new FormData();
              dados.set("tecnico_id", tecnicoId);
              dados.set("foto", new File([menor], "foto.jpg", { type: menor.type || "image/jpeg" }));
              const r = await salvarFotoTecnico({}, dados);
              setErro(r.erro ?? null);
              if (r.ok) router.refresh();
            });
          }}
        />
      )}
      {erro && <span className="absolute left-full top-0 ml-1 whitespace-nowrap text-[10px] text-destructive">{erro}</span>}
    </span>
  );
}
