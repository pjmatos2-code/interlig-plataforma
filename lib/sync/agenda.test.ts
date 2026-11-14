import { describe, expect, it } from "vitest";
import {
  cancelamentosNaVez,
  cursorOcorrencias,
  fidelidadeNaVez,
  janelaCancelamentosRecentes,
  meuDiaNaVez,
  noExpediente,
  ocorrenciasNaVez,
  relogioSantarem,
  retencaoNaVez,
  roboComercialNaVez,
  trechoOcorrencias,
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

  it("ocorrências em dia: a cada 1 h no expediente e 3 h fora", () => {
    expect(ocorrenciasNaVez(MANHA, antes(MANHA, HORA - MIN), "2026-10-24")).toBe(false);
    expect(ocorrenciasNaVez(MANHA, antes(MANHA, HORA), "2026-10-24")).toBe(true);
    expect(ocorrenciasNaVez(NOITE, antes(NOITE, 3 * HORA - MIN), "2026-10-24")).toBe(false);
    expect(ocorrenciasNaVez(NOITE, antes(NOITE, 3 * HORA), "2026-10-24")).toBe(true);
  });

  it("ocorrências atrasadas: lê um trecho a cada disparo, mesmo logo depois de uma leitura", () => {
    // cursor em 20/10 (antes dos últimos 3 dias de 24/10) → na vez
    expect(ocorrenciasNaVez(MANHA, antes(MANHA, MIN), "2026-10-20")).toBe(true);
    // cursor em 21/10 = começo da janela normal → segue a cadência
    expect(ocorrenciasNaVez(MANHA, antes(MANHA, MIN), "2026-10-21")).toBe(false);
  });

  it("fidelidade só fora do expediente, com a faixa mais antiga de 20 h ou mais", () => {
    expect(fidelidadeNaVez(MANHA, undefined)).toBe(false);
    expect(fidelidadeNaVez(NOITE, antes(NOITE, 19 * HORA))).toBe(false);
    expect(fidelidadeNaVez(NOITE, antes(NOITE, 20 * HORA))).toBe(true);
    expect(fidelidadeNaVez(NOITE, undefined)).toBe(true);
  });
});

describe("cursor das ocorrências", () => {
  it("usa o cursor gravado, sem passar de hoje nem recuar mais de 60 dias", () => {
    expect(cursorOcorrencias(MANHA, "2026-10-20", undefined)).toBe("2026-10-20");
    expect(cursorOcorrencias(MANHA, "2026-10-30", undefined)).toBe("2026-10-24");
    expect(cursorOcorrencias(MANHA, "2026-01-01", undefined)).toBe("2026-08-25");
  });

  it("sem cursor: véspera do dia da última leitura boa", () => {
    // cenário de 14/11: a última leitura foi em 28/10 às 03:57 de Santarém (06:57 UTC)
    const DIA14 = t("2026-11-14T13:00:00Z");
    expect(cursorOcorrencias(DIA14, undefined, "2026-10-28T06:57:19Z")).toBe("2026-10-27");
    // a véspera usa o dia de Santarém: 01:00 UTC de 19/10 ainda é 18/10 lá
    expect(cursorOcorrencias(MANHA, null, "2026-10-19T01:00:00Z")).toBe("2026-10-17");
  });

  it("sem cursor e sem leitura boa (ou cursor ilegível): últimos 15 dias", () => {
    expect(cursorOcorrencias(MANHA, undefined, undefined)).toBe("2026-10-09");
    expect(cursorOcorrencias(MANHA, "ontem", "nunca")).toBe("2026-10-09");
  });
});

describe("trecho das ocorrências", () => {
  it("em dia: relê os últimos 3 dias e pede até amanhã, porque a data final não entra no SGP", () => {
    expect(trechoOcorrencias(MANHA, "2026-10-24")).toEqual({
      de: "2026-10-21",
      ateExclusivo: "2026-10-25",
      cursorDepois: "2026-10-24",
      chegaHoje: true,
    });
    // 22:00 de 24/10 em Santarém já é 25/10 em UTC: vale o dia de Santarém
    expect(trechoOcorrencias(NOITE, "2026-10-24").ateExclusivo).toBe("2026-10-25");
  });

  it("atrasada: trechos de 7 dias a partir do cursor até alcançar hoje", () => {
    const DIA14 = t("2026-11-14T13:00:00Z");
    const passos: string[] = [];
    let cursor = "2026-10-27";
    for (let i = 0; i < 10; i++) {
      const tr = trechoOcorrencias(DIA14, cursor);
      passos.push(`${tr.de}..${tr.ateExclusivo}`);
      cursor = tr.cursorDepois;
      if (tr.chegaHoje) break;
    }
    expect(passos).toEqual(["2026-10-27..2026-11-03", "2026-11-03..2026-11-10", "2026-11-10..2026-11-15"]);
    expect(cursor).toBe("2026-11-14");
  });

  it("o cursor nunca passa de hoje: o dia de hoje volta a ser lido na próxima vez", () => {
    const tr = trechoOcorrencias(MANHA, "2026-10-22");
    expect(tr).toEqual({ de: "2026-10-21", ateExclusivo: "2026-10-25", cursorDepois: "2026-10-24", chegaHoje: true });
  });
});

describe("cancelamentos recentes (botão da Prevenção)", () => {
  it("lidos ontem ou hoje: últimos 3 dias, com a data final incluída", () => {
    expect(janelaCancelamentosRecentes(MANHA, antes(MANHA, HORA))).toEqual({ de: "2026-10-21", ate: "2026-10-24" });
  });

  it("dias sem ler: desde a véspera da última leitura boa", () => {
    expect(janelaCancelamentosRecentes(MANHA, "2026-10-12T15:00:00Z")).toEqual({ de: "2026-10-11", ate: "2026-10-24" });
  });

  it("nunca antes do 1º dia do mês anterior (a rotina de 6 h relê o resto)", () => {
    expect(janelaCancelamentosRecentes(MANHA, undefined)).toEqual({ de: "2026-09-01", ate: "2026-10-24" });
    expect(janelaCancelamentosRecentes(MANHA, "2026-07-01T12:00:00Z")).toEqual({ de: "2026-09-01", ate: "2026-10-24" });
  });
});
