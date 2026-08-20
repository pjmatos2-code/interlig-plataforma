import { cn } from "@/lib/utils";

/**
 * Logomarca oficial da Interlig (arquivos em public/marca/, extraídos da
 * identidade original com fundo transparente).
 *
 * variante "clara"  → letras brancas (fundos marinho/escuros)
 * variante "escura" → letras no azul oficial #043792 (fundos claros)
 */
const ALTURA = { sm: "h-9", md: "h-14", lg: "h-24" } as const;

export function LogoInterlig({
  variante = "escura",
  tamanho = "md",
  className,
}: {
  variante?: "clara" | "escura";
  tamanho?: keyof typeof ALTURA;
  className?: string;
}) {
  const arquivo =
    variante === "clara" ? "/marca/logo-fundo-escuro.png" : "/marca/logo-fundo-claro.png";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={arquivo}
      alt="Interlig Internet Fibra"
      className={cn("w-auto select-none", ALTURA[tamanho], className)}
      draggable={false}
    />
  );
}
