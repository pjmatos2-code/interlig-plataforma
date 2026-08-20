import { cn } from "@/lib/utils";

/**
 * Logomarca Interlig recriada em vetor/CSS a partir da identidade oficial:
 * wordmark itálico pesado, quadradinhos ascendentes sobre o segundo "I" e o
 * subtítulo "INTERNET FIBRA" em azul-céu. Quando o arquivo oficial (SVG/PNG)
 * for adicionado em public/marca/, basta trocar este componente por <Image>.
 *
 * variante "clara"  → letras brancas (fundos marinho/escuros)
 * variante "escura" → letras no azul Interlig (fundos claros)
 */
export function LogoInterlig({
  variante = "escura",
  tamanho = "md",
  comSubtitulo = true,
  className,
}: {
  variante?: "clara" | "escura";
  tamanho?: "sm" | "md" | "lg";
  comSubtitulo?: boolean;
  className?: string;
}) {
  const corTexto = variante === "clara" ? "text-white" : "text-interlig-azul";
  const escala = { sm: "text-xl", md: "text-3xl", lg: "text-5xl" }[tamanho];
  const escalaSub = { sm: "text-[0.45rem]", md: "text-[0.6rem]", lg: "text-xs" }[tamanho];

  return (
    <span className={cn("inline-flex select-none flex-col leading-none", className)}>
      <span
        className={cn(
          "relative inline-block font-black italic tracking-tight",
          escala,
          corTexto
        )}
      >
        INTERL
        <span className="relative inline-block">
          I
          {/* quadradinhos ascendentes da marca */}
          <span aria-hidden className="absolute -top-[0.62em] left-[0.05em] flex items-end gap-[0.08em]">
            <span className="h-[0.34em] w-[0.34em] rounded-[0.07em] bg-interlig-ceu" />
            <span className="mb-[0.18em] h-[0.22em] w-[0.22em] rounded-[0.05em] bg-interlig-claro" />
            <span className="mb-[0.4em] h-[0.15em] w-[0.15em] rounded-[0.04em] bg-interlig-claro/70" />
          </span>
        </span>
        G
      </span>
      {comSubtitulo && (
        <span
          className={cn(
            "mt-[0.2em] self-end font-bold italic tracking-[0.35em] text-interlig-ceu",
            escalaSub
          )}
        >
          INTERNET&thinsp;·&thinsp;FIBRA
        </span>
      )}
    </span>
  );
}
