import { describe, expect, it } from "vitest";
import { diasDesde, janelaDeixados, situacaoDeixado } from "./deixados";

describe("deixados para trás", () => {
  const agora = Date.parse("2026-11-21T15:00:00-03:00");
  const base = { assinado: true, osStatus: "Aberta Online", checkin: null, servicoPrestado: null, agendamento: null };
  it("o que trava o cliente", () => {
    expect(situacaoDeixado({ ...base, assinado: false }, agora)).toBe("falta_assinatura");
    expect(situacaoDeixado({ ...base, osStatus: "Encerrada" }, agora)).toBe("os_encerrada");
    expect(situacaoDeixado({ ...base, osStatus: "Pendente Online" }, agora)).toBe("pendente");
    expect(situacaoDeixado({ ...base, osStatus: "Em execução Online", checkin: "2026-11-20T09:00:00-03:00", servicoPrestado: "instalado" }, agora)).toBe("atendido_falta_ativar");
    expect(situacaoDeixado({ ...base, agendamento: "2026-11-23T08:00:00-03:00" }, agora)).toBe("agendado");
    expect(situacaoDeixado({ ...base, agendamento: "2026-11-19T08:00:00-03:00" }, agora)).toBe("agendamento_vencido");
    expect(situacaoDeixado(base, agora)).toBe("sem_agendamento");
  });
  it("janela: as 8 semanas antes da semana de hoje", () => {
    expect(janelaDeixados("2026-11-21")).toEqual({ de: "2026-09-21", ate: "2026-11-15" });
    expect(janelaDeixados("2026-11-23")).toEqual({ de: "2026-09-28", ate: "2026-11-22" });
    expect(diasDesde("2026-11-09", "2026-11-21")).toBe(12);
  });
});
