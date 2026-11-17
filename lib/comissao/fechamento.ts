/**
 * O fechamento grava UM demonstrativo por pessoa por mês (comissoes_fechadas,
 * chave vendedor + competência). Venda, refidelização, retenção e gerência
 * são apurados em separado e depois reunidos; se a mesma pessoa aparecer em
 * dois deles, o segundo apagaria o primeiro sem aviso.
 *
 * Isso passou a ser possível em 17/11/2026, quando uma agente da refidelização
 * começou a vender no comercial. Enquanto ela não tem meta de venda só existe
 * a comissão de refidelização; no mês em que tiver as duas, o fechamento para
 * aqui em vez de perder uma delas.
 */
export function pessoasEmMaisDeUmaApuracao(
  apuracoes: { tipo: string; ids: Iterable<string> }[]
): { id: string; tipos: string[] }[] {
  const tiposPor = new Map<string, string[]>();
  for (const a of apuracoes) {
    for (const id of new Set(a.ids)) {
      tiposPor.set(id, [...(tiposPor.get(id) ?? []), a.tipo]);
    }
  }
  return [...tiposPor.entries()].filter(([, tipos]) => tipos.length > 1).map(([id, tipos]) => ({ id, tipos }));
}
