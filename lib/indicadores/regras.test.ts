import { describe, expect, it } from "vitest";
import {
  ehVendaContavel,
  metaDiariaIndividual,
  tendencia,
  vendasDoPeriodo,
  receitaContratada,
  ticketMedio,
  percentualMeta,
  pace,
  projecaoFechamento,
  farolProjecao,
  ativacoesPendentes,
  pendentesAssinatura,
  mediaUltimosNDiasUteis,
  type ContratoIndicador,
} from "./regras";

function contrato(parcial: Partial<ContratoIndicador>): ContratoIndicador {
  return {
    data_venda: "2026-08-10",
    data_assinatura: null,
    data_ativacao: null,
    data_cancelamento: null,
    motivo_cancelamento: null,
    status: "pendente_assinatura",
    valor_mensalidade: 99.9,
    ...parcial,
  };
}

describe("5.1 — vendas do período", () => {
  it("conta contrato normal", () => {
    expect(ehVendaContavel(contrato({}))).toBe(true);
  });

  it("exclui cancelado antes da ativação por erro de cadastro", () => {
    expect(
      ehVendaContavel(
        contrato({
          status: "cancelado",
          data_cancelamento: "2026-08-12",
          motivo_cancelamento: "Erro de cadastro",
        })
      )
    ).toBe(false);
  });

  it("exclui cancelado antes da ativação por duplicidade", () => {
    expect(
      ehVendaContavel(
        contrato({
          status: "cancelado",
          data_cancelamento: "2026-08-12",
          motivo_cancelamento: "Duplicidade",
        })
      )
    ).toBe(false);
  });

  it("conta cancelado antes da ativação por outro motivo (desistência)", () => {
    expect(
      ehVendaContavel(
        contrato({
          status: "cancelado",
          data_cancelamento: "2026-08-12",
          motivo_cancelamento: "Desistência",
        })
      )
    ).toBe(true);
  });

  it("conta cancelado DEPOIS da ativação mesmo com motivo de exclusão", () => {
    expect(
      ehVendaContavel(
        contrato({
          status: "cancelado",
          data_ativacao: "2026-08-11",
          data_cancelamento: "2026-09-01",
          motivo_cancelamento: "Duplicidade",
        })
      )
    ).toBe(true);
  });

  it("filtra por data_venda dentro do período (inclusive nas pontas)", () => {
    const lista = [
      contrato({ data_venda: "2026-08-01" }),
      contrato({ data_venda: "2026-08-15" }),
      contrato({ data_venda: "2026-08-31" }),
      contrato({ data_venda: "2026-07-31" }),
      contrato({ data_venda: "2026-09-01" }),
    ];
    expect(vendasDoPeriodo(lista, "2026-08-01", "2026-08-31")).toHaveLength(3);
  });
});

describe("5.2 — receita contratada", () => {
  it("soma as mensalidades, sem taxa de instalação", () => {
    const vendas = [
      contrato({ valor_mensalidade: 79.9 }),
      contrato({ valor_mensalidade: 149.9 }),
    ];
    expect(receitaContratada(vendas)).toBeCloseTo(229.8);
  });
});

describe("5.3 — ticket médio", () => {
  it("receita ÷ vendas", () => {
    const vendas = [
      contrato({ valor_mensalidade: 80 }),
      contrato({ valor_mensalidade: 120 }),
    ];
    expect(ticketMedio(vendas)).toBeCloseTo(100);
  });

  it("zero vendas → 0 (não NaN)", () => {
    expect(ticketMedio([])).toBe(0);
  });
});

describe("5.4 — % da meta", () => {
  it("vendas ÷ meta", () => {
    expect(percentualMeta(18, 24)).toBeCloseTo(0.75);
  });
  it("meta zero → 0", () => {
    expect(percentualMeta(10, 0)).toBe(0);
  });
});

describe("5.5 — pace", () => {
  it("(meta − acumulado) ÷ dias úteis restantes, inclusive hoje", () => {
    // meta 24, vendeu 15, restam 6 dias úteis → precisa de 1,5/dia
    expect(pace(24, 15, 6)).toBeCloseTo(1.5);
  });

  it("meta batida → 0", () => {
    expect(pace(24, 30, 6)).toBe(0);
  });

  it("sem dias úteis restantes → 0", () => {
    expect(pace(24, 15, 0)).toBe(0);
  });
});

