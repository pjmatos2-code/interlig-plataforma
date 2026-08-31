/**
 * Avatar da agente: usa a foto de perfil cadastrada no módulo de vendedoras
 * e cai para as iniciais quando não há foto. Serve em componentes server e
 * client.
 */
export function AvatarAgente({
  nome,
  foto,
  tamanho = "md",
}: {
  nome: string;
  foto: string | null | undefined;
  tamanho?: "sm" | "md" | "lg";
}) {
  const cls =
    tamanho === "sm" ? "h-6 w-6 text-[10px]" : tamanho === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-sm";
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-full border bg-primary/10 ${cls}`} title={nome}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt={nome} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-semibold text-primary">
          {iniciais}
        </span>
      )}
    </span>
  );
}
