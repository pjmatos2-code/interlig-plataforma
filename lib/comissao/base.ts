import "server-only";

/**
 * Monta a base de cálculo da comissão conforme a regra (adendo 29/08/2026).
 *
 * `proprias` mantém o comportamento de sempre: as vendas da pessoa, contadas
 * por data de venda. `equipe` e `pop` são comissões de liderança e contam por
 * data de ATIVAÇÃO — quem lidera responde pelo que entrou na base, não pelo
 * que foi cadastrado. Por isso a janela é diferente: um contrato vendido em
 * julho e ativado em agosto entra na comissão de agosto do coordenador, mas na
 * meta de julho da agente que vendeu.
 */

export type BaseComissao = "proprias" | "equipe" | "pop";

export type ContratoBase = {
  id: string;
  vendedor_id: string | null;
  pop_id?: string | null;
  data_venda: string;
  data_ativacao: string | null;
  data_cancelamento: string | null;
  valor_mensalidade: number;
};

/** Contratos ATIVADOS dentro da janela, ignorando cancelados. */
export function ativadosNoPeriodo<T extends ContratoBase>(
  contratos: T[],
  de: string,
  ate: string
): T[] {
  return contratos.filter(
    (c) =>
      c.data_ativacao !== null &&
      c.data_ativacao >= de &&
      c.data_ativacao <= ate &&
      c.data_cancelamento === null
  );
}

/**
 * Quem compõe a base de uma liderança.
 * - equipe: os vendedores cujo coordenador é o usuário desta pessoa
 * - pop: todos os contratos da POP dela, de quem quer que seja a venda
 */
export function contratosDaBase<T extends ContratoBase>(
  base: BaseComissao,
  contratos: T[],
  contexto: {
    vendedorId: string;
    usuarioId: string | null;
    popId: string | null;
    /** vendedor_id -> usuario_id do coordenador */
    coordenadorDoVendedor: Map<string, string | null>;
  },
  janela: { de: string; ate: string }
): T[] {
  if (base === "equipe") {
    if (!contexto.usuarioId) return [];
    const daEquipe = contratos.filter((c) => {
      if (!c.vendedor_id) return false;
      return contexto.coordenadorDoVendedor.get(c.vendedor_id) === contexto.usuarioId;
    });
    return ativadosNoPeriodo(daEquipe, janela.de, janela.ate);
  }

  if (base === "pop") {
    if (!contexto.popId) return [];
    const daPop = contratos.filter((c) => c.pop_id === contexto.popId);
    return ativadosNoPeriodo(daPop, janela.de, janela.ate);
  }

  return []; // 'proprias' é tratado pelo chamador (usa data de venda)
}
