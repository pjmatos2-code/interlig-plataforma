export function CabecalhoPagina({
  titulo,
  descricao,
  referencia,
}: {
  titulo: string;
  descricao?: string;
  referencia?: string;
}) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">{titulo}</h1>
      {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      {referencia && (
        <p className="mt-1 text-xs text-muted-foreground">Especificação: {referencia}</p>
      )}
    </div>
  );
}