describe("5.6 — projeção de fechamento", () => {
  it("ritmo = 70% média 7 dias úteis + 30% média do mês", () => {
    // média últimos 7 dias úteis = 2; média do mês = 1; restam 10 dias úteis
    // ritmo = 0,7×2 + 0,3×1 = 1,7 → projeção = 20 + 17 = 37
    expect(
      projecaoFechamento({
        acumuladoMes: 20,
        mediaUltimos7DiasUteis: 2,
        mediaDiariaMes: 1,
        diasUteisRestantes: 10,
      })
    ).toBeCloseTo(37);
  });

  it("último dia do mês (0 restantes) → projeção = acumulado", () => {
    expect(
      projecaoFechamento({
        acumuladoMes: 22,
        mediaUltimos7DiasUteis: 2,
        mediaDiariaMes: 1,
        diasUteisRestantes: 0,
      })
    ).toBe(22);
  });

  it("média dos últimos 7 dias úteis considera só dias úteis, com zeros", () => {
    const vendasPorDia = new Map([
      ["2026-08-10", 3],
      ["2026-08-11", 1],
      // 12 e 13 sem vendas
      ["2026-08-14", 2],
    ]);
    const diasUteis = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];
    // total 6 em 5 dias úteis
    expect(mediaUltimosNDiasUteis(vendasPorDia, diasUteis, 7)).toBeCloseTo(1.2);
  });
});

describe("faróis da projeção (PRD 3.7)", () => {
  it("verde ≥ 100%, amarelo 85–99%, vermelho < 85%", () => {
    expect(farolProjecao(24, 24)).toBe("verde");
    expect(farolProjecao(23, 24)).toBe("amarelo"); // 95,8%
    expect(farolProjecao(20.4, 24)).toBe("amarelo"); // 85%
    expect(farolProjecao(20, 24)).toBe("vermelho"); // 83%
  });
});

describe("5.7 — ativações pendentes", () => {
  it("assinado sem ativação, idade = hoje − assinatura, alerta > 7 dias", () => {
    const lista = [
      contrato({ data_assinatura: "2026-08-10", status: "aguardando_ativacao" }),
      contrato({ data_assinatura: "2026-08-18", status: "aguardando_ativacao" }),
      contrato({ data_assinatura: "2026-08-10", data_ativacao: "2026-08-15", status: "ativo" }),
      contrato({ status: "pendente_assinatura" }),
    ];
    const pendentes = ativacoesPendentes(lista, "2026-08-20");
    expect(pendentes).toHaveLength(1 + 1);
    expect(pendentes[0].idadeDias).toBe(10);
    expect(pendentes[0].alerta).toBe(true);
    expect(pendentes[1].idadeDias).toBe(2);
    expect(pendentes[1].alerta).toBe(false);
  });

  it("cancelado não entra", () => {
    const lista = [
      contrato({ data_assinatura: "2026-08-01", status: "cancelado", data_cancelamento: "2026-08-05" }),
    ];
    expect(ativacoesPendentes(lista, "2026-08-20")).toHaveLength(0);
  });
});

describe("5.8 — pendentes de assinatura", () => {
  it("sem assinatura, alerta a partir de 48h", () => {
    const lista = [
      contrato({ data_venda: "2026-08-19" }), // 1 dia
      contrato({ data_venda: "2026-08-18" }), // 2 dias = 48h → alerta
      contrato({ data_venda: "2026-08-10", data_assinatura: "2026-08-11", status: "aguardando_ativacao" }),
    ];
    const pendentes = pendentesAssinatura(lista, "2026-08-20");
    expect(pendentes).toHaveLength(2);
    expect(pendentes[0].alerta).toBe(false);
    expect(pendentes[1].alerta).toBe(true);
  });
});

describe("meta diária individual (5.13 / PRD 3.7)", () => {
  it("meta mensal ÷ dias úteis do mês", () => {
    expect(metaDiariaIndividual(26, 26)).toBe(1);
    expect(metaDiariaIndividual(28, 26)).toBeCloseTo(1.0769, 3);
  });
  it("sem dias úteis → 0", () => {
    expect(metaDiariaIndividual(20, 0)).toBe(0);
  });
});

describe("tendência (PRD 3.2)", () => {
  it("últimos 7 dias vs 7 anteriores", () => {
    expect(tendencia(8, 5)).toBe("sobe");
    expect(tendencia(3, 5)).toBe("desce");
    expect(tendencia(5, 5)).toBe("estavel");
    expect(tendencia(0, 0)).toBe("estavel");
  });
});
