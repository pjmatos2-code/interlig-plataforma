/**
 * Vínculo conversa → lead (ticket) — puro, testado em vinculo.test.ts.
 */
export type TicketRef = { id: string; criado: number; fechado: number | null };

const DIA = 86_400_000;

/**
 * Lead (ticket) da conversa: 1º pelo protocolo (o robô grava o protocolo no
 * ticket); 2º pelo telefone — o ticket mais recente criado até 1 dia após o
 * fim da conversa e ainda aberto (ou fechado no máximo 2 dias antes dela
 * começar); por fim, ticket criado até 3 dias depois (nasceu da conversa).
 */
export function vincularTicketPuro(
  protocolo: string | null,
  telefone: string | null,
  inicioIso: string | null,
  fimIso: string | null,
  porProtocolo: Map<string, string>,
  porTelefone: Map<string, TicketRef[]>
): string | null {
  if (protocolo && porProtocolo.has(protocolo)) return porProtocolo.get(protocolo)!;
  if (!telefone) return null;
  const lista = porTelefone.get(telefone);
  if (!lista?.length) return null;
  const ini = inicioIso ? Date.parse(inicioIso) : Date.now();
  const fim = fimIso ? Date.parse(fimIso) : ini;
  const antes = lista.filter((t) => t.criado <= fim + DIA && (t.fechado === null || t.fechado >= ini - 2 * DIA));
  if (antes.length) return antes[antes.length - 1].id;
  const depois = lista.find((t) => t.criado > fim + DIA && t.criado <= fim + 3 * DIA);
  return depois?.id ?? null;
}

