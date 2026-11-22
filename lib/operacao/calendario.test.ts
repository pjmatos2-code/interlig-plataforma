import { describe, expect, it } from "vitest";
import { gradeDoMes, mesVizinho, posicaoNoCalendario, resolverMes, rotuloMes, tipoDoMotivo } from "./calendario";

describe("calendário", () => {
  const agora = Date.parse("2026-11-21T15:00:00-03:00");
  it("tipo pelo motivo da OS, sem recolhimento e cobrança", () => {
    expect(tipoDoMotivo("Instalação de equipamento")).toBe("instalacao");
    expect(tipoDoMotivo("Mudança Endereço")).toBe("mudanca");
    expect(tipoDoMotivo("LOS")).toBe("suporte");
    for (const m of ["Recolher equipamento do cliente", "Cobrança", "Financeiro", null]) expect(tipoDoMotivo(m)).toBeNull();
    expect(tipoDoMotivo("Atendimento Fortics")).toBe("suporte"); // a leitura confere se foi para o gestor
  });
  it("encerrada é concluída no dia do check-in do técnico, não no dia da baixa", () => {
    expect(posicaoNoCalendario({ status: "Encerrada", agendamento: "2026-11-18T09:00:00-03:00", checkin: "2026-11-18T10:15:00-03:00", encerradaEm: "2026-11-21T16:30:00-03:00" }, agora)).toEqual({
      estado: "concluido", dia: "2026-11-18", quando: "2026-11-18T10:15:00-03:00", vencido: false, fonte: "checkin", baixadaEm: "2026-11-21T16:30:00-03:00",
    });
  });
  it("serviço feito com a OS ainda em execução é concluído no dia do check-in, sem baixa", () => {
    expect(posicaoNoCalendario({ status: "Em execução Online", agendamento: "2026-11-21T08:20:00-03:00", checkin: "2026-11-21T08:42:00-03:00", encerradaEm: null, servicoPrestado: "[21/11, 09:36] Tipo ATIVAÇÃO" }, agora)).toEqual({
      estado: "concluido", dia: "2026-11-21", quando: "2026-11-21T08:42:00-03:00", vencido: false, fonte: "checkin", baixadaEm: null,
    });
    expect(posicaoNoCalendario({ status: "Em execução Online", agendamento: "2026-11-21T08:20:00-03:00", checkin: "2026-11-21T08:42:00-03:00", encerradaEm: null, servicoPrestado: null }, agora)?.estado).toBe("agendado");
  });
  it("sem check-in vale o agendamento; sem os dois, a baixa", () => {
    expect(posicaoNoCalendario({ status: "Encerrada", agendamento: "2026-11-17T08:00:00-03:00", checkin: null, encerradaEm: "2026-11-21T16:30:00-03:00" }, agora)).toMatchObject({ dia: "2026-11-17", fonte: "agendamento" });
    expect(posicaoNoCalendario({ status: "Encerrada", agendamento: null, checkin: null, encerradaEm: "2026-11-21T16:30:00-03:00" }, agora)).toMatchObject({ dia: "2026-11-21", fonte: "baixa" });
  });
  it("aberta com agendamento é agendada; vencida se passou e não está em execução", () => {
    expect(posicaoNoCalendario({ status: "Aberta Online", agendamento: "2026-11-20T09:00:00-03:00", encerradaEm: null }, agora)?.vencido).toBe(true);
    expect(posicaoNoCalendario({ status: "Em execução Online", agendamento: "2026-11-20T09:00:00-03:00", encerradaEm: null }, agora)?.vencido).toBe(false);
    expect(posicaoNoCalendario({ status: "Aberta Online", agendamento: "2026-11-23T08:00:00-03:00", encerradaEm: null }, agora)).toMatchObject({ estado: "agendado", dia: "2026-11-23", vencido: false });
    expect(posicaoNoCalendario({ status: "Aberta Online", agendamento: null, encerradaEm: null }, agora)).toBeNull();
  });
  it("grade de novembro/2026: de 26/10 (segunda) a 06/12 (domingo)", () => {
    const g = gradeDoMes("2026-11");
    expect(g.de).toBe("2026-10-26");
    expect(g.ate).toBe("2026-12-06");
    expect(g.semanas).toHaveLength(6);
    expect(g.semanas[0][0]).toBe("2026-10-26");
  });
  it("mês do parâmetro, vizinhos e rótulo", () => {
    expect(resolverMes("2026-10", "2026-11-21")).toBe("2026-10");
    expect(resolverMes("lixo", "2026-11-21")).toBe("2026-11");
    expect(mesVizinho("2026-12", 1)).toBe("2027-01");
    expect(mesVizinho("2026-01", -1)).toBe("2025-12");
    expect(rotuloMes("2026-11")).toBe("novembro de 2026");
  });
});
