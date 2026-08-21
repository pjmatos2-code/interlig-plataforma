import { describe, expect, it } from "vitest";
import {
  calcularComissao,
  encontrarDegrau,
  simularMaisVendas,
  proximoDegrau,
  type DegrauComissao,
  type GatilhoComissao,
  type VendaComissao,
} from "./comissao";

// regra do seed: 3 degraus + 2 gatilhos (PRD seção 6)
const DEGRAUS: DegrauComissao[] = [
  { atingimento_min: 0, atingimento_max: 79, tipo: "valor_por_venda", valor: 25, bonus_fixo: 0 },
  { atingimento_min: 80, atingimento_max: 99, tipo: "valor_por_venda", valor: 40, bonus_fixo: 0 },
  { atingimento_min: 100, atingimento_max: null, tipo: "valor_por_venda", valor: 55, bonus_fixo: 300 },
];
const GATILHOS: GatilhoComissao[] = [
  { condicao: "ticket_medio_min", valor: 110, adicional: 150 },
  { condicao: "plano_premium", plano: "Fibra 1 Giga", adicional: 20 },
];

const venda = (valor: number, plano: string | null = null, estornada = false): VendaComissao => ({
  valor_mensalidade: valor,
  plano,
  estornada,
});
const pendente = (valor: number): VendaComissao => ({
  valor_mensalidade: valor,
  plano: null,
  estornada: false,
  liberada: false,
});

describe("degraus por atingimento", () => {
  it("seleciona pelo % da meta, inclusive nas bordas", () => {
    expect(encontrarDegrau(DEGRAUS, 0)!.valor).toBe(25);
    expect(encontrarDegrau(DEGRAUS, 79)!.valor).toBe(25);
    expect(encontrarDegrau(DEGRAUS, 80)!.valor).toBe(40);
    expect(encontrarDegrau(DEGRAUS, 99.9)!.valor).toBe(40);
    expect(encontrarDegrau(DEGRAUS, 100)!.valor).toBe(55);
    expect(encontrarDegrau(DEGRAUS, 150)!.valor).toBe(55);
  });
});

describe("cálculo da comissão", () => {
  it("degrau baixo: valor por venda simples", () => {
    // meta 20, 10 vendas = 50% → R$ 25/venda
    const r = calcularComissao({
      vendas: Array.from({ length: 10 }, () => venda(90)),
      metaMensal: 20,
      degraus: DEGRAUS,
      gatilhos: GATILHOS,
    });
    expect(r.atingimentoPct).toBe(50);
    expect(r.valorBase).toBe(250);
    expect(r.total).toBe(250);
  });

  it("meta batida: degrau cheio + bônus fixo", () => {
    // meta 10, 10 vendas = 100% → 10×55 + 300
    const r = calcularComissao({
      vendas: Array.from({ length: 10 }, () => venda(90)),
      metaMensal: 10,
      degraus: DEGRAUS,
      gatilhos: GATILHOS,
    });
    expect(r.valorBase).toBe(550);
    expect(r.bonusFixo).toBe(300);
    expect(r.total).toBe(850);
  });

  it("gatilho de ticket médio soma uma vez; premium soma por venda", () => {
    // 5 vendas de 120 (ticket 120 ≥ 110 → +150) sendo 2 do 1 Giga (+20 cada)
    const vendas = [
      venda(120, "Fibra 1 Giga"),
      venda(120, "Fibra 1 Giga"),
      venda(120),
      venda(120),
      venda(120),
    ];
    const r = calcularComissao({ vendas, metaMensal: 10, degraus: DEGRAUS, gatilhos: GATILHOS });
    expect(r.gatilhos).toHaveLength(2);
    expect(r.gatilhos.reduce((s, g) => s + g.adicional, 0)).toBe(150 + 40);
    expect(r.total).toBe(5 * 25 + 190);
  });

  it("estorno: venda estornada sai da base, do atingimento e da receita", () => {
    // 10 vendas, 2 estornadas → 8 válidas; meta 10 → 80% → R$ 40/venda
    const vendas = [
      ...Array.from({ length: 8 }, () => venda(90)),
      venda(90, null, true),
      venda(90, null, true),
    ];
    const r = calcularComissao({ vendas, metaMensal: 10, degraus: DEGRAUS, gatilhos: GATILHOS });
    expect(r.estornos).toBe(2);
    expect(r.vendasComissionaveis).toBe(8);
    expect(r.atingimentoPct).toBe(80);
    expect(r.valorBase).toBe(8 * 40);
  });

  it("percentual da receita", () => {
    const r = calcularComissao({
      vendas: [venda(100), venda(200)],
      metaMensal: 10,
      degraus: [{ atingimento_min: 0, atingimento_max: null, tipo: "percentual_receita", valor: 10 }],
      gatilhos: [],
    });
    expect(r.valorBase).toBeCloseTo(30);
  });
});

