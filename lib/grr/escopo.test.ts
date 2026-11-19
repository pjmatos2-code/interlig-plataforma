import { describe, expect, it } from "vitest";
import { agentesDeVenda, noEscopo, resolverEscopo, type CadastroGrr, type VendedorGrr } from "./escopo";

const v = (id: string, pop: string, extra: Partial<VendedorGrr> = {}): VendedorGrr => ({
  id,
  nome: id.toUpperCase(),
  pop_id: pop,
  setor: "comercial_interno",
  ativo: true,
  eh_coordenador: false,
  coordenador_id: null,
  ...extra,
});

const CADASTRO: CadastroGrr = {
  pops: [
    { id: "alt", nome: "Altamira" },
    { id: "bn", nome: "Brasil Novo" },
  ],
  vendedores: [
    v("a1", "alt", { coordenador_id: "coordA" }),
    v("a2", "alt", { coordenador_id: "coordA" }),
    v("b1", "bn"),
    v("lider", "alt", { eh_coordenador: true }),
    v("refid", "alt", { setor: "atendimento" }),
    v("saiu", "alt", { ativo: false }),
  ],
  equipes: [{ coordenadorId: "coordA", nome: "Marcelo", vendedorIds: ["a1", "a2"] }],
};
const direcao = { perfil: "direcao" as const, pop_id: null };

describe("agentes do time de vendas", () => {
  it("só ativos de setor de venda, sem coordenadores", () => {
    expect(agentesDeVenda(CADASTRO.vendedores).map((x) => x.id)).toEqual(["a1", "a2", "b1"]);
  });
});

describe("escopo da direção e da administração", () => {
  it("abre na empresa", () => {
    const e = resolverEscopo(direcao, null, {}, CADASTRO);
    expect(e.nivel).toBe("empresa");
    expect(e.popId).toBeNull();
    expect(e.vendedorIds).toBeNull();
    expect(e.podeFiltrar).toEqual({ unidade: true, equipe: true, agente: true });
  });

  it("filtra por unidade", () => {
    const e = resolverEscopo(direcao, null, { unidade: "bn" }, CADASTRO);
    expect([e.nivel, e.rotulo, e.popId]).toEqual(["unidade", "Brasil Novo", "bn"]);
    expect(e.agentesDisponiveis.map((x) => x.id)).toEqual(["b1"]);
  });

  it("filtra por equipe: recorta pelas pessoas, em qualquer unidade", () => {
    const e = resolverEscopo({ perfil: "gestor", pop_id: null }, null, { equipe: "coordA" }, CADASTRO);
    expect([e.nivel, e.rotulo, e.popId]).toEqual(["equipe", "Equipe de Marcelo", null]);
    expect(e.vendedorIds).toEqual(["a1", "a2"]);
  });

  it("filtra por agente; unidade, equipe ou agente que não existem são ignorados", () => {
    expect(resolverEscopo(direcao, null, { agente: "b1" }, CADASTRO).vendedorIds).toEqual(["b1"]);
    expect(resolverEscopo(direcao, null, { unidade: "xx", equipe: "yy", agente: "zz" }, CADASTRO).nivel).toBe("empresa");
  });
});

describe("escopo da coordenação", () => {
  const coordenador = { perfil: "supervisor" as const, pop_id: "alt" };

  it("quem coordena agentes fica preso à equipe e não troca de unidade nem de equipe", () => {
    const e = resolverEscopo(coordenador, ["a1", "a2"], { unidade: "bn", equipe: "outra" }, CADASTRO);
    expect([e.nivel, e.popId]).toEqual(["equipe", null]);
    expect(e.vendedorIds).toEqual(["a1", "a2"]);
    expect(e.podeFiltrar).toEqual({ unidade: false, equipe: false, agente: true });
  });

  it("pode abrir um agente da própria equipe, nunca de fora", () => {
    expect(resolverEscopo(coordenador, ["a1", "a2"], { agente: "a2" }, CADASTRO).vendedorIds).toEqual(["a2"]);
    expect(resolverEscopo(coordenador, ["a1", "a2"], { agente: "b1" }, CADASTRO).vendedorIds).toEqual(["a1", "a2"]);
  });

  it("quem não coordena agentes fica preso à própria unidade", () => {
    const e = resolverEscopo({ perfil: "supervisor", pop_id: "bn" }, null, { unidade: "alt", agente: "a1" }, CADASTRO);
    expect([e.nivel, e.rotulo, e.popId, e.vendedorIds]).toEqual(["unidade", "Brasil Novo", "bn", null]);
  });

  it("coordenação sem unidade no cadastro não enxerga a empresa", () => {
    const e = resolverEscopo({ perfil: "supervisor", pop_id: null }, null, {}, CADASTRO);
    expect(e.popId).toBe("sem-unidade");
    expect(noEscopo(e, { pop_id: "alt", vendedor_id: "a1" })).toBe(false);
  });
});

describe("registro dentro do recorte", () => {
  it("confere unidade e agentes", () => {
    expect(noEscopo({ popId: null, vendedorIds: null }, { pop_id: "alt", vendedor_id: null })).toBe(true);
    expect(noEscopo({ popId: "bn", vendedorIds: null }, { pop_id: "alt", vendedor_id: "a1" })).toBe(false);
    expect(noEscopo({ popId: null, vendedorIds: ["a1"] }, { pop_id: "alt", vendedor_id: "a1" })).toBe(true);
    expect(noEscopo({ popId: null, vendedorIds: ["a1"] }, { pop_id: "alt", vendedor_id: null })).toBe(false);
  });
});
