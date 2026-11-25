import { describe, expect, it } from "vitest";
import { acessoDoModulo } from "./acessos";
import { navDoUsuario } from "./nav";

describe("acesso aos módulos por usuário", () => {
  it("sem ajuste vale o perfil", () => {
    expect(acessoDoModulo("gestor_tecnico", [], "operacao")).toEqual({ permitido: true, popId: null, ajustado: false });
    expect(acessoDoModulo("supervisor", [], "operacao").permitido).toBe(false);
    expect(acessoDoModulo("supervisor", [], "grr_comercial").permitido).toBe(true);
  });
  it("ajuste libera com unidade ou bloqueia", () => {
    const aline = [{ modulo: "operacao" as const, permitido: true, popId: "pop-bn" }];
    expect(acessoDoModulo("supervisor", aline, "operacao")).toEqual({ permitido: true, popId: "pop-bn", ajustado: true });
    const rayssa = [{ modulo: "grr_comercial" as const, permitido: false, popId: null }, { modulo: "operacao" as const, permitido: true, popId: null }];
    expect(acessoDoModulo("supervisor", rayssa, "grr_comercial").permitido).toBe(false);
  });
  it("Qualidade: só a Operação Técnica, sem InterChat", () => {
    expect(navDoUsuario("qualidade").map((i) => i.href)).toEqual(["/operacao"]);
    expect(acessoDoModulo("qualidade", [], "operacao")).toEqual({ permitido: true, popId: null, ajustado: false });
    for (const m of ["infraestrutura", "grr_tecnico", "grr_comercial"] as const) expect(acessoDoModulo("qualidade", [], m).permitido).toBe(false);
  });
  it("menu segue os módulos", () => {
    const rayssa = [{ modulo: "grr_comercial" as const, permitido: false, popId: null }, { modulo: "operacao" as const, permitido: true, popId: null }];
    const menu = navDoUsuario("supervisor", { ajustes: rayssa }).map((i) => i.href);
    expect(menu).toContain("/operacao");
    expect(menu).not.toContain("/grr/setores");
    expect(navDoUsuario("supervisor").map((i) => i.href)).toContain("/grr/setores");
  });
});
