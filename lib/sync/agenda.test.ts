import { describe, expect, it } from "vitest";
import {
  cancelamentosNaVez,
  fidelidadeNaVez,
  janelaOcorrencias,
  meuDiaNaVez,
  noExpediente,
  ocorrenciasNaVez,
  relogioSantarem,
  retencaoNaVez,
  roboComercialNaVez,
} from "./agenda";

const t = (iso: string) => Date.parse(iso);
const MIN = 60_000;
const HORA = 60 * MIN;
const antes = (agora: number, ms: number) => new Date(agora - ms).toISOString();

// 24/10/2026 09:05 em Santarém (UTC−3) — expediente
const MANHA = t("2026-10-24T12:05:00Z");
// 24/10/2026 22:00 em Santarém — fora do expediente, já é 25/10 em UTC
const NOITE = t("2026-10-25T01:00:00Z");

describe("relógio de Santarém", () => {
  it("converte hora e data para UTC−3, inclusive na virada do dia UTC", () => {
    expect(relogioSantarem(MANHA)).toEqual({ hora: 9, minuto: 5, dia: "2026-10-24" });
    expect(relogioSantarem(NOITE)).toEqual({ hora: 22, minuto: 0, dia: "2026-10-24" });
  });

  it("expediente é de 07h00 a 19h59", () => {
    expect(noExpediente(t("2026-10-24T09:59:00Z"))).toBe(false); // 06:59
    expect(noExpediente(t("2026-10-24T10:00:00Z"))).toBe(true); // 07:00
    expect(noExpediente(t("2026-10-24T22:59:00Z"))).toBe(true); // 19:59
    expect(noExpediente(t("2026-10-24T23:00:00Z"))).toBe(false); // 20:00
  });
});

describe("robô comercial", () => {
  it("roda no expediente quando a última rodada tem 9 min ou mais", () => {
    expect(roboComercialNaVez(MANHA, antes(MANHA, 9 * MIN))).toBe(true);
    expect(roboComercialNaVez(MANHA, antes(MANHA, 8 * MIN))).toBe(false);
  });

  it("nunca rodou (ou carimbo ilegível) conta como na vez", () => {
    expect(roboComercialNaVez(MANHA, undefined)).toBe(true);
    expect(roboComercialNaVez(MANHA, "lixo")).toBe(true);
  });

  it("fora do expediente não roda", () => {
    expect(roboComercialNaVez(NOITE, undefined)).toBe(false);
  });

  it("cenário de 24/10: última rodada boa ontem às 17:52 → roda agora", () => {
    expect(roboComercialNaVez(MANHA, "2026-10-23T20:52:41Z")).toBe(true);
  });
});

describe("robô de retenção", () => {
  it("~9 min no expediente", () => {
    expect(retencaoNaVez(MANHA, antes(MANHA, 9 * MIN))).toBe(true);
    expect(retencaoNaVez(MANHA, antes(MANHA, 8 * MIN))).toBe(false);
  });

  it("~28 min fora do expediente", () => {
    expect(retencaoNaVez(NOITE, antes(NOITE, 20 * MIN))).toBe(false);
    expect(retencaoNaVez(NOITE, antes(NOITE, 28 * MIN))).toBe(true);
  });
});

describe("Meu Dia", () => {
  it("uma vez por dia, a partir das 00h05", () => {
    expect(meuDiaNaVez(t("2026-10-24T03:04:00Z"), false)).toBe(false); // 00:04
    expect(meuDiaNaVez(t("2026-10-24T03:05:00Z"), false)).toBe(true); // 00:05
    expect(meuDiaNaVez(MANHA, true)).toBe(false);
  });
});

describe("relatórios do SGP", () => {
  it("cancelamentos a cada 6 h desde o último sucesso", () => {
    expect(cancelamentosNaVez(MANHA, antes(MANHA, 6 * HORA - MIN))).toBe(false);
    expect(cancelamentosNaVez(MANHA, antes(MANHA, 6 * HORA))).toBe(true);
    expect(cancelamentosNaVez(MANHA, undefined)).toBe(true);
  });

  it("ocorrências a cada 3 h desde o último sucesso", () => {
    expect(ocorrenciasNaVez(MANHA, antes(MANHA, 3 * HORA - MIN))).toBe(false);
    expect(ocorrenciasNaVez(MANHA, antes(MANHA, 3 * HORA))).toBe(true);
  });

  it("fidelidade só fora do expediente, com a faixa mais antiga de 20 h ou mais", () => {
    expect(fidelidadeNaVez(MANHA, undefined)).toBe(false);
    expect(fidelidadeNaVez(NOITE, antes(NOITE, 19 * HORA))).toBe(false);
    expect(fidelidadeNaVez(NOITE, antes(NOITE, 20 * HORA))).toBe(true);
    expect(fidelidadeNaVez(NOITE, undefined)).toBe(true);
  });
});

describe("janela das ocorrências", () => {
  it("leitura em dia: últimos 3 dias até hoje (data de Santarém)", () => {
    expect(janelaOcorrencias(MANHA, antes(MANHA, HORA))).toEqual({ de: "2026-10-21", ate: "2026-10-24" });
    expect(janelaOcorrencias(NOITE, antes(NOITE, HORA))).toEqual({ de: "2026-10-21", ate: "2026-10-24" });
  });

  it("dias sem rodar: recua até a véspera da última leitura boa", () => {
    // última leitura boa em 18/10 → relê desde 17/10
    expect(janelaOcorrencias(MANHA, "2026-10-18T15:00:00Z")).toEqual({ de: "2026-10-17", ate: "2026-10-24" });
  });

  it("nunca leu pelo cron, ou leitura muito velha: teto de 15 dias", () => {
    // cenário de 24/10: a carga manual foi em 10/10 e o cron nunca rodou
    expect(janelaOcorrencias(MANHA, undefined)).toEqual({ de: "2026-10-09", ate: "2026-10-24" });
    expect(janelaOcorrencias(MANHA, "2026-09-01T12:00:00Z")).toEqual({ de: "2026-10-09", ate: "2026-10-24" });
  });
});
