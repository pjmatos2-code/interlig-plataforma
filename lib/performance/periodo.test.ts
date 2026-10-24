import { describe, expect, it } from "vitest";
import { limitesMs, resolverPeriodoPerf } from "./periodo";

const HOJE = "2026-10-24"; // sábado

describe("resolverPeriodoPerf — filtros e comparativo equivalente", () => {
  it("mês atual compara com o mesmo intervalo do mês passado", () => {
    const p = resolverPeriodoPerf({}, HOJE);
    expect([p.preset, p.de, p.ate, p.deAnterior, p.ateAnterior]).toEqual(["mes", "2026-10-01", "2026-10-24", "2026-09-01", "2026-09-24"]);
  });
  it("31 de março compara com o fim de fevereiro sem estourar", () => {
    const p = resolverPeriodoPerf({ periodo: "mes" }, "2027-03-31");
    expect(p.ateAnterior).toBe("2027-02-28");
  });
  it("hoje/ontem comparam com o dia anterior", () => {
    expect(resolverPeriodoPerf({ periodo: "hoje" }, HOJE)).toMatchObject({ de: HOJE, ate: HOJE, deAnterior: "2026-10-23" });
    expect(resolverPeriodoPerf({ periodo: "ontem" }, HOJE)).toMatchObject({ de: "2026-10-23", ate: "2026-10-23", deAnterior: "2026-10-22" });
  });
  it("7 e 30 dias contam hoje e comparam com a janela imediatamente anterior", () => {
    expect(resolverPeriodoPerf({ periodo: "7d" }, HOJE)).toMatchObject({ de: "2026-10-18", ate: HOJE, deAnterior: "2026-10-11", ateAnterior: "2026-10-17", dias: 7 });
    expect(resolverPeriodoPerf({ periodo: "30d" }, HOJE)).toMatchObject({ de: "2026-09-25", dias: 30, ateAnterior: "2026-09-24" });
  });
  it("mês anterior compara com o retrasado", () => {
    expect(resolverPeriodoPerf({ periodo: "mes_anterior" }, HOJE)).toMatchObject({ de: "2026-09-01", ate: "2026-09-30", deAnterior: "2026-08-01", ateAnterior: "2026-08-31" });
  });
  it("personalizado: inverte datas trocadas, não passa de hoje e limita a 1 ano", () => {
    expect(resolverPeriodoPerf({ periodo: "personalizado", de: "2026-10-10", ate: "2026-10-01" }, HOJE)).toMatchObject({ de: "2026-10-01", ate: "2026-10-10", deAnterior: "2026-09-21", ateAnterior: "2026-09-30" });
    expect(resolverPeriodoPerf({ periodo: "personalizado", de: "2026-10-20", ate: "2026-12-31" }, HOJE).ate).toBe(HOJE);
    expect(resolverPeriodoPerf({ periodo: "personalizado", de: "2020-01-01", ate: "2026-10-24" }, HOJE).dias).toBe(366);
  });
  it("preset desconhecido cai no mês atual", () => {
    expect(resolverPeriodoPerf({ periodo: "xyz" }, HOJE).preset).toBe("mes");
  });
  it("limites em ms cobrem o dia inteiro de Santarém", () => {
    const [a, b] = limitesMs("2026-10-24", "2026-10-24");
    expect(new Date(a).toISOString()).toBe("2026-10-24T03:00:00.000Z");
    expect(new Date(b).toISOString()).toBe("2026-10-25T02:59:59.999Z");
  });
});
