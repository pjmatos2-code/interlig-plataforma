/**
 * Vínculos entre coordenador e agente (16/11/2026). São dois:
 *
 *  - EQUIPE (vendedores.coordenador_id): a agente é do time do coordenador.
 *    Ele acompanha tudo dela, recebe os avisos do sino e as ativações dela
 *    entram na comissão de liderança dele (base "equipe"). Cada agente tem
 *    uma equipe só.
 *  - APOIO (coordenadores_extras): o coordenador tem o mesmo acesso ao CRM,
 *    à esteira e aos resultados da agente, mas ela NÃO entra na comissão
 *    dele nem manda avisos para ele. Uma agente pode ter vários apoios.
 *
 * Aqui fica só a leitura do formulário da Administração, sem banco, para os
 * testes. Quem grava é definirAgentesCoordenador (app/(app)/admin/acoes.ts).
 */
export type Vinculo = "equipe" | "apoio";

/** Prefixo dos campos do formulário: "vinculo:<id da agente>". */
export const CAMPO_VINCULO = "vinculo:";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (texto: string) => UUID.test(texto);

export type VinculosDoFormulario = {
  /** agentes marcadas como equipe deste coordenador */
  equipe: string[];
  /** agentes marcadas como apoio */
  apoio: string[];
  /** agentes que estavam no formulário e ficaram sem vínculo com ele */
  nenhum: string[];
};

/**
 * Lê os campos "vinculo:<id>" = "equipe" | "apoio" | "" do formulário. Só as
 * agentes que estavam na tela entram no resultado: quem não foi listada
 * (agente desligada, por exemplo) não tem o vínculo alterado.
 */
export function lerVinculos(entradas: Iterable<[string, unknown]>): VinculosDoFormulario {
  const escolha = new Map<string, Vinculo | "">();
  for (const [campo, valor] of entradas) {
    if (!campo.startsWith(CAMPO_VINCULO)) continue;
    const id = campo.slice(CAMPO_VINCULO.length);
    if (!ehUuid(id)) continue;
    escolha.set(id, valor === "equipe" || valor === "apoio" ? valor : "");
  }
  const com = (v: Vinculo | "") => [...escolha].filter(([, e]) => e === v).map(([id]) => id);
  return { equipe: com("equipe"), apoio: com("apoio"), nenhum: com("") };
}

/** Vínculo atual de cada agente com um coordenador, para preencher o formulário. */
export function vinculosAtuais(
  coordenadorId: string,
  agentes: { id: string; coordenador_id: string | null }[],
  emApoio: Iterable<string>
): Record<string, Vinculo | ""> {
  const apoio = new Set(emApoio);
  return Object.fromEntries(
    agentes.map((a) => [a.id, a.coordenador_id === coordenadorId ? "equipe" : apoio.has(a.id) ? "apoio" : ""])
  );
}
