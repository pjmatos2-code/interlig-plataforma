import { describe, expect, it } from "vitest";
import type { Usuario } from "@/lib/tipos";
import { alcanca, montarEscopo, perfilAbreModulo } from "./escopo-regras";

const u = (perfil: string, extra: Partial<Usuario> = {}): Usuario => ({ id: "u1", nome: "Teste", email: "t@x", perfil: perfil as Usuario["perfil"], pop_id: null, vendedor_id: null, ativo: true, ...extra });
// papéis liberados: os testes de escopo partem do módulo aberto a todos
const semDados = { conversasLiberadas: false, time: [], daPop: null, papeisLiberados: ["diretoria", "supervisor", "vendedor"] };

describe("montarEscopo — permissões por papel (autorização no servidor)", () => {
  it("gestor vê tudo, configura, gere metas e lê conversas", () => {
    const e = montarEscopo(u("gestor"), semDados)!;
    expect(e.papel).toBe("admin");
    expect(e.vendedorIds).toBeNull();
    expect([e.podeConfigurar, e.podeGerirMetas, e.podeVerConversas, e.podeExportar]).toEqual([true, true, true, true]);
  });
  it("diretoria vê todas as unidades, só leitura, conversas só se liberado", () => {
    const e = montarEscopo(u("direcao"), semDados)!;
    expect(e.papel).toBe("diretoria");
    expect(e.vendedorIds).toBeNull();
    expect([e.podeConfigurar, e.podeTratarAlertas, e.podeVerConversas]).toEqual([false, false, false]);
    expect(montarEscopo(u("direcao"), { ...semDados, conversasLiberadas: true })!.podeVerConversas).toBe(true);
  });
  it("coordenador de time vê só o time; sem time, coordenador de unidade vê só a POP", () => {
    const sup = montarEscopo(u("supervisor"), { ...semDados, time: ["v1", "v2"] })!;
    expect(sup.papel).toBe("supervisor");
    expect(sup.vendedorIds).toEqual(["v1", "v2"]);
    expect(sup.podeConfigurar).toBe(false);
    const ger = montarEscopo(u("supervisor", { pop_id: "p1" }), { ...semDados, daPop: ["v7"] })!;
    expect(ger.papel).toBe("gerente_unidade");
    expect(ger.vendedorIds).toEqual(["v7"]);
    expect(montarEscopo(u("supervisor"), semDados)).toBeNull(); // sem time e sem POP
  });
  it("vendedor só o próprio, sem exportar e sem números das colegas", () => {
    const e = montarEscopo(u("vendedora", { vendedor_id: "v9" }), semDados)!;
    expect(e.papel).toBe("vendedor");
    expect(e.vendedorIds).toEqual(["v9"]);
    expect([e.podeExportar, e.verValoresDeColegas, e.podeTratarAlertas]).toEqual([false, false, false]);
    expect(montarEscopo(u("vendedora"), semDados)).toBeNull(); // sem vínculo de vendedor
  });
  it("perfil fora do comercial não entra", () => {
    expect(montarEscopo(u("tecnico"), semDados)).toBeNull();
  });
});

describe("alcanca", () => {
  it("escopo restrito alcança só os seus; registro sem vendedor só o escopo total", () => {
    const sup = montarEscopo(u("supervisor"), { ...semDados, time: ["v1"] })!;
    expect(alcanca(sup, "v1")).toBe(true);
    expect(alcanca(sup, "v2")).toBe(false);
    expect(alcanca(sup, null)).toBe(false);
    expect(alcanca(montarEscopo(u("gestor"), semDados)!, null)).toBe(true);
  });
});

describe("acesso ao módulo por papel (Configurações → quem abre o módulo)", () => {
  const soAdmin = { ...semDados, papeisLiberados: [] as string[] };
  it("padrão de 24/10/2026: só o administrador abre", () => {
    expect(montarEscopo(u("gestor"), soAdmin)?.papel).toBe("admin");
    expect(montarEscopo(u("direcao"), soAdmin)).toBeNull();
    expect(montarEscopo(u("supervisor"), { ...soAdmin, time: ["v1"] })).toBeNull();
    expect(montarEscopo(u("supervisor", { pop_id: "p1" }), { ...soAdmin, daPop: ["v7"] })).toBeNull();
    expect(montarEscopo(u("vendedora", { vendedor_id: "v9" }), soAdmin)).toBeNull();
  });
  it("liberar 'supervisor' abre para coordenador de time e de unidade, e só eles", () => {
    const d = { ...semDados, papeisLiberados: ["supervisor"] };
    expect(montarEscopo(u("supervisor"), { ...d, time: ["v1"] })?.papel).toBe("supervisor");
    expect(montarEscopo(u("supervisor", { pop_id: "p1" }), { ...d, daPop: ["v7"] })?.papel).toBe("gerente_unidade");
    expect(montarEscopo(u("direcao"), d)).toBeNull();
    expect(montarEscopo(u("vendedora", { vendedor_id: "v9" }), d)).toBeNull();
  });
  it("menu segue a mesma regra sem consultar o banco", () => {
    expect(perfilAbreModulo("gestor", [])).toBe(true);
    expect(perfilAbreModulo("direcao", [])).toBe(false);
    expect(perfilAbreModulo("direcao", ["diretoria"])).toBe(true);
    expect(perfilAbreModulo("vendedora_externa", ["vendedor"])).toBe(true);
    expect(perfilAbreModulo("financeiro", ["diretoria", "supervisor", "vendedor"])).toBe(false);
  });
});
