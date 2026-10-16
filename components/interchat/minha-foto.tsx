"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { trocarMinhaFoto } from "@/app/(app)/interchat/acoes";
import { useInterChat } from "./provedor";

/** corta no centro em quadrado e reduz para 400px (JPEG leve) */
async function prepararImagem(arquivo: File): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não foi possível abrir essa imagem."));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(400, lado);
    canvas.getContext("2d")!.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Falha ao preparar a imagem."))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** a própria foto: toque para trocar */
export function MinhaFoto() {
  const { eu } = useInterChat();
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={enviando}
        title="Trocar minha foto"
        aria-label="Trocar minha foto"
        className="group relative block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interlig-azul"
      >
        <AvatarAgente nome={eu.nome} foto={foto ?? eu.foto} />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-interlig-azul text-white">
          {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        </span>
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (!arquivo) return;
          setErro(null);
          setEnviando(true);
          try {
            const dados = new FormData();
            dados.set("foto", new File([await prepararImagem(arquivo)], "foto.jpg", { type: "image/jpeg" }));
            const r = await trocarMinhaFoto(dados);
            if (r.erro || !r.dados) throw new Error(r.erro ?? "Falha ao salvar.");
            setFoto(r.dados.url);
            router.refresh();
          } catch (falha) {
            setErro(falha instanceof Error ? falha.message : "Falha ao salvar.");
          } finally {
            setEnviando(false);
          }
        }}
      />
      {erro && (
        <p role="alert" className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border bg-card p-2 text-xs text-destructive shadow">
          {erro}
        </p>
      )}
    </div>
  );
}
