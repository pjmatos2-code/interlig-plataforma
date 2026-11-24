import { describe, expect, it } from "vitest";
import type { VendedorGrr } from "./escopo";
import { mesesAnteriores, montarPanorama, type ContratoPanorama } from "./panorama";

const pops = [{ id: "a", nome: "Altamira" }, { id: "v", nome: "Vitória do Xingu" }];
const vend = (id: string, pop: string, x: Partial<VendedorGrr> = {}): VendedorGrr => ({ id, nome: id, pop_id: pop, setor: "comercial_interno", ativo: true, eh_coordenador: false, coordenador_id: null, ...x });
const venda = (data: string, vendedor: string | null, pop = "a", valor = 100, x: Partial<ContratoPanorama> = {}): ContratoPanorama => ({
  data_venda: data, data_assinatura: null, data_ativacao: null, data_cancelamento: null, motivo_cancelamento: null, status: "ativo", valor_mensalidade: valor, vendedor_id: vendedor, pop_id: pop, fora: null, ...x,
});
const n = (q: number, mes: string, vendedor: string | null, pop = "a", valor = 100) => Array.from({ length: q }, (_, i) => venda(`${mes}-${String((i % 20) + 1).padStart(2, "0")}`, vendedor, pop, valor));
const montar = (contratos: ContratoPanorama[], x: Partial<Parameters<typeof montarPanorama>[0]> = {}) =>
  montarPanorama({ mes: "2026-11", hoje: "2026-11-20", contratos, metas: [{ escopo: "vendedora", referencia_id: "ana", quantidade_vendas: 30 }, { escopo: "pop", referencia_id: "v", quantidade_vendas: 10 }], vendedores: [vend("ana", "a"), vend("bia", "v"), vend("chefe", "a", { eh_coordenador: true })], pops, ehUtil: () => true, popId: null, ...x });

describe("panorama do mês", () => {
  it("compara os seis meses fechados antes do mês, virando o ano", () => {
    expect(mesesAnteriores("2026-03", 6)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("projeta pela regra 5.6 e separa unidade e agente", () => {
    const p = montar([...n(20, "2026-11", "ana"), ...n(2, "2026-11", "bia", "v")]);
    const ana = p.agentes.find((l) => l.id === "ana")!;
    // 1 por dia em 20 dias: 20 + 10 dias restantes
    expect(ana.projecao).toBeCloseTo(30);
    expect(ana.farol).toBe("verde");
    expect(p.empresa.meta).toBe(40);
    const v = p.unidades.find((u) => u.id === "v")!;
    expect(v.farol).toBe("vermelho");
    expect(v.falta).toBe(8);
    expect(v.precisaPorDia).toBeCloseTo(8 / 11);
    expect(p.unidades.reduce((s, u) => s + u.vendas, 0)).toBe(p.empresa.vendas);
  });

  it("a soma dos agentes com os outros fecha com a empresa", () => {
    const p = montar([...n(5, "2026-11", "ana"), ...n(3, "2026-11", null), ...n(2, "2026-11", "chefe")]);
    expect(p.agentes.reduce((s, l) => s + l.vendas, 0) + p.outros.vendas).toBe(p.empresa.vendas);
    expect(p.empresa.semAgente).toBe(3);
    expect(p.pontos.some((x) => x.nome === "Vendas sem agente")).toBe(true);
  });

  it("a média do agente começa no primeiro mês com venda; a da unidade usa os seis", () => {
    const p = montar([...n(10, "2026-09", "ana"), ...n(20, "2026-11", "ana")]);
    const ana = p.agentes.find((l) => l.id === "ana")!;
    expect(ana.serie.map((s) => s.vendas)).toEqual([null, null, null, null, 10, 0]);
    expect(ana.mediaVendas).toBe(5);
    expect(p.unidades[0].mediaVendas).toBeCloseTo(10 / 6);
  });

  it("acende queda de produtividade, sequência de queda e ticket baixo", () => {
    const p = montar([...n(60, "2026-08", "ana"), ...n(50, "2026-09", "ana"), ...n(45, "2026-10", "ana"), ...n(20, "2026-11", "ana", "a", 80)]);
    const x = p.pontos.find((y) => y.alvo === "agente" && y.nome === "ana")!;
    expect(x.nivel).toBe("critico");
    expect(x.motivos.join(" ")).toMatch(/produtividade .* abaixo/);
    expect(x.motivos.join(" ")).toMatch(/3 meses seguidos em queda/);
    expect(x.motivos.join(" ")).toMatch(/ticket médio 20% abaixo/);
  });

  it("mês fechado usa o realizado e deixa prefeitura e rede neutra de fora", () => {
    const p = montar([...n(12, "2026-11", "ana"), venda("2026-11-05", "ana", "a", 500, { fora: "Prefeitura" })], { hoje: "2026-12-01" });
    expect(p.fechado).toBe(true);
    expect(p.empresa.vendas).toBe(12);
    expect(p.empresa.projecao).toBe(12);
    expect(p.corte).toBe("2026-11-30");
    expect(p.diasUteis.restantes).toBe(0);
  });

  it("no recorte de unidade, só a unidade e os agentes dela", () => {
    const p = montar([...n(5, "2026-11", "ana"), ...n(2, "2026-11", "bia", "v")], { popId: "v" });
    expect(p.empresa.vendas).toBe(2);
    expect(p.unidades).toHaveLength(1);
    expect(p.agentes.map((l) => l.id)).toEqual(["bia"]);
  });
});
