import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO } from "./config";
import { dentroDoExpediente, segASab, segundosUteis, somarSegundosUteis } from "./expediente";

const EXP = CONFIG_PADRAO.expediente; // seg–sex 8–18, sáb 8–12
const util = (a: string, b: string, dias = segASab) => segundosUteis(a, b, EXP, dias);

describe("segundosUteis — SLA dentro do expediente (Santarém, UTC−3)", () => {
  it("dentro do mesmo turno conta o tempo inteiro", () => {
    // qua 21/10/2026 08:03 → 08:10
    expect(util("2026-10-21T08:03:00-03:00", "2026-10-21T08:10:00-03:00")).toBe(7 * 60);
  });
  it("cliente que chama antes das 8h só começa a contar às 8h", () => {
    // caso real: espera às 07:36:29, 1ª resposta às 08:03:57
    expect(util("2026-10-21T07:36:29-03:00", "2026-10-21T08:03:57-03:00")).toBe(3 * 60 + 57);
  });
  it("noite não conta: 17:50 → 08:10 do dia seguinte = 20 min", () => {
    expect(util("2026-10-21T17:50:00-03:00", "2026-10-22T08:10:00-03:00")).toBe(20 * 60);
  });
  it("sábado vai até 12h e domingo não conta", () => {
    // sáb 24/10 11:50 → seg 26/10 08:05 = 10 min (sáb) + 5 min (seg)
    expect(util("2026-10-24T11:50:00-03:00", "2026-10-26T08:05:00-03:00")).toBe(15 * 60);
  });
  it("feriado do calendário não conta", () => {
    const semFeriado = (d: string) => segASab(d) && d !== "2026-11-02";
    // sex 30/10 17:00 → ter 03/11 09:00: 1h (sex) + 4h (sáb) + 0 (seg feriado) + 1h (ter)
    expect(util("2026-10-30T17:00:00-03:00", "2026-11-03T09:00:00-03:00", semFeriado)).toBe(6 * 3600);
  });
  it("fim antes do início ou datas inválidas dão zero", () => {
    expect(util("2026-10-21T10:00:00-03:00", "2026-10-21T09:00:00-03:00")).toBe(0);
    expect(util("xx", "2026-10-21T09:00:00-03:00")).toBe(0);
  });
  it("aceita instantes em UTC (Z)", () => {
    // 11:00Z = 08:00 Santarém
    expect(util("2026-10-21T11:00:00Z", "2026-10-21T11:30:00Z")).toBe(30 * 60);
  });
});

describe("dentroDoExpediente e somarSegundosUteis", () => {
  it("reconhece horário comercial", () => {
    expect(dentroDoExpediente("2026-10-21T09:00:00-03:00", EXP, segASab)).toBe(true);
    expect(dentroDoExpediente("2026-10-21T19:00:00-03:00", EXP, segASab)).toBe(false);
    expect(dentroDoExpediente("2026-10-25T09:00:00-03:00", EXP, segASab)).toBe(false); // domingo
  });
  it("prazo de 15 min úteis pedido às 17:55 vence às 08:10 do dia seguinte", () => {
    expect(somarSegundosUteis("2026-10-21T17:55:00-03:00", 15 * 60, EXP, segASab)).toBe("2026-10-22T11:10:00.000Z");
  });
  it("prazo pedido no domingo começa a correr na segunda às 8h", () => {
    expect(somarSegundosUteis("2026-10-25T10:00:00-03:00", 30 * 60, EXP, segASab)).toBe("2026-10-26T11:30:00.000Z");
  });
});
