import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { diasDaSemana, mesDeReferencia, rotuloSemana, semanaDe, ultimaSemanaCompleta } from "./periodo";
import { contagemStatus, montarPlacar } from "./placar";
import { foraDasVendas } from "./dados";
import type { DadosRelatorio } from "./tipos";

describe("período do relatório", () => {
  it("a semana do relatório é a última completa, de segunda a domingo", () => {
    for (const hoje of ["2026-11-02", "2026-11-04", "2026-11-08"]) {
      expect(ultimaSemanaCompleta(hoje)).toEqual({ inicio: "2026-10-26", fim: "2026-11-01" });
    }
    expect(ultimaSemanaCompleta("2026-11-09")).toEqual({ inicio: "2026-11-02", fim: "2026-11-08" });
  });
  it("o mês de referência é o da segunda-feira (como no modelo da diretoria)", () => {
    expect(mesDeReferencia(semanaDe("2026-10-26"))).toMatchObject({ mes: "2026-10", nome: "outubro", fechado: true, ate: "2026-10-31" });
    expect(mesDeReferencia(semanaDe("2026-11-02"))).toMatchObject({ mes: "2026-11", fechado: false });
    expect(mesDeReferencia(semanaDe("2026-11-30"))).toMatchObject({ mes: "2026-11", fechado: true });
  });
  it("rótulos da semana e dos dias, com a virada do mês", () => {
    const s = semanaDe("2026-10-26");
    expect(rotuloSemana(s)).toBe("26/10 a 01/11/2026");
    expect(diasDaSemana(s).map((d) => d.rotulo)).toEqual(["Seg 26", "Ter 27", "Qua 28", "Qui 29", "Sex 30", "Sáb 31", "Dom 01/11"]);
  });
  it("semana só começa na segunda", () => {
    expect(() => semanaDe("2026-11-03")).toThrow();
  });
});

describe("Prefeitura e rede neutra ficam fora das vendas do comercial", () => {
  it("pelo nome do cliente e pelo plano", () => {
    expect(foraDasVendas("PREFEITURA MUNICIPAL DE ALTAMIRA", "FIBRA 400MB")).toBe("Prefeitura");
    expect(foraDasVendas("FUNDO MUNICIPAL DE SAUDE", null)).toBe("Prefeitura");
    expect(foraDasVendas("ESCOLA X", "PREF ATM 100MB")).toBe("Prefeitura");
    expect(foraDasVendas("CLIENTE", "REDE NEUTRA NETSKY 1GB")).toBe("rede neutra");
  });
  it("escolas, conselhos escolares e telecomunicações continuam", () => {
    expect(foraDasVendas("CONSELHO ESCOLAR DA ESCOLA MUNICIPAL Y", "FIBRA CORPORATE 200MB")).toBeNull();
    expect(foraDasVendas("ALTANET TELECOMUNICAÇÕES LTDA", "DEDICADO 500MB")).toBeNull();
  });
});

