import { describe, expect, it } from "vitest";
import { limitesDoEixo, montarBaseDaUnidade, variacao, type LinhaBase } from "./base-unidades";

const linha = (mes: string, ativos: number, canceladosMes: number, suspensos: number, acum = 0): LinhaBase => ({
  mes: `${mes}-01`,
  ativos,
  cancelados_mes: canceladosMes,
  cancelados_acum: acum,
  suspensos,
  atualizado_em: `${mes}-28T10:00:00Z`,
});

describe("variacao", () => {
  it("calcula diferença absoluta e percentual sobre o valor anterior", () => {
    expect(variacao(110, 100)).toEqual({ absoluta: 10, percentual: 0.1, direcao: "subiu" });
    expect(variacao(90, 100)).toEqual({ absoluta: -10, percentual: -0.1, direcao: "caiu" });
    expect(variacao(100, 100)).toEqual({ absoluta: 0, percentual: 0, direcao: "igual" });
  });

  it("sem base (anterior zero) não inventa percentual", () => {
    expect(variacao(6, 0)).toEqual({ absoluta: 6, percentual: null, direcao: "subiu" });
    expect(variacao(0, 0)).toEqual({ absoluta: 0, percentual: null, direcao: "igual" });
  });
});

describe("montarBaseDaUnidade", () => {
  const linhas = [
    linha("2026-11", 7464, 145, 561, 5977), // mês em andamento
    linha("2026-10", 7476, 402, 492, 5832),
    linha("2026-09", 7419, 48, 741, 5430),
    linha("2026-08", 7349, 50, 640),
    linha("2026-07", 7225, 45, 551),
    linha("2026-06", 7064, 202, 458),
    linha("2026-05", 6962, 84, 488),
    linha("2026-04", 6851, 130, 416),
  ];
  const base = montarBaseDaUnidade(linhas, "2026-11");

  it("usa só os 6 últimos meses encerrados, em ordem", () => {
    expect(base.indicadores.ativos.pontos.map((p) => p.mes)).toEqual([
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("compara o último mês encerrado com o anterior e com o primeiro da janela", () => {
    expect(base.indicadores.ativos.vsAnterior).toMatchObject({ absoluta: 57, direcao: "subiu" });
    expect(base.indicadores.ativos.janela).toMatchObject({ absoluta: 514, direcao: "subiu" });
    expect(base.indicadores.cancelamentos.vsAnterior).toMatchObject({ absoluta: 354, direcao: "subiu" });
    expect(base.indicadores.suspensos.vsAnterior).toMatchObject({ absoluta: -249, direcao: "caiu" });
  });

  it("deixa o mês em andamento separado, como parcial", () => {
    expect(base.indicadores.ativos.parcial).toEqual({ mes: "2026-11", valor: 7464 });
    expect(base.indicadores.cancelamentos.parcial).toEqual({ mes: "2026-11", valor: 145 });
    expect(base.indicadores.cancelamentos.pontos.at(-1)).toEqual({ mes: "2026-10", valor: 402 });
  });

  it("total em status cancelado vem da leitura mais recente, fora da série", () => {
    expect(base.emStatusCancelado).toBe(5977);
    expect(base.lidoEm).toBe("2026-11-28T10:00:00Z");
  });

  it("com um mês só não há variação; sem linhas não há pontos", () => {
    const um = montarBaseDaUnidade([linha("2026-10", 10, 1, 2)], "2026-11");
    expect(um.indicadores.ativos.vsAnterior).toBeNull();
    expect(um.indicadores.ativos.janela).toBeNull();
    expect(um.indicadores.ativos.parcial).toBeNull();
    const vazio = montarBaseDaUnidade([], "2026-11");
    expect(vazio.indicadores.ativos.pontos).toEqual([]);
    expect(vazio.emStatusCancelado).toBeNull();
  });

  it("cancelamento saindo de zero: diferença absoluta, percentual indisponível", () => {
    const b = montarBaseDaUnidade([linha("2026-09", 1292, 0, 154), linha("2026-10", 1289, 72, 100)], "2026-11");
    expect(b.indicadores.cancelamentos.vsAnterior).toEqual({ absoluta: 72, percentual: null, direcao: "subiu" });
  });
});

describe("limitesDoEixo", () => {
  it("colunas começam em zero", () => {
    expect(limitesDoEixo([45, 402, 84], true)[0]).toBe(0);
    expect(limitesDoEixo([45, 402, 84], true)[1]).toBeGreaterThanOrEqual(402);
  });

  it("linhas usam escala própria que contém todos os valores", () => {
    const [piso, teto] = limitesDoEixo([6962, 7064, 7225, 7349, 7419, 7476], false);
    expect(piso).toBeLessThanOrEqual(6962);
    expect(piso).toBeGreaterThan(0);
    expect(teto).toBeGreaterThanOrEqual(7476);
  });

  it("série constante ou vazia não quebra", () => {
    const [piso, teto] = limitesDoEixo([420, 420], false);
    expect(teto).toBeGreaterThan(piso);
    expect(limitesDoEixo([], false)).toEqual([0, 1]);
  });
});
