/**
 * Monta o link para o painel do SGP. O SGP não abre cliente por ID direto
 * (/cliente/{id} dá 404) — usa a LISTA com busca. O template padrão aponta
 * para /admin/cliente/list/?search={cpf}. Placeholders sem valor são
 * removidos com segurança (o link nunca fica quebrado). Função pura.
 */
export function aplicarLinkSgp(
  template: string | null | undefined,
  ids: { clienteId?: string | null; contratoId?: string | null; cpf?: string | null }
): string | null {
  if (!template) return null;
  let url = template;
  const subs: [string, string | null | undefined][] = [
    ["{cliente_id}", ids.clienteId],
    ["{id}", ids.clienteId],
    ["{contrato_id}", ids.contratoId],
    ["{cpf}", ids.cpf ? String(ids.cpf).replace(/\D/g, "") : null],
  ];
  for (const [ph, val] of subs) {
    if (url.includes(ph) && val) url = url.replaceAll(ph, encodeURIComponent(String(val)));
  }
  // sobrou placeholder?
  if (/\{[a-z_]+\}/.test(url)) {
    const [base, query] = url.split("?");
    if (/\{[a-z_]+\}/.test(base)) return null; // no caminho: sem link possível
    if (query) {
      const limpos = query.split("&").filter((kv) => !/\{[a-z_]+\}/.test(kv));
      url = limpos.length ? `${base}?${limpos.join("&")}` : base;
    }
  }
  return url;
}