// a semana do modelo aprovado pela diretoria (26/10 a 01/11/2026)
function semanaDoModelo(): Omit<DadosRelatorio, "placar"> {
  const s = semanaDe("2026-10-26");
  const vendasDia = [32, 12, 10, 13, 16, 3, 0];
  return {
    versao: 1,
    leitura: { semana: s, mes: mesDeReferencia(s), mesAnterior: { mes: "2026-09", nome: "setembro" }, lidoEm: "2026-11-02T12:00:00Z" },
    vendas: {
      semana: 86,
      semanaAnterior: 58,
      porDia: diasDaSemana(s).map((d, i) => ({ data: d.data, rotulo: d.rotulo, vendas: vendasDia[i], expediente: i < 6 })),
      metaDiaria: 225 / 27,
      receitaSemana: 9402,
      ticketSemana: 110.61,
      ticketSemanaAnterior: 119.14,
      mes: 262,
      receitaMes: 31540,
      ticketMes: 120.38,
      metaMes: 225,
      diasExpedienteMes: 27,
      diasExpedienteDecorridos: 27,
      mesAnterior: 300,
      receitaMesAnterior: 36000,
      porVendedor: [
        { nome: "Karoline", praca: "Altamira", setor: "interno", vendasSemana: 34, ticketSemana: 113.39, semConsultaSemana: 9, vendasMes: 86, metaMes: 70 },
        { nome: "Damely", praca: "Altamira", setor: "interno", vendasSemana: 27, ticketSemana: 110.38, semConsultaSemana: 12, vendasMes: 88, metaMes: 70 },
        { nome: "Jessica Valentim", praca: "Altamira", setor: "externo", vendasSemana: 19, ticketSemana: 108.78, semConsultaSemana: 19, vendasMes: 51, metaMes: 25 },
        { nome: "Amanda Ribeiro", praca: "Brasil Novo", setor: "interno", vendasSemana: 4, ticketSemana: 99.9, semConsultaSemana: 1, vendasMes: 21, metaMes: 25 },
        { nome: "Aline Santos", praca: "Brasil Novo", setor: "interno", vendasSemana: 0, ticketSemana: null, semConsultaSemana: 0, vendasMes: 0, metaMes: 30 },
        { nome: "Marcelo Otávio", praca: "Altamira", setor: "externo", vendasSemana: 0, ticketSemana: null, semConsultaSemana: 0, vendasMes: 0, metaMes: 25 },
        { nome: "Railson", praca: "Vitória do Xingu", setor: "interno", vendasSemana: 0, ticketSemana: null, semConsultaSemana: 0, vendasMes: 0, metaMes: 30 },
      ],
      semVendedorSemana: 1,
      semVendedorMes: 3,
      semVendedorContratos: ["22990"],
      fora: { semana: [{ contrato: "22973", tipo: "Prefeitura", valor: 2305 }], mes: 2, receitaMes: 2400, mesPorTipo: { Prefeitura: 1, "rede neutra": 1 } },
      porPraca: [{ nome: "Altamira", semana: 69, mes: 214 }],
      mix: [{ nome: "400 MB", semana: 52, mes: 150 }],
      origem: [{ nome: "Outro", semana: 86, mes: 262 }],
    },
    consulta: { vendasSemana: 86, semConsultaSemana: 42, semConsultaMes: 120 },
    assinatura: {
      pendentesSemana: [3, 3, 4, 4, 5, 5, 7].map((idade, i) => ({ contrato: String(23000 + i), vendedor: "Damely", idadeDias: idade })),
      acima48hSemana: 7,
      antigasSemAssinar: 56,
    },
    esteira: { ativacoesSemana: 63, cancelamentosSemana: 20, diasVendaAtivacao: 0.2, aguardandoSemana: 18, paradasMais7Dias: 0, antigasAguardando: 574 },
    base: { ativos: 9214, suspensos: 650, porPraca: [{ nome: "Altamira", ativos: 7481, suspensos: 500 }], fechamento: null, meta: 10000, prazo: "2026-12-31", diasRestantes: 59, faltam: 786, ativosAnterior: null, porPracaAnterior: null },
    debito: { clientes: 592, emRisco: 74790, emAberto: 71289, boletos: 643, contatados7d: 0, faixas: [], anterior: null },
    refidelizacao: [],
    conferir: [],
  };
}

describe("placar da semana", () => {
  it("a semana do modelo dá 5 críticos, 2 em atenção, 2 ok e 1 sem meta", () => {
    const placar = montarPlacar(semanaDoModelo());
    expect(placar).toHaveLength(10);
    const status = Object.fromEntries(placar.map((p) => [p.chave, p.status]));
    expect(status).toEqual({
      vendas_mes: "ok",
      vendas_semana: "ok",
      receita_ticket: "sem_meta",
      consulta: "critico",
      assinatura: "critico",
      time: "critico",
      origem: "critico",
      base: "atencao",
      esteira: "atencao",
      debito: "critico",
    });
    expect(contagemStatus(placar)).toEqual({ ok: 2, atencao: 2, critico: 5, sem_meta: 1 });
  });
  it("mês aberto compara com o esperado até a data, pelos dias de expediente", () => {
    const d = semanaDoModelo();
    d.leitura.mes = { ...d.leitura.mes, fechado: false };
    d.vendas.diasExpedienteDecorridos = 13; // metade do mês
    d.vendas.mes = 100; // esperado ≈ 108: 92% → atenção
    expect(montarPlacar(d).find((p) => p.chave === "vendas_mes")?.status).toBe("atencao");
    d.vendas.mes = 80; // 74% do esperado → crítico
    expect(montarPlacar(d).find((p) => p.chave === "vendas_mes")?.status).toBe("critico");
  });
  it("sem meta cadastrada, vendas do mês e da semana ficam sem meta", () => {
    const d = semanaDoModelo();
    d.vendas.metaMes = null;
    d.vendas.metaDiaria = null;
    const s = Object.fromEntries(montarPlacar(d).map((p) => [p.chave, p.status]));
    expect([s.vendas_mes, s.vendas_semana]).toEqual(["sem_meta", "sem_meta"]);
  });
  it("base: com o relatório anterior, compara a variação com o ritmo necessário", () => {
    const d = semanaDoModelo();
    d.base.ativosAnterior = 9144; // +70 contra ≈ 94 por semana → atenção
    expect(montarPlacar(d).find((p) => p.chave === "base")?.status).toBe("atencao");
    d.base.ativosAnterior = 9100; // +114 → ok
    expect(montarPlacar(d).find((p) => p.chave === "base")?.status).toBe("ok");
    d.base.ativosAnterior = 9300; // caiu → crítico
    expect(montarPlacar(d).find((p) => p.chave === "base")?.status).toBe("critico");
  });
  it("os textos do placar não mostram NaN nem undefined", () => {
    for (const p of montarPlacar(semanaDoModelo())) {
      expect(JSON.stringify(p)).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
