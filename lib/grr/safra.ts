import { foraDaConversao, normalizarTelefone, type TicketIndicador } from "@/lib/indicadores/crm";
import { diaSantarem } from "./regras";

/**
 * Conversão por safra de leads — a conta gerencial do GRR (decisão do Paulo,
 * 18/11/2026). Existe só aqui: a conversão oficial do CRM (regra 5.14,
 * `conversaoReal`) continua como está no CRM, no ranking e nas comissões.
 *
 * Pergunta que responde: dos leads que CHEGARAM no trecho e foram atendidos,
 * quantos viraram venda — mesmo que a venda feche dias depois.
 *
 *  - Lead: os tickets do mesmo telefone ou do mesmo contrato, criados no
 *    trecho, contam uma vez (um atendimento repetido não vira dois leads).
 *  - Fora da conta: ticket criado a partir de venda lançada direto no SGP
 *    (`sgp_auto`: não houve atendimento antes da venda) e ticket fechado por
 *    motivo fora da conversão (já é cliente da base, transferido).
 *  - Atendido: tem agente e primeira tratativa registrada.
 *  - Convertido: algum ticket do lead fechou como convertido. Ainda em
 *    negociação: nenhum convertido e algum aberto. Perdido: os demais.
 *  - Agente do lead: o do ticket convertido; senão, o do ticket mais recente.
 */

export type TicketSafra = Pick<TicketIndicador, "etapa" | "desfecho" | "criado_em" | "primeira_tratativa_em" | "motivos_nao_conversao"> & {
  id: string;
  vendedor_id: string | null;
  pop_id: string | null;
  origem_criacao: string;
  contrato_id: string | null;
  telefone: string | null;
};

export type LeadSafra = {
  ticketIds: string[];
  vendedor_id: string | null;
  pop_id: string | null;
  atendido: boolean;
  situacao: "convertido" | "perdido" | "aberto";
};

export type ResultadoSafra = {
  /** leads elegíveis que chegaram no trecho (já sem repetidos) */
  leads: number;
  atendidos: number;
  convertidos: number;
  perdidos: number;
  emNegociacao: number;
  /** convertidos ÷ atendidos */
  taxa: number | null;
  /** tickets do trecho deixados de fora */
  semAtendimentoPrevio: number;
  foraDaConversao: number;
  /** tickets a mais do mesmo lead (contados uma vez) */
  repetidos: number;
  lista: LeadSafra[];
};

export function conversaoPorSafra(tickets: TicketSafra[], de: string, ate: string): ResultadoSafra {
  const doTrecho = tickets.filter((t) => {
    const dia = diaSantarem(t.criado_em);
    return dia >= de && dia <= ate;
  });
  const semAtendimentoPrevio = doTrecho.filter((t) => t.origem_criacao === "sgp_auto").length;
  const fora = doTrecho.filter((t) => t.origem_criacao !== "sgp_auto" && foraDaConversao(t)).length;
  const elegiveis = doTrecho.filter((t) => t.origem_criacao !== "sgp_auto" && !foraDaConversao(t));

  // junta os tickets do mesmo telefone ou do mesmo contrato
  const pai = new Map<string, string>();
  const raiz = (x: string): string => {
    let r = x;
    while (pai.get(r) !== r) r = pai.get(r)!;
    pai.set(x, r);
    return r;
  };
  const unir = (a: string, b: string) => {
    for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x);
    pai.set(raiz(a), raiz(b));
  };
  for (const t of elegiveis) {
    const no = `tk:${t.id}`;
    pai.set(no, no);
    const telefone = normalizarTelefone(t.telefone);
    if (telefone.length >= 10) unir(no, `tel:${telefone}`);
    if (t.contrato_id) unir(no, `ct:${t.contrato_id}`);
  }
  const grupos = new Map<string, TicketSafra[]>();
  for (const t of elegiveis) {
    const r = raiz(`tk:${t.id}`);
    grupos.set(r, [...(grupos.get(r) ?? []), t]);
  }

  const lista: LeadSafra[] = [...grupos.values()].map((ts) => {
    const ordenados = [...ts].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
    const convertido = ordenados.find((t) => t.etapa === "fechado" && t.desfecho === "convertido");
    const dono = convertido ?? ordenados[0];
    return {
      ticketIds: ordenados.map((t) => t.id),
      vendedor_id: dono.vendedor_id,
      pop_id: dono.pop_id,
      atendido: ts.some((t) => t.vendedor_id !== null && t.primeira_tratativa_em !== null),
      situacao: convertido ? "convertido" : ts.some((t) => t.etapa !== "fechado") ? "aberto" : "perdido",
    };
  });
  return resumirSafra(lista, { semAtendimentoPrevio, foraDaConversao: fora, repetidos: elegiveis.length - lista.length });
}

/** totais de uma lista de leads (também usada nas quebras por unidade, equipe e agente) */
export function resumirSafra(lista: LeadSafra[], extras: { semAtendimentoPrevio?: number; foraDaConversao?: number; repetidos?: number } = {}): ResultadoSafra {
  const atendidos = lista.filter((l) => l.atendido);
  const convertidos = atendidos.filter((l) => l.situacao === "convertido").length;
  return {
    leads: lista.length,
    atendidos: atendidos.length,
    convertidos,
    perdidos: atendidos.filter((l) => l.situacao === "perdido").length,
    emNegociacao: atendidos.filter((l) => l.situacao === "aberto").length,
    taxa: atendidos.length === 0 ? null : convertidos / atendidos.length,
    semAtendimentoPrevio: extras.semAtendimentoPrevio ?? 0,
    foraDaConversao: extras.foraDaConversao ?? 0,
    repetidos: extras.repetidos ?? 0,
    lista,
  };
}
