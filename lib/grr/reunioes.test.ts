import { describe, expect, it } from "vitest";
import type { CadastroGrr } from "./escopo";
import { compromissosParaConferir, lerParticipantes, participantesSugeridos, podeConduzir, recortesPermitidos, resumoCompromissos, type Compromisso } from "./reunioes";

const cadastro: CadastroGrr = {
  pops: [
    { id: "pop-a", nome: "Altamira" },
    { id: "pop-b", nome: "Brasil Novo" },
  ],
  vendedores: [
    { id: "v1", nome: "Ana", pop_id: "pop-a", setor: "comercial_interno", ativo: true, eh_coordenador: false, coordenador_id: null },
    { id: "v2", nome: "Bia", pop_id: "pop-b", setor: "comercial_interno", ativo: true, eh_coordenador: false, coordenador_id: null },
  ],
  equipes: [{ coordenadorId: "u-coord", nome: "Marcelo", vendedorIds: ["v1"] }],
};
const coord = { id: "u-coord", perfil: "supervisor" as const, pop_id: "pop-a" };
const outro = { id: "u-bn", perfil: "supervisor" as const, pop_id: "pop-b" };
const direcao = { id: "u-dir", perfil: "direcao" as const, pop_id: null };

const comp = (p: Partial<Compromisso>): Compromisso => ({
  id: "c", reuniao_id: "r", tipo: "operacional", agente_id: null, responsavel_nome: null, descricao: "x", prazo: null, situacao: "pendente", aprovacao: "nao_se_aplica", conferido_em: null, criado_em: "2026-11-21", ...p,
});

describe("reuniões do GRR", () => {
  it("coordenação com equipe conduz só a própria equipe; sem equipe, a unidade", () => {
    expect(recortesPermitidos(coord, cadastro)).toEqual([{ tipo: "equipe", ref: "u-coord", rotulo: "Equipe de Marcelo" }]);
    expect(recortesPermitidos(outro, cadastro)).toEqual([{ tipo: "unidade", ref: "pop-b", rotulo: "Unidade Brasil Novo" }]);
    expect(recortesPermitidos({ id: "x", perfil: "vendedora", pop_id: "pop-a" }, cadastro)).toEqual([]);
    expect(recortesPermitidos(direcao, cadastro)).toHaveLength(3);
  });

  it("quem pode conduzir e encerrar", () => {
    expect(podeConduzir(coord, { escopo_tipo: "equipe", escopo_ref: "u-coord" }, cadastro)).toBe(true);
    expect(podeConduzir(outro, { escopo_tipo: "equipe", escopo_ref: "u-coord" }, cadastro)).toBe(false);
    expect(podeConduzir(direcao, { escopo_tipo: "equipe", escopo_ref: "u-coord" }, cadastro)).toBe(true);
  });

  it("participantes sugeridos: coordenação e agentes da equipe", () => {
    expect(participantesSugeridos({ escopo_tipo: "equipe", escopo_ref: "u-coord" }, cadastro).map((p) => [p.nome, p.papel])).toEqual([
      ["Marcelo", "coordenacao"],
      ["Ana", "agente"],
    ]);
  });

  it("participantes do formulário: só os sugeridos marcados e convidados por nome", () => {
    const sug = participantesSugeridos({ escopo_tipo: "equipe", escopo_ref: "u-coord" }, cadastro);
    expect(lerParticipantes(["v1", "intruso"], sug, "Paulo; ").map((p) => p.nome)).toEqual(["Ana", "Paulo"]);
  });

  it("conferência e resumo dos compromissos", () => {
    const lista = [
      comp({ id: "1", situacao: "concluido" }),
      comp({ id: "2", prazo: "2026-11-20" }),
      comp({ id: "3", situacao: "cancelado" }),
      comp({ id: "4", tipo: "gerencial", aprovacao: "aguardando" }),
      comp({ id: "5", tipo: "gerencial", aprovacao: "rejeitado" }),
    ];
    expect(compromissosParaConferir(lista).map((c) => c.id)).toEqual(["1", "2", "4"]);
    expect(resumoCompromissos(lista, "2026-11-21")).toEqual({ total: 4, concluidos: 1, naoFeitos: 0, emAberto: 3, atrasados: 1, aguardandoDiretoria: 1 });
  });
});

import { incluirDecisao, lerAta, lerParticipantesDiretoria, removerDecisao } from "./reunioes";

describe("ata da reunião de resultados", () => {
  it("lê a ata do banco com tipos garantidos", () => {
    const ata = lerAta({ pauta: { indicadores: "  vendas acima  ", estranho: "x" }, decisoes: [{ id: "a", texto: "plantão", responsavel: "Marcelo", prazo: "2026-11-30" }, { id: "b", texto: "" }, { texto: "sem id" }] });
    expect(ata.pauta).toEqual({ indicadores: "vendas acima" });
    expect(ata.decisoes).toEqual([{ id: "a", texto: "plantão", responsavel: "Marcelo", prazo: "2026-11-30" }]);
    expect(lerAta(null)).toEqual({ pauta: {}, decisoes: [] });
  });
  it("inclui e remove decisões", () => {
    let ata = incluirDecisao({ pauta: {}, decisoes: [] }, { texto: " revisar metas ", responsavel: "Paulo", prazo: null }, "d1");
    ata = incluirDecisao(ata, { texto: "   ", responsavel: "", prazo: null }, "d2");
    expect(ata.decisoes.map((d) => [d.id, d.texto])).toEqual([["d1", "revisar metas"]]);
    expect(removerDecisao(ata, "d1").decisoes).toEqual([]);
  });
  it("participantes: diretoria e coordenação marcadas, mais convidados por nome", () => {
    const possiveis = [
      { id: "g", nome: "Paulo", perfil: "gestor" as const },
      { id: "c", nome: "Marcelo", perfil: "supervisor" as const },
    ];
    expect(lerParticipantesDiretoria(["c", "g", "x"], possiveis, "Fulano").map((p) => [p.nome, p.papel])).toEqual([
      ["Paulo", "diretoria"],
      ["Marcelo", "coordenacao"],
      ["Fulano", "convidado"],
    ]);
  });
});
