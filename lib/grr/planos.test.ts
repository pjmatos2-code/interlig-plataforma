import { describe, expect, it } from "vitest";
import { atrasada, contarPlanos, desviosSemDiagnostico, diagnosticosAtuais, precisaAvisoDePrazo, proximaVersaoDiagnostico, situacaoExibida, situacoesPermitidas, type Diagnostico, type Plano } from "./planos";

const plano = (p: Partial<Plano>): Plano => ({
  id: "p", indicador: "conversao", problema: null, periodo_inicio: "2026-11-16", escopo_tipo: "equipe", escopo_ref: "u", escopo_rotulo: "x", diagnostico_id: null, reuniao_id: null,
  descricao: "d", resultado_esperado: null, responsavel_id: null, responsavel_nome: "Marcelo", prazo: null, situacao: "pendente", aprovacao: "aguardando", aprovacao_justificativa: null,
  aprovacao_por: null, aprovacao_em: null, criado_em: "", criado_por: null, atualizado_em: "", ...p,
});
const diag = (p: Partial<Diagnostico>): Diagnostico => ({
  id: "d", periodo_inicio: "2026-11-16", periodo_fim: "2026-11-22", indicador: "conversao", escopo_tipo: "equipe", escopo_ref: "u", escopo_rotulo: "x", versao: 1, causa: "c",
  evidencias: null, providencias: null, solucao: null, situacao_indicador: "critico", valor: null, meta: null, criado_em: "", criado_por: null, ...p,
});
const HOJE = "2026-11-19";

describe("planos de ação", () => {
  it("atrasada é calculada e passa por cima de pendente e em andamento", () => {
    expect(atrasada(plano({ prazo: "2026-11-18" }), HOJE)).toBe(true);
    expect(atrasada(plano({ prazo: "2026-11-18", situacao: "aguardando_validacao" }), HOJE)).toBe(false);
    expect(situacaoExibida(plano({ prazo: "2026-11-19", situacao: "em_andamento" }), HOJE)).toBe("em_andamento");
  });

  it("contagem separa aprovação de execução e deixa os rejeitados fora", () => {
    const c = contarPlanos(
      [plano({ prazo: "2026-11-01" }), plano({ situacao: "concluida", aprovacao: "aprovado" }), plano({ aprovacao: "rejeitado" }), plano({ situacao: "aguardando_validacao", aprovacao: "aprovado" })],
      HOJE
    );
    expect(c).toMatchObject({ atrasada: 1, concluida: 1, aguardando_validacao: 1, aguardandoAprovacao: 1, total: 3 });
  });

  it("validar (concluir) é da diretoria; a coordenação leva até aguardando validação", () => {
    expect(situacoesPermitidas("supervisor", plano({ aprovacao: "aprovado" }))).toEqual(["pendente", "em_andamento", "aguardando_validacao"]);
    expect(situacoesPermitidas("direcao", plano({}))).toContain("concluida");
    expect(situacoesPermitidas("supervisor", plano({ situacao: "concluida" }))).toEqual([]);
  });

  it("diagnóstico que vale é a última versão; desvios sem diagnóstico", () => {
    const atuais = diagnosticosAtuais([diag({ id: "a", versao: 1 }), diag({ id: "b", versao: 2 }), diag({ id: "c", indicador: "ticket" })]);
    expect(atuais.map((d) => d.id).sort()).toEqual(["b", "c"]);
    expect(desviosSemDiagnostico([{ chave: "conversao", status: "critico" }, { chave: "leads", status: "atencao" }, { chave: "vendas_semana", status: "ok" }], atuais)).toEqual(["leads"]);
    expect(proximaVersaoDiagnostico([1, 2])).toBe(3);
    expect(proximaVersaoDiagnostico([])).toBe(1);
  });

  it("aviso de prazo: vence amanhã ou já venceu, uma vez por dia", () => {
    const amanha = "2026-11-20";
    expect(precisaAvisoDePrazo({ ...plano({ prazo: "2026-11-20" }), aviso_prazo_em: null }, HOJE, amanha)).toBe(true);
    expect(precisaAvisoDePrazo({ ...plano({ prazo: "2026-11-25" }), aviso_prazo_em: null }, HOJE, amanha)).toBe(false);
    expect(precisaAvisoDePrazo({ ...plano({ prazo: "2026-11-10" }), aviso_prazo_em: HOJE }, HOJE, amanha)).toBe(false);
    expect(precisaAvisoDePrazo({ ...plano({ prazo: "2026-11-10", situacao: "concluida" }), aviso_prazo_em: null }, HOJE, amanha)).toBe(false);
  });
});
