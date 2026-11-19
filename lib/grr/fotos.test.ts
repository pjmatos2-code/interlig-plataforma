import { describe, expect, it } from "vitest";
import { resolverEscopo, type CadastroGrr } from "./escopo";
import { chaveDoEscopo, escoposParaCongelar, paraFoto, proximaVersao } from "./fotos";
import type { DadosGrr } from "./montar";

const CADASTRO: CadastroGrr = {
  pops: [
    { id: "alt", nome: "Altamira" },
    { id: "bn", nome: "Brasil Novo" },
  ],
  vendedores: [
    { id: "ana", nome: "Ana", pop_id: "alt", setor: "comercial_interno", ativo: true, eh_coordenador: false, coordenador_id: "coord" },
    { id: "bia", nome: "Bia", pop_id: "bn", setor: "comercial_externo", ativo: true, eh_coordenador: false, coordenador_id: null },
  ],
  equipes: [{ coordenadorId: "coord", nome: "Marcelo", vendedorIds: ["ana"] }],
};

describe("fotos do GRR", () => {
  it("a foto não leva a lista de tickets (nomes de clientes)", () => {
    const dados = { hoje: "2026-11-18", tickets: [{ id: "t1", cliente: "Fulano" }], cartoes: [{ chave: "vendas_semana" }] } as unknown as DadosGrr;
    const foto = paraFoto(dados);
    expect(foto.tickets).toEqual([]);
    expect(foto.cartoes).toHaveLength(1);
    expect(JSON.stringify(foto)).not.toContain("Fulano");
  });

  it("congela a empresa, cada unidade, cada equipe e cada agente", () => {
    const escopos = escoposParaCongelar(CADASTRO);
    expect(escopos.map((e) => `${e.chave.tipo}:${e.chave.ref ?? "-"}`)).toEqual(["empresa:-", "unidade:alt", "unidade:bn", "equipe:coord", "agente:ana", "agente:bia"]);
    expect(escopos[3].escopo.vendedorIds).toEqual(["ana"]);
    expect(escopos[4].escopo.rotulo).toBe("Ana");
  });

  it("o recorte da tela acha a foto certa", () => {
    const direcao = { perfil: "direcao" as const, pop_id: null };
    expect(chaveDoEscopo(resolverEscopo(direcao, null, {}, CADASTRO), "u1")).toEqual({ tipo: "empresa", ref: null });
    expect(chaveDoEscopo(resolverEscopo(direcao, null, { unidade: "bn" }, CADASTRO), "u1")).toEqual({ tipo: "unidade", ref: "bn" });
    expect(chaveDoEscopo(resolverEscopo(direcao, null, { equipe: "coord" }, CADASTRO), "u1")).toEqual({ tipo: "equipe", ref: "coord" });
    expect(chaveDoEscopo(resolverEscopo(direcao, null, { agente: "bia" }, CADASTRO), "u1")).toEqual({ tipo: "agente", ref: "bia" });
    // a coordenação abre a foto da própria equipe pelo id dela
    expect(chaveDoEscopo(resolverEscopo({ perfil: "supervisor", pop_id: "alt" }, ["ana"], {}, CADASTRO), "coord")).toEqual({ tipo: "equipe", ref: "coord" });
  });

  it("congelar de novo abre a versão seguinte e exige o motivo", () => {
    expect(proximaVersao([])).toEqual({ versao: 1, exigeMotivo: false });
    expect(proximaVersao([1, 2])).toEqual({ versao: 3, exigeMotivo: true });
  });
});
