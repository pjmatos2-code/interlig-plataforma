import { describe, expect, it } from "vitest";
import { linhaDeResponsabilidade, recebeuNoPeriodo, responsavelEm } from "./atribuicao";

const ms = (iso: string) => Date.parse(iso);

describe("linha de responsabilidade do lead", () => {
  it("sem reatribuição: dono desde a criação", () => {
    const l = linhaDeResponsabilidade("2026-10-01T10:00:00-03:00", "ana", []);
    expect(l).toEqual([{ vendedorId: "ana", desde: ms("2026-10-01T10:00:00-03:00"), ate: null }]);
  });
  it("troca de vendedor: os dois 'recebem', cada um no seu momento", () => {
    const l = linhaDeResponsabilidade("2026-10-01T10:00:00-03:00", "bia", [{ em: "2026-10-05T09:00:00-03:00", de: "ana", para: "bia" }]);
    expect(l.map((p) => p.vendedorId)).toEqual(["ana", "bia"]);
    expect(recebeuNoPeriodo(l, "ana", ms("2026-10-01T00:00:00-03:00"), ms("2026-10-03T00:00:00-03:00"))).not.toBeNull();
    expect(recebeuNoPeriodo(l, "bia", ms("2026-10-01T00:00:00-03:00"), ms("2026-10-03T00:00:00-03:00"))).toBeNull();
    expect(recebeuNoPeriodo(l, "bia", ms("2026-10-05T00:00:00-03:00"), ms("2026-10-06T00:00:00-03:00"))).not.toBeNull();
    expect(responsavelEm(l, ms("2026-10-04T00:00:00-03:00"))).toBe("ana");
    expect(responsavelEm(l, ms("2026-10-06T00:00:00-03:00"))).toBe("bia");
  });
  it("lead criado sem dono e preenchido depois (robô/monitor): recebe no preenchimento", () => {
    const l = linhaDeResponsabilidade("2026-10-01T10:00:00-03:00", "ana", [{ em: "2026-10-02T08:00:00-03:00", de: null, para: "ana" }]);
    expect(l).toEqual([{ vendedorId: "ana", desde: ms("2026-10-02T08:00:00-03:00"), ate: null }]);
    expect(responsavelEm(l, ms("2026-10-01T12:00:00-03:00"))).toBeNull();
  });
  it("eventos fora de ordem são reordenados", () => {
    const l = linhaDeResponsabilidade("2026-10-01T10:00:00-03:00", "cid", [
      { em: "2026-10-09T09:00:00-03:00", de: "bia", para: "cid" },
      { em: "2026-10-05T09:00:00-03:00", de: "ana", para: "bia" },
    ]);
    expect(l.map((p) => p.vendedorId)).toEqual(["ana", "bia", "cid"]);
  });
  it("devolvido para a fila (sem dono) encerra a responsabilidade", () => {
    const l = linhaDeResponsabilidade("2026-10-01T10:00:00-03:00", null, [{ em: "2026-10-03T09:00:00-03:00", de: "ana", para: null }]);
    expect(l).toEqual([{ vendedorId: "ana", desde: ms("2026-10-01T10:00:00-03:00"), ate: ms("2026-10-03T09:00:00-03:00") }]);
  });
});
