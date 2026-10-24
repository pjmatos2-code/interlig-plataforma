import { describe, expect, it } from "vitest";
import { avaliarFollowup, fimDoDiaSantarem, pontuarPrioridade, type FollowupAvaliavel } from "./followups";

const OPTS = { tolerancia: "fim_do_dia" as const, carenciaMin: 5 };
// retorno agendado na terça 20/10 às 10h para quarta 21/10 às 15h (Santarém)
const F: FollowupAvaliavel = { status: "programado", prazo: "2026-10-21T15:00:00-03:00", criadoEm: "2026-10-20T10:00:00-03:00" };
const at = (em: string, fonte = "mensagem do vendedor no chat") => ({ em, fonte });

describe("avaliarFollowup — taxa de execução de follow-up", () => {
  it("ação humana até o fim do dia do prazo = concluído no prazo", () => {
    const r = avaliarFollowup(F, [at("2026-10-21T17:30:00-03:00")], null, "2026-10-22T09:00:00-03:00", OPTS);
    expect(r.status).toBe("concluido_prazo");
    expect(r.evidencia).toBe("mensagem do vendedor no chat");
  });
  it("com tolerância 'horário exato', 17:30 já é atraso", () => {
    const r = avaliarFollowup(F, [at("2026-10-21T17:30:00-03:00")], null, "2026-10-22T09:00:00-03:00", { ...OPTS, tolerancia: "horario_exato" });
    expect(r.status).toBe("concluido_atraso");
  });
  it("ação no dia seguinte = concluído com atraso", () => {
    expect(avaliarFollowup(F, [at("2026-10-22T08:10:00-03:00")], null, "2026-10-22T09:00:00-03:00", OPTS).status).toBe("concluido_atraso");
  });
  it("a própria conversa em que agendou (dentro da carência) não conta", () => {
    expect(avaliarFollowup(F, [at("2026-10-20T10:02:00-03:00")], null, "2026-10-20T12:00:00-03:00", OPTS).status).toBe("programado");
  });
  it("vence hoje → pendente; passou do dia sem ação → vencido", () => {
    expect(avaliarFollowup(F, [], null, "2026-10-21T09:00:00-03:00", OPTS).status).toBe("pendente");
    expect(avaliarFollowup(F, [], null, "2026-10-22T00:30:00-03:00", OPTS).status).toBe("vencido");
  });
  it("lead fechado antes do prazo sem ação → cancelado (sai do denominador)", () => {
    expect(avaliarFollowup(F, [], "2026-10-21T11:00:00-03:00", "2026-10-23T09:00:00-03:00", OPTS).status).toBe("cancelado");
  });
  it("marcado como feito à mão vale mais que a detecção", () => {
    const r = avaliarFollowup({ ...F, concluidoManualEm: "2026-10-21T14:00:00-03:00" }, [at("2026-10-22T10:00:00-03:00")], null, "2026-10-23T09:00:00-03:00", OPTS);
    expect(r.status).toBe("concluido_prazo");
    expect(r.evidencia).toBe("marcado como feito");
  });
  it("sugestão da IA e rejeitada não mudam sozinhas", () => {
    expect(avaliarFollowup({ ...F, status: "sugerido" }, [at("2026-10-21T10:00:00-03:00")], null, "2026-10-25T09:00:00-03:00", OPTS).status).toBe("sugerido");
    expect(avaliarFollowup({ ...F, status: "rejeitado" }, [], null, "2026-10-25T09:00:00-03:00", OPTS).status).toBe("rejeitado");
  });
  it("atividades fora de ordem: vale a primeira cronológica", () => {
    const r = avaliarFollowup(F, [at("2026-10-22T10:00:00-03:00", "tratativa"), at("2026-10-21T09:00:00-03:00", "proposta")], null, "2026-10-23T00:00:00-03:00", OPTS);
    expect(r.status).toBe("concluido_prazo");
    expect(r.evidencia).toBe("proposta");
  });
  it("fim do dia em Santarém mesmo com prazo informado em UTC", () => {
    expect(new Date(fimDoDiaSantarem("2026-10-22T01:00:00Z")).toISOString()).toBe("2026-10-22T02:59:59.999Z"); // 21/10 23:59:59.999 local
  });
});

describe("pontuarPrioridade — fila inteligente", () => {
  const base = { intencaoCompra: false, temperatura: null, urgenciaAlta: false, horasSemInteracao: 2, vencidoHoras: 0, etapa: "em_atendimento", valorEstimado: null, prioridadeDeclarada: "media" as const };
  it("intenção de compra e cliente quente passam na frente", () => {
    expect(pontuarPrioridade({ ...base, intencaoCompra: true, temperatura: "quente" })).toBeGreaterThan(pontuarPrioridade({ ...base, vencidoHoras: 10 }));
  });
  it("vencido pesa mais que programado", () => {
    expect(pontuarPrioridade({ ...base, vencidoHoras: 5 })).toBeGreaterThan(pontuarPrioridade(base));
  });
});
