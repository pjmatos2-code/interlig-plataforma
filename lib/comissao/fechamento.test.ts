import { describe, expect, it } from "vitest";
import { pessoasEmMaisDeUmaApuracao } from "./fechamento";

describe("um demonstrativo por pessoa por mês (17/11/2026)", () => {
  it("cada pessoa numa apuração só: nada a apontar", () => {
    expect(
      pessoasEmMaisDeUmaApuracao([
        { tipo: "venda", ids: ["karoline", "damely"] },
        { tipo: "refidelização", ids: ["talia", "myllena"] },
        { tipo: "retenção", ids: ["sandryne"] },
        { tipo: "gerência", ids: ["gestao"] },
      ])
    ).toEqual([]);
  });

  it("quem vende e refideliza no mesmo mês é apontada, com as duas comissões", () => {
    expect(
      pessoasEmMaisDeUmaApuracao([
        { tipo: "venda", ids: ["karoline", "talia"] },
        { tipo: "refidelização", ids: ["talia", "myllena"] },
      ])
    ).toEqual([{ id: "talia", tipos: ["venda", "refidelização"] }]);
  });

  it("aceita as chaves de um Map e não conta repetição dentro da mesma apuração", () => {
    const vendas = new Map([["talia", 1]]);
    expect(pessoasEmMaisDeUmaApuracao([{ tipo: "venda", ids: vendas.keys() }, { tipo: "venda2", ids: [] }])).toEqual([]);
    expect(pessoasEmMaisDeUmaApuracao([{ tipo: "venda", ids: ["talia", "talia"] }])).toEqual([]);
  });
});
