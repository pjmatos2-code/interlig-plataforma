import { describe, expect, it } from "vitest";
import { colunaDa, compararCartoes, ehCorporativo, tempoDesde, tipoServico, type CartaoOrdenavel } from "./regras";

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
