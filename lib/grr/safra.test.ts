import { describe, expect, it } from "vitest";
import { conversaoPorSafra, resumirSafra, type TicketSafra } from "./safra";

let n = 0;
const t = (extra: Partial<TicketSafra> = {}): TicketSafra => ({
  id: `t${++n}`,
  vendedor_id: "ana",
  pop_id: "alt",
  origem_criacao: "sz_auto",
  contrato_id: null,
  telefone: `9399100${String(1000 + n)}`,
  etapa: "fechado",
  desfecho: "nao_convertido",
  criado_em: "2026-11-10T13:00:00Z",
  primeira_tratativa_em: "2026-11-10T13:10:00Z",
  motivos_nao_conversao: { nome: "Preço" },
  ...extra,
});
const DE = "2026-11-09";
const ATE = "2026-11-15";

describe("conversão por safra de leads (conta gerencial do GRR)", () => {
  it("convertidos ÷ leads atendidos que chegaram no trecho", () => {
    const r = conversaoPorSafra([t({ desfecho: "convertido", motivos_nao_conversao: null }), t(), t(), t()], DE, ATE);
    expect([r.leads, r.atendidos, r.convertidos, r.perdidos]).toEqual([4, 4, 1, 3]);
    expect(r.taxa).toBe(0.25);
  });

  it("vale o dia em que o lead chegou, não o do fechamento: a venda pode fechar depois", () => {
    const chegouNaSemana = t({ desfecho: "convertido", motivos_nao_conversao: null });
    const chegouAntes = t({ criado_em: "2026-11-05T13:00:00Z", desfecho: "convertido", motivos_nao_conversao: null });
    // 01:30 UTC de segunda ainda é domingo em Santarém: entra na semana que termina no domingo
    const domingoANoite = t({ criado_em: "2026-11-16T01:30:00Z" });
    const r = conversaoPorSafra([chegouNaSemana, chegouAntes, domingoANoite], DE, ATE);
    expect([r.leads, r.convertidos]).toEqual([2, 1]);
  });

  it("venda lançada direto no SGP não é lead e não conta como conversão", () => {
    const r = conversaoPorSafra([t({ origem_criacao: "sgp_auto", desfecho: "convertido", motivos_nao_conversao: null }), t()], DE, ATE);
    expect([r.leads, r.convertidos, r.semAtendimentoPrevio]).toEqual([1, 0, 1]);
    expect(r.taxa).toBe(0);
  });

  it("já é cliente da base e transferido ficam fora, como na regra oficial", () => {
    const r = conversaoPorSafra([t({ motivos_nao_conversao: { nome: "Já é cliente da base" } }), t({ motivos_nao_conversao: { nome: "Transferido" } }), t()], DE, ATE);
    expect([r.leads, r.foraDaConversao]).toEqual([1, 2]);
  });

  it("dois tickets do mesmo telefone são um lead só; se um converteu, o lead converteu", () => {
    const r = conversaoPorSafra(
      [t({ telefone: "(93) 99100-0001" }), t({ telefone: "5593991000001", desfecho: "convertido", motivos_nao_conversao: null, vendedor_id: "bia" }), t()],
      DE,
      ATE
    );
    expect([r.leads, r.convertidos, r.repetidos]).toEqual([2, 1, 1]);
    // o agente do lead é o do ticket convertido
    expect(r.lista.find((l) => l.situacao === "convertido")!.vendedor_id).toBe("bia");
  });

  it("dois tickets do mesmo contrato também são um lead só", () => {
    const r = conversaoPorSafra(
      [t({ contrato_id: "c1", desfecho: "convertido", motivos_nao_conversao: null }), t({ contrato_id: "c1", desfecho: "convertido", motivos_nao_conversao: null })],
      DE,
      ATE
    );
    expect([r.leads, r.convertidos, r.repetidos]).toEqual([1, 1, 1]);
  });

  it("lead sem agente ou sem primeira tratativa chegou, mas não foi atendido", () => {
    const r = conversaoPorSafra([t({ vendedor_id: null }), t({ primeira_tratativa_em: null, etapa: "novo", desfecho: null }), t()], DE, ATE);
    expect([r.leads, r.atendidos]).toEqual([3, 1]);
  });

  it("lead ainda em negociação entra como atendido e fica à espera do desfecho", () => {
    const r = conversaoPorSafra([t({ etapa: "em_atendimento", desfecho: null, motivos_nao_conversao: null }), t({ desfecho: "convertido", motivos_nao_conversao: null })], DE, ATE);
    expect([r.atendidos, r.convertidos, r.emNegociacao]).toEqual([2, 1, 1]);
    expect(r.taxa).toBe(0.5);
  });

  it("sem lead atendido não há taxa", () => {
    expect(conversaoPorSafra([], DE, ATE).taxa).toBeNull();
  });

  it("resume uma parte dos leads (quebra por agente)", () => {
    const r = conversaoPorSafra([t({ desfecho: "convertido", motivos_nao_conversao: null }), t(), t({ vendedor_id: "bia" })], DE, ATE);
    const daAna = resumirSafra(r.lista.filter((l) => l.vendedor_id === "ana"));
    expect([daAna.atendidos, daAna.convertidos, daAna.taxa]).toEqual([2, 1, 0.5]);
  });
});
