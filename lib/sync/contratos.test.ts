import { describe, expect, it } from "vitest";
import { dataDaVenda, dataDoCancelamento, naoAntesDaVenda } from "./contratos";

describe("data da venda gravada pelo sync", () => {
  it("contrato novo: a data de cadastro do SGP", () => {
    expect(dataDaVenda(undefined, "2026-11-11")).toBe("2026-11-11");
  });

  it("contrato já gravado, sem ajuste: segue a data do SGP (inclusive se ela mudar lá)", () => {
    expect(dataDaVenda({ data_venda: "2026-09-28", venda_retomada_em: null }, "2026-09-28")).toBe("2026-09-28");
    expect(dataDaVenda({ data_venda: "2026-09-28", venda_retomada_em: null }, "2026-09-29")).toBe("2026-09-29");
  });

  it("venda retomada: o sync respeita a data ajustada pela gestão", () => {
    // contrato 22762: cadastro em 28/09, venda válida em 12/11
    const gravado = { data_venda: "2026-11-12", venda_retomada_em: "2026-11-18T19:00:00Z" };
    expect(dataDaVenda(gravado, "2026-09-28")).toBe("2026-11-12");
  });
});

describe("data de cancelamento gravada pelo sync", () => {
  const HOJE = "2026-11-18";

  it("contrato não cancelado: sem data", () => {
    expect(dataDoCancelamento(undefined, { data_cancelamento: null, data_venda: "2026-11-10" }, HOJE)).toBeNull();
    // voltou a ficar ativo no SGP: a data some, como já era
    expect(dataDoCancelamento({ data_cancelamento: "2026-10-01" }, { data_cancelamento: null, data_venda: "2026-08-01" }, HOJE)).toBeNull();
  });

  it("já havia data gravada: fica a gravada", () => {
    expect(dataDoCancelamento({ data_cancelamento: "2026-10-07" }, { data_cancelamento: HOJE, data_venda: "2026-08-01" }, HOJE)).toBe("2026-10-07");
  });

  it("contrato da base que apareceu cancelado agora: o dia em que o sync percebeu", () => {
    expect(dataDoCancelamento({ data_cancelamento: null }, { data_cancelamento: HOJE, data_venda: "2025-03-01" }, HOJE)).toBe(HOJE);
  });

  it("contrato novo na base, já cancelado e com cadastro antigo: não foi cancelado hoje", () => {
    // contrato 12821, cadastro de 21/10/2023, de cliente que ficava de fora pela cidade
    expect(dataDoCancelamento(undefined, { data_cancelamento: HOJE, data_venda: "2023-10-21" }, HOJE)).toBe("2023-10-21");
  });

  it("contrato novo na base, cancelado logo depois do cadastro: vale o dia em que o sync percebeu", () => {
    expect(dataDoCancelamento(undefined, { data_cancelamento: HOJE, data_venda: "2026-11-05" }, HOJE)).toBe(HOJE);
    expect(dataDoCancelamento(undefined, { data_cancelamento: HOJE, data_venda: "2026-10-19" }, HOJE)).toBe(HOJE); // 30 dias
    expect(dataDoCancelamento(undefined, { data_cancelamento: HOJE, data_venda: "2026-10-18" }, HOJE)).toBe("2026-10-18"); // 31 dias
  });
});

describe("datas que o banco não aceita antes da venda", () => {
  it("mesmo dia ou depois da venda: fica como está", () => {
    expect(naoAntesDaVenda("2026-11-12", "2026-11-12")).toBe("2026-11-12");
    expect(naoAntesDaVenda("2026-11-14", "2026-11-12")).toBe("2026-11-14");
  });

  it("sem data: continua sem data", () => {
    expect(naoAntesDaVenda(null, "2026-11-12")).toBeNull();
  });

  it("venda retomada: a data aproximada pelo cadastro do SGP sobe para o dia da venda", () => {
    // contrato 22762: cadastro em 28/09, venda válida em 12/11. O leitor aproxima
    // assinatura e ativação pelo cadastro, e o banco recusaria o lote inteiro.
    expect(naoAntesDaVenda("2026-09-28", "2026-11-12")).toBe("2026-11-12");
  });

  it("contrato sem ajuste: as datas aproximadas já são a do cadastro", () => {
    expect(naoAntesDaVenda("2026-11-11", dataDaVenda(undefined, "2026-11-11"))).toBe("2026-11-11");
  });
});