describe("simulador (PRD 3.7)", () => {
  const base = {
    vendas: Array.from({ length: 7 }, () => venda(100)),
    metaMensal: 10,
    degraus: DEGRAUS,
    gatilhos: [] as GatilhoComissao[],
  };

  it("mais N vendas pode trocar de degrau e recalcular tudo", () => {
    // 7/10 = 70% (25/venda). +1 → 8/10 = 80% (40/venda): 8×40 = 320
    const r = simularMaisVendas(base, 1);
    expect(r.atual.total).toBe(175);
    expect(r.simulado.total).toBe(320);
    expect(r.delta).toBe(145);
  });

  it("próximo degrau: quantas faltam e quanto passa a valer", () => {
    const p = proximoDegrau(base)!;
    expect(p.faltamVendas).toBe(1); // 80% de 10 = 8 vendas
    expect(p.degrau.atingimento_min).toBe(80);
    expect(p.totalLa).toBe(320);
  });

  it("no último degrau não há próximo", () => {
    expect(
      proximoDegrau({ ...base, vendas: Array.from({ length: 12 }, () => venda(100)) })
    ).toBeNull();
  });
});

describe("comissão pendente (assinaturas/ativação)", () => {
  it("venda pendente PONTUA a meta mas não entra na comissão", () => {
    // meta 10: 8 liberadas + 2 pendentes → atingimento 100% (degrau 55 + bônus 300)
    // mas a base paga só considera as 8 liberadas
    const vendas = [
      ...Array.from({ length: 8 }, () => venda(100)),
      pendente(100),
      pendente(100),
    ];
    const r = calcularComissao({ vendas, metaMensal: 10, degraus: DEGRAUS, gatilhos: [] });
    expect(r.atingimentoPct).toBe(100);
    expect(r.vendasComissionaveis).toBe(8);
    expect(r.vendasPendentes).toBe(2);
    expect(r.valorBase).toBe(8 * 55);
    expect(r.total).toBe(8 * 55 + 300);
    expect(r.totalSeLiberar).toBe(10 * 55 + 300);
  });

  it("percentual da receita: receita pendente fica fora", () => {
    const vendas = [venda(100), pendente(200)];
    const r = calcularComissao({
      vendas,
      metaMensal: 2,
      degraus: [{ atingimento_min: 0, atingimento_max: null, tipo: "percentual_receita", valor: 10 }],
      gatilhos: [],
    });
    expect(r.valorBase).toBeCloseTo(10);
    expect(r.totalSeLiberar).toBeCloseTo(30);
  });

  it("estornada não pontua nem libera; pendente pontua", () => {
    const vendas = [venda(100), pendente(100), venda(100, null, true)];
    const r = calcularComissao({ vendas, metaMensal: 10, degraus: DEGRAUS, gatilhos: [] });
    expect(r.estornos).toBe(1);
    expect(r.vendasPendentes).toBe(1);
    expect(r.atingimentoPct).toBe(20); // 2 válidas de meta 10
  });
});
