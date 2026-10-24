/**
 * Resposta do SZ (24/10/2026): erro HTTP ou página HTML (sessão perdida,
 * instabilidade) vira exceção — nunca "zero conversas" calado. Puro, testado
 * em coleta/job.test.ts.
 */
export async function lerJsonSz(r: Response, onde: string): Promise<unknown> {
  const tipo = r.headers.get("content-type") ?? "";
  if (!r.ok) throw new Error(`${onde}: SZ respondeu ${r.status}`);
  if (!tipo.includes("json")) throw new Error(`${onde}: SZ não devolveu JSON (sessão perdida ou instabilidade)`);
  return r.json();
}
