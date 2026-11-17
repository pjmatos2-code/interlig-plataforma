import { describe, expect, it } from "vitest";
import { AGENTES_SETOR, refidelizaPeloLogin, vendeERefideliza } from "./agentes";

describe("quem refideliza (17/11/2026)", () => {
  it("reconhece pelo login do SGP, sem depender de maiúsculas ou espaços", () => {
    expect(refidelizaPeloLogin("talia.marques")).toBe(true);
    expect(refidelizaPeloLogin(" Talia.Marques ")).toBe(true);
    expect(refidelizaPeloLogin("myllena.araujo")).toBe(true);
  });

  it("quem não está na lista, ou não tem login, não refideliza", () => {
    expect(refidelizaPeloLogin("karoline.xavier")).toBe(false);
    expect(refidelizaPeloLogin("")).toBe(false);
    expect(refidelizaPeloLogin(null)).toBe(false);
    expect(refidelizaPeloLogin(undefined)).toBe(false);
  });

  it("a lista continua com as duas agentes: a meta do pilar da Gerência é 150 por agente", () => {
    expect(AGENTES_SETOR).toEqual(["talia.marques", "myllena.araujo"]);
  });
});

describe("vende no comercial e também refideliza", () => {
  it("cadastro do comercial com login da refidelização: tem os dois painéis", () => {
    expect(vendeERefideliza({ setor: "comercial_interno", sgp_login: "talia.marques" })).toBe(true);
  });

  it("quem é só do Atendimento segue com o painel de refidelização, sem o de vendas", () => {
    expect(vendeERefideliza({ setor: "atendimento", sgp_login: "talia.marques" })).toBe(false);
    expect(vendeERefideliza({ setor: "atendimento", sgp_login: "myllena.araujo" })).toBe(false);
  });

  it("vendedora que não refideliza segue só com o painel de vendas", () => {
    expect(vendeERefideliza({ setor: "comercial_interno", sgp_login: "karoline.xavier" })).toBe(false);
    expect(vendeERefideliza({ setor: "comercial_externo", sgp_login: null })).toBe(false);
  });

  it("sem cadastro, não", () => {
    expect(vendeERefideliza(null)).toBe(false);
    expect(vendeERefideliza(undefined)).toBe(false);
  });
});
