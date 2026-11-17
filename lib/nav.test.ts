import { describe, expect, it } from "vitest";
import { navDoPerfil, navDoUsuario } from "./nav";

const rotas = (itens: { href: string }[]) => itens.map((i) => i.href);

describe("menu de quem vende e ainda refideliza (17/11/2026)", () => {
  it("vendedora interna comum: o menu do perfil, sem as telas do Atendimento", () => {
    const menu = rotas(navDoUsuario("vendedora"));
    expect(menu).toEqual(rotas(navDoPerfil("vendedora")));
    expect(menu).not.toContain("/fidelidade");
    expect(menu).not.toContain("/prevencao");
  });

  it("vendedora que refideliza: tudo do comercial mais Fidelidade e Prevenção", () => {
    const menu = rotas(navDoUsuario("vendedora", { tambemRefideliza: true }));
    for (const rota of ["/meu-painel", "/minhas-vendas", "/minha-comissao", "/ranking", "/crm", "/esteira"]) {
      expect(menu).toContain(rota);
    }
    expect(menu).toContain("/fidelidade");
    expect(menu).toContain("/prevencao");
    // nada além disso: não ganha tela da gestão nem o módulo do gestor
    expect(menu).not.toContain("/refidelizacao");
    expect(menu).not.toContain("/retencao");
    expect(menu).not.toContain("/dashboard");
    expect(menu.length).toBe(rotas(navDoPerfil("vendedora")).length + 2);
  });

  it("os outros perfis não mudam", () => {
    for (const perfil of ["gestor", "supervisor", "agente_atendimento", "agente_retencao", "financeiro", "direcao"] as const) {
      expect(rotas(navDoUsuario(perfil))).toEqual(rotas(navDoPerfil(perfil)));
    }
  });
});
