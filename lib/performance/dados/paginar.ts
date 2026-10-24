/**
 * Leitura paginada do PostgREST (24/10/2026): o servidor devolve no máximo
 * 1000 linhas por pedido, mesmo com .limit() maior — sem paginar, o resto
 * some calado. A consulta precisa de .order() estável e usar o range dado.
 */
const PAGINA = 1000;
/** todas as páginas: a 1ª sozinha; se vier cheia, as seguintes em lotes de 4 em paralelo */
export async function todas<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const pagina = async (n: number) => {
    const { data, error } = await montar(n * PAGINA, n * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  };
  const saida: T[] = await pagina(0);
  if (saida.length < PAGINA) return saida;
  for (let n = 1; n < 200; n += 4) {
    const lote = await Promise.all([n, n + 1, n + 2, n + 3].map(pagina));
    for (const l of lote) saida.push(...l);
    if (lote.some((l) => l.length < PAGINA)) break;
  }
  return saida;
}

