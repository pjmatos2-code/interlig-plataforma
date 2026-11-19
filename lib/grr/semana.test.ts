import { describe, expect, it } from "vitest";
import { resolverSemana, semanasAte, semanasVizinhas } from "./semana";

const HOJE = "2026-11-18"; // quarta-feira

describe("semana do GRR", () => {
  it("abre na semana atual, de segunda a domingo", () => {
    expect(resolverSemana(undefined, HOJE)).toEqual({ inicio: "2026-11-16", fim: "2026-11-22", tipo: "atual" });
    expect(resolverSemana("atual", HOJE).tipo).toBe("atual");
  });

  it("a reunião usa a última semana completa", () => {
    expect(resolverSemana("ultima", HOJE)).toEqual({ inicio: "2026-11-09", fim: "2026-11-15", tipo: "ultima" });
  });

  it("aceita a data de qualquer dia da semana", () => {
    expect(resolverSemana("2026-10-28", HOJE)).toEqual({ inicio: "2026-10-26", fim: "2026-11-01", tipo: "outra" });
    expect(resolverSemana("2026-11-12", HOJE).tipo).toBe("ultima");
  });

  it("data inválida, futura ou anterior aos dados cai na semana atual", () => {
    expect(resolverSemana("ontem", HOJE).tipo).toBe("atual");
    expect(resolverSemana("2026-12-25", HOJE).inicio).toBe("2026-11-16");
    expect(resolverSemana("2025-01-10", HOJE).inicio).toBe("2026-11-16");
  });

  it("lista as últimas semanas, da mais antiga para a mais recente", () => {
    const s = semanasAte({ inicio: "2026-11-16", fim: "2026-11-22" }, 3);
    expect(s.map((x) => x.inicio)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("não navega para depois da semana atual", () => {
    expect(semanasVizinhas({ inicio: "2026-11-16", fim: "2026-11-22" }, HOJE)).toEqual({ anterior: "2026-11-09", proxima: null });
    expect(semanasVizinhas({ inicio: "2026-11-09", fim: "2026-11-15" }, HOJE).proxima).toBe("2026-11-16");
  });
});
