import { describe, expect, it } from "vitest";
import type { CadastroGrr } from "./escopo";
import { escopoDoRecorte, lerRecorte, recortesDePlano, valorDoRecorte } from "./recortes";

const cadastro: CadastroGrr = {
  pops: [{ id: "pop-a", nome: "Altamira" }, { id: "pop-b", nome: "Brasil Novo" }],
  vendedores: [
    { id: "v1", nome: "Ana", pop_id: "pop-a", setor: "comercial_interno", ativo: true, eh_coordenador: false, coordenador_id: null },
    { id: "v2", nome: "Bia", pop_id: "pop-b", setor: "comercial_interno", ativo: true, eh_coordenador: false, coordenador_id: null },
  ],
  equipes: [{ coordenadorId: "u-coord", nome: "Marcelo", vendedorIds: ["v1"] }],
};

describe("recortes de diagnóstico e plano", () => {
  it("coordenação com equipe: a equipe e os agentes dela", () => {
    const r = recortesDePlano({ id: "u-coord", perfil: "supervisor", pop_id: "pop-a" }, cadastro);
    expect(r.map(valorDoRecorte)).toEqual(["equipe:u-coord", "agente:v1"]);
  });
  it("coordenação sem equipe: a unidade e os agentes da unidade", () => {
    const r = recortesDePlano({ id: "u-bn", perfil: "supervisor", pop_id: "pop-b" }, cadastro);
    expect(r.map(valorDoRecorte)).toEqual(["unidade:pop-b", "agente:v2"]);
  });
  it("recorte fora da lista é recusado", () => {
    const r = recortesDePlano({ id: "u-coord", perfil: "supervisor", pop_id: "pop-a" }, cadastro);
    expect(lerRecorte("agente:v2", r)).toBeNull();
    expect(lerRecorte("empresa:", r)).toBeNull();
    expect(lerRecorte("empresa:", recortesDePlano({ id: "d", perfil: "direcao", pop_id: null }, cadastro))?.rotulo).toBe("Empresa");
  });
  it("indicadores do recorte", () => {
    expect(escopoDoRecorte({ tipo: "equipe", ref: "u-coord" }, cadastro).vendedorIds).toEqual(["v1"]);
    expect(escopoDoRecorte({ tipo: "agente", ref: "v2" }, cadastro).agenteId).toBe("v2");
    expect(escopoDoRecorte({ tipo: "empresa", ref: null }, cadastro).nivel).toBe("empresa");
  });
});
