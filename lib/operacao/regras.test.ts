import { describe, expect, it } from "vitest";
import { colunaDa, compararCartoes, diaSantarem, ehCorporativo, fatiaAtualizar, intervaloPeriodo, noPeriodo, tempoDesde, tipoServico, type CartaoOrdenavel } from "./regras";

describe("tipoServico", () => {
  it("separa instalação, mudança de endereço e suporte", () => {
    expect(tipoServico("Operacional - Instalação equipamento")).toBe("instalacao");
    expect(tipoServico("Suporte - Mudança de Endereço")).toBe("mudanca");
    expect(tipoServico("Suporte - Link Loss")).toBe("suporte");
    expect(tipoServico("Suporte - Luz Alta - Cliente")).toBe("suporte");
    expect(tipoServico("Infraestrutura - Rompimento")).toBe("suporte");
    expect(tipoServico("Chamado Fortics")).toBe("suporte");
  });
  it("deixa fora recolhimento, cobrança, financeiro e cancelamento", () => {
    for (const t of ["Recolhimento", "Cancelamento Contrato", "Cobrança - Título em atraso", "Financeiro", "Financeiro - Outros", "Promessa de pagamento via URA", null, ""]) {
      expect(tipoServico(t)).toBeNull();
    }
  });
});

describe("colunaDa", () => {
  it("ocorrência encerrada vai para Encerrada, mesmo com OS aberta", () => {
    expect(colunaDa({ status: "Encerrada" }, { status: "Aberta Online", agendamento: null })).toBe("encerrada");
  });
  it("OS encerrada com ocorrência aberta é Falta validar", () => {
    expect(colunaDa({ status: "Em execução Online" }, { status: "Encerrada", agendamento: "2026-11-20T09:00:00-03:00" })).toBe("validar");
  });
  it("execução pela OS ou pela própria ocorrência", () => {
    expect(colunaDa({ status: "Aberta Online" }, { status: "Em execução Offline", agendamento: null })).toBe("execucao");
    expect(colunaDa({ status: "Em execução" }, null)).toBe("execucao");
  });
  it("OS com agendamento é Agendada; sem OS ou sem data é Aberta", () => {
    expect(colunaDa({ status: "Aberta Offline" }, { status: "Aberta Offline", agendamento: "2026-11-22T08:00:00-03:00" })).toBe("agendada");
    expect(colunaDa({ status: "Aberta Offline" }, { status: "Pendente Online", agendamento: null })).toBe("aberta");
    expect(colunaDa({ status: "Aberta" }, undefined)).toBe("aberta");
  });
});

describe("ehCorporativo", () => {
  it("CNPJ, plano corporativo pelo nome ou pela marca do cadastro", () => {
    expect(ehCorporativo("12.345.678/0001-90", "300 MEGA")).toBe(true);
    expect(ehCorporativo("123.456.789-01", "LINK DEDICADO 100")).toBe(true);
    expect(ehCorporativo("123.456.789-01", "300 MEGA", true)).toBe(true);
    expect(ehCorporativo("123.456.789-01", "300 MEGA")).toBe(false);
    expect(ehCorporativo(null, null)).toBe(false);
  });
});

describe("compararCartoes", () => {
  const c = (p: Partial<CartaoOrdenavel>): CartaoOrdenavel => ({ coluna: "aberta", corporativo: false, criadaEm: "2026-11-10T10:00:00Z", agendamento: null, encerradaEm: null, ...p });
  it("corporativo primeiro, depois o mais antigo", () => {
    const lista = [c({ criadaEm: "2026-11-01T10:00:00Z" }), c({ corporativo: true, criadaEm: "2026-11-15T10:00:00Z" }), c({ criadaEm: "2026-10-30T10:00:00Z" })];
    expect(lista.sort(compararCartoes).map((x) => x.criadaEm)).toEqual(["2026-11-15T10:00:00Z", "2026-10-30T10:00:00Z", "2026-11-01T10:00:00Z"]);
  });
  it("agendada pela agenda; encerrada mais recente no topo", () => {
    const ag = [c({ coluna: "agendada", agendamento: "2026-11-22T14:00:00Z" }), c({ coluna: "agendada", agendamento: "2026-11-22T08:00:00Z" })];
    expect(ag.sort(compararCartoes)[0].agendamento).toBe("2026-11-22T08:00:00Z");
    const enc = [c({ coluna: "encerrada", encerradaEm: "2026-11-18T10:00:00Z" }), c({ coluna: "encerrada", encerradaEm: "2026-11-20T10:00:00Z", corporativo: false })];
    expect(enc.sort(compararCartoes)[0].encerradaEm).toBe("2026-11-20T10:00:00Z");
  });
});

describe("tempoDesde", () => {
  const agora = Date.parse("2026-11-21T12:00:00Z");
  it("minutos, horas e dias", () => {
    expect(tempoDesde("2026-11-21T11:20:00Z", agora)).toBe("40 min");
    expect(tempoDesde("2026-11-21T07:00:00Z", agora)).toBe("5 h");
    expect(tempoDesde("2026-11-18T08:00:00Z", agora)).toBe("3 d 4 h");
    expect(tempoDesde("2026-11-19T12:00:00Z", agora)).toBe("2 d");
    expect(tempoDesde(null, agora)).toBe("—");
  });
});

describe("período", () => {
  it("dia em Santarém", () => {
    expect(diaSantarem("2026-11-22T02:30:00Z")).toBe("2026-11-21");
    expect(diaSantarem(null)).toBeNull();
  });
  it("intervalos", () => {
    const hoje = "2026-11-21"; // sábado
    expect(intervaloPeriodo("hoje", hoje)).toEqual({ de: hoje, ate: hoje });
    expect(intervaloPeriodo("semana", hoje)).toEqual({ de: "2026-11-16", ate: "2026-11-22" });
    expect(intervaloPeriodo("semana", "2026-11-22")).toEqual({ de: "2026-11-16", ate: "2026-11-22" }); // domingo
    expect(intervaloPeriodo("semana", "2026-11-23")).toEqual({ de: "2026-11-23", ate: "2026-11-29" });
    expect(intervaloPeriodo("7d", hoje)).toEqual({ de: "2026-11-15", ate: hoje });
    expect(intervaloPeriodo("mes", hoje)).toEqual({ de: "2026-11-01", ate: hoje });
    expect(intervaloPeriodo("30d", hoje)).toEqual({ de: "2026-10-22", ate: hoje });
    expect(intervaloPeriodo("personalizado", hoje, { de: "2026-11-20", ate: "2026-11-10" })).toEqual({ de: "2026-11-10", ate: "2026-11-20" });
  });
  it("cartão no período, por abertura ou agendamento", () => {
    const c = { criadaEm: "2026-11-18T13:00:00Z", agendamento: "2026-11-21T11:00:00Z" };
    const sem = { de: "2026-11-21", ate: "2026-11-21" };
    expect(noPeriodo(c, "abertura", sem)).toBe(false);
    expect(noPeriodo(c, "agendamento", sem)).toBe(true);
    expect(noPeriodo({ ...c, agendamento: null }, "agendamento", sem)).toBe(false);
  });
  it("fatias do botão cobrem os 31 dias sem buraco", () => {
    expect([0, 1, 2, 3].map((i) => fatiaAtualizar("2026-11-21", i))).toEqual([
      { de: "2026-11-12", ateExclusivo: "2026-11-22" },
      { de: "2026-11-02", ateExclusivo: "2026-11-12" },
      { de: "2026-10-21", ateExclusivo: "2026-11-02" },
      null,
    ]);
  });
});
