import { describe, expect, it } from "vitest";
import { conferirTecnico, type MedidasConferencia } from "./conferencia";

const base: MedidasConferencia = {
  agora: Date.parse("2026-11-24T13:00:00Z"),
  noExpediente: true,
  ultimaLeituraOperacao: "2026-11-24T12:50:00Z",
  ultimaLeituraOperacaoOk: true,
  direcionamentoPendentes: 0,
  ativadasSemana: 40,
  ativadasSemHora: 4,
  osEncerradas7d: 300,
  osSemTecnico7d: 20,
  ativadasDesde21: 30,
  ativadasDesde21SemHora: 0,
  indicadoresComMeta: 9,
  totalIndicadores: 9,
  fotoUltimaSemana: true,
  semanaUltima: "16/11 a 22/11",
  segundaJaPassouDas7: true,
};
const nivel = (m: MedidasConferencia, chave: string) => conferirTecnico(m).find((i) => i.chave === chave)!.nivel;

describe("conferência do setor técnico", () => {
  it("tudo em ordem", () => {
    expect(conferirTecnico(base).every((i) => i.nivel === "ok")).toBe(true);
  });
  it("leitura velha e com erro", () => {
    expect(nivel({ ...base, ultimaLeituraOperacao: "2026-11-24T11:00:00Z" }, "leitura")).toBe("atencao");
    expect(nivel({ ...base, ultimaLeituraOperacaoOk: false }, "leitura")).toBe("problema");
    expect(nivel({ ...base, ultimaLeituraOperacao: null }, "leitura")).toBe("problema");
  });
  it("técnico vazio nas OS: atenção acima de 10%, problema acima de 25%", () => {
    expect(nivel({ ...base, osSemTecnico7d: 45 }, "tecnico")).toBe("atencao");
    expect(nivel({ ...base, osSemTecnico7d: 150 }, "tecnico")).toBe("problema");
  });
  it("fechamento que não aconteceu depois de segunda 07:00", () => {
    expect(nivel({ ...base, fotoUltimaSemana: false }, "fechamento")).toBe("problema");
    expect(nivel({ ...base, fotoUltimaSemana: false, segundaJaPassouDas7: false }, "fechamento")).toBe("ok");
  });
  it("metas faltando e instalações sem hora", () => {
    expect(nivel({ ...base, indicadoresComMeta: 7 }, "metas")).toBe("atencao");
    expect(nivel({ ...base, ativadasSemHora: 30 }, "cobertura_48h")).toBe("atencao");
  });
});
