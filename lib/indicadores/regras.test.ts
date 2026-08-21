import { describe, expect, it } from "vitest";
import {
  ehVendaContavel,
  churnPrecoce,
  safraFechada,
  inadimplenciaPrimeiraFatura,
  taxaInstalacaoEfetiva,
  tempoMedioVendaAtivacao,
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

describe("5.9 — taxa de instalação efetiva", () => {
  it("só conta vendas com janela de 15 dias fechada", () => {
    const lista = [
      // vendida há 20 dias, ativada em 10 → conta como instalada
      contrato({ data_venda: "2026-07-31", data_ativacao: "2026-08-10", status: "ativo" }),
      // vendida há 20 dias, ativada em 18 → na base, mas fora da janela
      contrato({ data_venda: "2026-07-31", data_ativacao: "2026-08-18", status: "ativo" }),
      // vendida há 20 dias, nunca ativada → na base como não instalada
      contrato({ data_venda: "2026-07-31", status: "aguardando_ativacao" }),
      // vendida há 5 dias → janela aberta, fora da base
      contrato({ data_venda: "2026-08-15", status: "aguardando_ativacao" }),
    ];
    const r = taxaInstalacaoEfetiva(lista, "2026-08-20");
    expect(r.base).toBe(3);
    expect(r.instaladas).toBe(1);
    expect(r.taxa).toBeCloseTo(1 / 3);
  });

  it("sem vendas com janela fechada → taxa null, nunca 0 enganoso", () => {
    const lista = [contrato({ data_venda: "2026-08-19" })];
    expect(taxaInstalacaoEfetiva(lista, "2026-08-20").taxa).toBeNull();
  });

  it("ativada exatamente no 15º dia conta (≤ 15)", () => {
    const lista = [
      contrato({ data_venda: "2026-08-01", data_ativacao: "2026-08-16", status: "ativo" }),
    ];
    const r = taxaInstalacaoEfetiva(lista, "2026-08-20");
    expect(r.taxa).toBe(1);
  });
});

describe("tempo médio venda → ativação (PRD 3.5)", () => {
  it("média em dias dos contratos ativados", () => {
    const lista = [
      contrato({ data_venda: "2026-08-01", data_ativacao: "2026-08-05", status: "ativo" }), // 4
      contrato({ data_venda: "2026-08-01", data_ativacao: "2026-08-11", status: "ativo" }), // 10
      contrato({ data_venda: "2026-08-01", status: "aguardando_ativacao" }), // ignorado
    ];
    expect(tempoMedioVendaAtivacao(lista)).toBeCloseTo(7);
  });

  it("nenhum ativado → null", () => {
    expect(tempoMedioVendaAtivacao([contrato({})])).toBeNull();
  });
});

describe("5.10 — churn precoce (90 dias)", () => {
  it("só conta ativados com janela de 90 dias fechada", () => {
    const lista = [
      // ativado há 120d, cancelado no dia 60 → churn precoce
      contrato({ data_ativacao: "2026-04-01", data_cancelamento: "2026-05-31", status: "cancelado" }),
      // ativado há 120d, cancelado no dia 100 → cancelou, mas NÃO é precoce
      contrato({ data_ativacao: "2026-04-01", data_cancelamento: "2026-07-10", status: "cancelado" }),
      // ativado há 120d, segue ativo → base
      contrato({ data_ativacao: "2026-04-01", status: "ativo" }),
      // ativado há 30d → janela aberta, fora da base
      contrato({ data_ativacao: "2026-07-21", status: "ativo" }),
    ];
    const r = churnPrecoce(lista, "2026-08-20");
    expect(r.base).toBe(3);
    expect(r.cancelados).toBe(1);
    expect(r.taxa).toBeCloseTo(1 / 3);
  });

  it("cancelamento exatamente no dia 90 conta (≤ 90)", () => {
    const lista = [
      contrato({ data_ativacao: "2026-04-01", data_cancelamento: "2026-06-30", status: "cancelado" }),
    ];
    expect(churnPrecoce(lista, "2026-08-20").cancelados).toBe(1);
  });

  it("sem base → taxa null", () => {
    expect(churnPrecoce([contrato({})], "2026-08-20").taxa).toBeNull();
  });
});

describe("5.10 — safra fechada", () => {
  it("safra fecha quando o último dia do mês tem 90+ dias", () => {
    expect(safraFechada("2026-05-01", "2026-08-30")).toBe(true);  // 31/05 + 91d
    expect(safraFechada("2026-06-01", "2026-08-20")).toBe(false); // 30/06 + 51d
  });
});

describe("5.11 — inadimplência de 1ª fatura", () => {
  const t = (venc: string, pag: string | null, status: string) => ({
    vencimento: venc,
    data_pagamento: pag,
    status,
  });

  it("não liquidado até vencimento + 10 conta; janela aberta fica fora", () => {
    const lista = [
      t("2026-07-01", "2026-07-05", "liquidado"),  // pagou no prazo
      t("2026-07-01", null, "aberto"),             // nunca pagou → inadimplente
      t("2026-07-01", "2026-07-20", "liquidado"),  // pagou 19 dias depois → inadimplente
      t("2026-08-15", null, "aberto"),             // venc + 10 ainda não passou → fora
    ];
    const r = inadimplenciaPrimeiraFatura(lista, "2026-08-20");
    expect(r.base).toBe(3);
    expect(r.inadimplentes).toBe(2);
    expect(r.taxa).toBeCloseTo(2 / 3);
  });

  it("título cancelado não julga a venda", () => {
    const lista = [t("2026-07-01", null, "cancelado")];
    expect(inadimplenciaPrimeiraFatura(lista, "2026-08-20").taxa).toBeNull();
  });

  it("pagamento exatamente no dia venc+10 é adimplente", () => {
    const lista = [t("2026-07-01", "2026-07-11", "liquidado")];
    expect(inadimplenciaPrimeiraFatura(lista, "2026-08-20").inadimplentes).toBe(0);
  });
});
