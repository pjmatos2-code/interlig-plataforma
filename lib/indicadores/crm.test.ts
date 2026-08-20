import { describe, expect, it } from "vitest";
import {
  conversaoReal,
  tempoPrimeiraTratativa,
  cicloNegociacao,
  taxaReconciliacao,
  estadoInatividade,
  podeReabrir,
  mediana,
  normalizarTelefone,
  normalizarCpf,
  type TicketIndicador,
} from "./crm";

function ticket(parcial: Partial<TicketIndicador>): TicketIndicador {
  return {
    criado_em: "2026-08-01T10:00:00Z",
    primeira_tratativa_em: null,
    fechado_em: null,
    etapa: "novo",
    desfecho: null,
    contrato_id: null,
    reconciliado_em: null,
    atualizado_em: "2026-08-01T10:00:00Z",
    ...parcial,
  };
}

const fechadoConvertido = (extra: Partial<TicketIndicador> = {}) =>
  ticket({
    etapa: "fechado",
    desfecho: "convertido",
    fechado_em: "2026-08-10T10:00:00Z",
    ...extra,
  });

const fechadoNaoConvertido = (extra: Partial<TicketIndicador> = {}) =>
  ticket({
    etapa: "fechado",
    desfecho: "nao_convertido",
    fechado_em: "2026-08-10T10:00:00Z",
    ...extra,
  });

describe("mediana", () => {
  it("ímpar, par e vazio", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe("5.14 — conversão real", () => {
  it("convertidos ÷ fechados; abertos ficam fora", () => {
    const lista = [
      fechadoConvertido(),
      fechadoNaoConvertido(),
      fechadoNaoConvertido(),
      ticket({ etapa: "aguardando" }),
    ];
    const r = conversaoReal(lista);
    expect(r.fechados).toBe(3);
    expect(r.convertidos).toBe(1);
    expect(r.taxa).toBeCloseTo(1 / 3);
  });

  it("fechado por inatividade conta no denominador", () => {
    const r = conversaoReal([fechadoConvertido(), fechadoNaoConvertido()]);
    expect(r.taxa).toBe(0.5);
  });

  it("nenhum fechado → null", () => {
    expect(conversaoReal([ticket({})]).taxa).toBeNull();
  });
});

describe("5.15 — tempo de 1ª tratativa (mediana, minutos)", () => {
  it("mediana em minutos, ignorando sem tratativa", () => {
    const lista = [
      ticket({ primeira_tratativa_em: "2026-08-01T10:10:00Z" }), // 10
      ticket({ primeira_tratativa_em: "2026-08-01T11:00:00Z" }), // 60
      ticket({ primeira_tratativa_em: "2026-08-01T10:30:00Z" }), // 30
      ticket({}),
    ];
    expect(tempoPrimeiraTratativa(lista)).toBe(30);
  });
});

describe("5.16 — ciclo de negociação (mediana, dias, por desfecho)", () => {
  it("separa por desfecho", () => {
    const lista = [
      fechadoConvertido({ fechado_em: "2026-08-05T10:00:00Z" }), // 4 dias
      fechadoConvertido({ fechado_em: "2026-08-11T10:00:00Z" }), // 10 dias
      fechadoNaoConvertido({ fechado_em: "2026-08-03T10:00:00Z" }), // 2 dias
    ];
    expect(cicloNegociacao(lista, "convertido")).toBe(7);
    expect(cicloNegociacao(lista, "nao_convertido")).toBe(2);
  });
});

describe("5.17 — taxa de reconciliação", () => {
  it("contrato vinculado em ≤ 7 dias do fechamento conta", () => {
    const lista = [
      fechadoConvertido({ contrato_id: "c1", reconciliado_em: "2026-08-12T10:00:00Z" }), // 2d ✓
      fechadoConvertido({ contrato_id: "c2", reconciliado_em: "2026-08-20T10:00:00Z" }), // 10d ✗
      fechadoConvertido(), // sem contrato ✗
      fechadoNaoConvertido(), // fora da base
    ];
    const r = taxaReconciliacao(lista);
    expect(r.convertidos).toBe(3);
    expect(r.reconciliados).toBe(1);
    expect(r.taxa).toBeCloseTo(1 / 3);
  });
});

describe("fechamento automático por inatividade", () => {
  it("15+ dias parado → fechar", () => {
    const r = estadoInatividade(
      { etapa: "aguardando", atualizado_em: "2026-08-01T10:00:00Z" },
      "2026-08-16T11:00:00Z"
    );
    expect(r.situacao).toBe("fechar");
  });

  it("dia N−3 → avisar", () => {
    const r = estadoInatividade(
      { etapa: "aguardando", atualizado_em: "2026-08-01T10:00:00Z" },
      "2026-08-13T10:00:00Z" // 12 dias parado, fecha em 3
    );
    expect(r.situacao).toBe("avisar");
    expect(r.fechaEmDias).toBeCloseTo(3);
  });

  it("movimentado há pouco → ok; fechado nunca fecha de novo", () => {
    expect(
      estadoInatividade(
        { etapa: "novo", atualizado_em: "2026-08-14T10:00:00Z" },
        "2026-08-16T10:00:00Z"
      ).situacao
    ).toBe("ok");
    expect(
      estadoInatividade(
        { etapa: "fechado", atualizado_em: "2026-01-01T10:00:00Z" },
        "2026-08-16T10:00:00Z"
      ).situacao
    ).toBe("ok");
  });
});

describe("reabertura em até 30 dias", () => {
  it("não convertido dentro da janela → pode", () => {
    expect(podeReabrir(fechadoNaoConvertido(), "2026-09-05T10:00:00Z")).toBe(true);
  });
  it("fora da janela ou convertido → não pode", () => {
    expect(podeReabrir(fechadoNaoConvertido(), "2026-09-15T10:00:00Z")).toBe(false);
    expect(podeReabrir(fechadoConvertido(), "2026-08-15T10:00:00Z")).toBe(false);
    expect(podeReabrir(ticket({ etapa: "aguardando" }), "2026-08-15T10:00:00Z")).toBe(false);
  });
});

describe("normalização para anti-duplicidade e reconciliação", () => {
  it("telefone: ignora máscara, DDI 55 e zeros à esquerda", () => {
    expect(normalizarTelefone("(93) 99123-4567")).toBe("93991234567");
    expect(normalizarTelefone("+55 93 99123-4567")).toBe("93991234567");
    expect(normalizarTelefone("093991234567")).toBe("93991234567");
    expect(normalizarTelefone(null)).toBe("");
  });
  it("cpf: só dígitos", () => {
    expect(normalizarCpf("123.456.789-01")).toBe("12345678901");
  });
});
