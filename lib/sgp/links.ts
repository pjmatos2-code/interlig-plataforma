/**
 * Monta o link para abrir um cliente/contrato direto no painel do SGP.
 * Função PURA (serve em componente cliente e servidor). O template usa
 * {cliente_id} e/ou {contrato_id}; ver templateLinkSgp() para a origem.
 */
export function aplicarLinkSgp(
  template: string | null | undefined,
  ids: { clienteId?: string | null; contratoId?: string | null }
): string | null {
  if (!template) return null;
  let url = template;
  if (ids.clienteId) {
    const c = encodeURIComponent(String(ids.clienteId));
    url = url.replaceAll("{cliente_id}", c).replaceAll("{id}", c);
  }
  if (ids.contratoId) {
    url = url.replaceAll("{contrato_id}", encodeURIComponent(String(ids.contratoId)));
  }
  // se sobraram placeholders sem valor, não há link válido
  if (/\{(cliente_id|contrato_id|id)\}/.test(url)) return null;
  return url;
}
