import { describe, expect, it } from "vitest";
import type { DadosGrr, LinhaQuebra } from "./montar";
import { agentesImpossiveis, conferirSemana, resumoConferencia, type ExtrasConferencia } from "./conferencia";

const linha = (p: Partial<LinhaQuebra>): LinhaQuebra => ({
  id: "x", nome: "x", detalhe: null, vendas: 0, vendasAnterior: 0, vendasMes: 0, metaMes: null, receita: 0, ticket: null, recebidos: 0, atendidos: 0, fechados: 0, convertidos: 0,
  conversao: null, perdidos: 0, emNegociacao: 0, ativacoes: 0, safraAtendidos: 0, safraConvertidos: 0, safraTaxa: null, ...p,
});
const dados = (agentes: LinhaQuebra[], unidades: LinhaQuebra[], extra: Partial<DadosGrr> = {}) =>
  ({
    vendas: { semana: 5, semVendedorSemana: 0 },
    conversao: { fechados: 6, convertidos: 3, recebidos: 10, novosSemAtendimento: 0, foraDaConversao: 1, convertidasSemLead: 1, safra: { convertidos: 2, repetidos: 0, leads: 8, atendidos: 8 } },
    ativacoes: { semana: 4, noDiaDaVenda: 0 },
    avisos: [],
    porAgente: agentes,
    porUnidade: unidades,
    ...extra,
  }) as unknown as DadosGrr;
const extras: ExtrasConferencia = { convertidosSemContrato: 0, reatribuidos: { leads: 0, convertidosPorOutro: 0 }, relatorioVendas: 5, foto: null };
const agentes = [linha({ nome: "Ana", vendas: 3, fechados: 4, convertidos: 2, safraAtendidos: 3, safraConvertidos: 1 }), linha({ nome: "Sem agente", vendas: 2, fechados: 2, convertidos: 1, safraAtendidos: 1, safraConvertidos: 1 })];
const unidades = [linha({ vendas: 5 })];

describe("conferência dos dados", () => {
  it("somas que batem ficam ok", () => {
    const v = conferirSemana(dados(agentes, unidades), extras);
    expect(v.filter((x) => x.grupo === "somas").every((x) => x.status === "ok")).toBe(true);
    expect(v.find((x) => x.chave === "relatorio")?.status).toBe("ok");
  });

  it("soma que não bate é erro; safra diferente é informação", () => {
    const v = conferirSemana(dados([linha({ nome: "Ana", vendas: 4, fechados: 6, convertidos: 3, safraConvertidos: 3, safraAtendidos: 4 })], unidades), extras);
    expect(v.find((x) => x.chave === "soma_vendas_agente")?.status).toBe("erro");
    expect(v.find((x) => x.chave === "soma_safra_agente")?.status).toBe("info");
  });

  it("taxa impossível por agente", () => {
    expect(agentesImpossiveis([linha({ nome: "Bia", safraAtendidos: 1, safraConvertidos: 2 }), linha({ nome: "Cris", fechados: 2, convertidos: 1 })])).toEqual(["Bia"]);
  });

  it("leads trocados de agente e vendas sem contrato acendem atenção", () => {
    const v = conferirSemana(dados(agentes, unidades), { ...extras, convertidosSemContrato: 2, reatribuidos: { leads: 5, convertidosPorOutro: 1 } });
    expect(v.find((x) => x.chave === "convertidos_sem_contrato")?.status).toBe("atencao");
    expect(v.find((x) => x.chave === "leads_reatribuidos")?.status).toBe("atencao");
  });

  it("números que mudaram depois do congelamento aparecem como informação", () => {
    const v = conferirSemana(dados(agentes, unidades), { ...extras, relatorioVendas: null, foto: { versao: 1, vendas: 4, convertidos: 3, recebidos: 10 } });
    expect(v.find((x) => x.chave === "foto")?.valor).toBe("vendas 4 → 5");
    expect(v.find((x) => x.chave === "relatorio")?.status).toBe("info");
    expect(resumoConferencia(v).erro).toBe(0);
  });
});
