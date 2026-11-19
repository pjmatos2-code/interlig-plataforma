import { describe, expect, it } from "vitest";
import { indicadorPorChave } from "./catalogo";
import { aplicarConfig, formatarValorDoIndicador, metaVigente, numeroBr, statusPorFaixa, validarMeta, type ConfigGrr, type MetaGrr } from "./config";
import type { CartaoGrr } from "./montar";

const conversao = indicadorPorChave("conversao_safra")!;
const leads = indicadorPorChave("leads")!;
const perdidos = indicadorPorChave("perdidos")!;
let n = 0;
const meta = (extra: Partial<MetaGrr>): MetaGrr => ({
  id: `m${++n}`,
  indicador: "conversao_safra",
  escopo_tipo: "empresa",
  escopo_ref: null,
  vigente_desde: "2026-11-02",
  meta: 0.35,
  limite_atencao: 0.28,
  observacao: null,
  criado_em: `2026-11-01T12:00:${String(n).padStart(2, "0")}Z`,
  criado_por: null,
  ...extra,
});
const EMPRESA = { tipo: "empresa" as const, ref: null };

describe("meta que vale num dia e num recorte", () => {
  it("vale a linha mais recente que já começou", () => {
    const metas = [meta({}), meta({ vigente_desde: "2026-11-16", meta: 0.4, limite_atencao: 0.3 }), meta({ vigente_desde: "2026-12-07", meta: 0.5, limite_atencao: 0.4 })];
    expect(metaVigente(metas, conversao, EMPRESA, "2026-11-10")?.meta).toBe(0.35);
    expect(metaVigente(metas, conversao, EMPRESA, "2026-11-18")?.meta).toBe(0.4);
    expect(metaVigente(metas, conversao, EMPRESA, "2026-10-26")).toBeNull();
  });

  it("duas linhas com o mesmo início: vale a incluída por último, e a primeira fica no histórico", () => {
    const metas = [meta({ meta: 0.35 }), meta({ meta: 0.38, limite_atencao: 0.3 })];
    expect(metaVigente(metas, conversao, EMPRESA, "2026-11-10")?.meta).toBe(0.38);
    expect(metas).toHaveLength(2);
  });

  it("linha sem meta encerra a meta a partir daquela data", () => {
    const metas = [meta({}), meta({ vigente_desde: "2026-11-16", meta: null, limite_atencao: null })];
    expect(metaVigente(metas, conversao, EMPRESA, "2026-11-10")?.meta).toBe(0.35);
    expect(metaVigente(metas, conversao, EMPRESA, "2026-11-18")).toBeNull();
  });

  it("taxa herda a meta da empresa; a meta do próprio recorte vence", () => {
    const metas = [meta({}), meta({ escopo_tipo: "unidade", escopo_ref: "bn", meta: 0.5, limite_atencao: 0.4 })];
    expect(metaVigente(metas, conversao, { tipo: "agente", ref: "ana" }, "2026-11-10")?.meta).toBe(0.35);
    expect(metaVigente(metas, conversao, { tipo: "unidade", ref: "bn" }, "2026-11-10")?.meta).toBe(0.5);
    expect(metaVigente(metas, conversao, { tipo: "unidade", ref: "alt" }, "2026-11-10")?.meta).toBe(0.35);
  });

  it("volume não herda: a meta de leads da empresa não vale para um agente", () => {
    const metas = [meta({ indicador: "leads", meta: 200, limite_atencao: 170 })];
    expect(metaVigente(metas, leads, EMPRESA, "2026-11-10")?.meta).toBe(200);
    expect(metaVigente(metas, leads, { tipo: "agente", ref: "ana" }, "2026-11-10")).toBeNull();
  });
});

describe("farol pela faixa", () => {
  it("maior é melhor", () => {
    expect(statusPorFaixa(0.36, 0.35, 0.28, "maior_melhor")).toBe("ok");
    expect(statusPorFaixa(0.3, 0.35, 0.28, "maior_melhor")).toBe("atencao");
    expect(statusPorFaixa(0.2, 0.35, 0.28, "maior_melhor")).toBe("critico");
  });

  it("menor é melhor", () => {
    expect(statusPorFaixa(40, 50, 70, "menor_melhor")).toBe("ok");
    expect(statusPorFaixa(60, 50, 70, "menor_melhor")).toBe("atencao");
    expect(statusPorFaixa(90, 50, 70, "menor_melhor")).toBe("critico");
  });

  it("sem valor não há farol", () => {
    expect(statusPorFaixa(null, 0.35, 0.28, "maior_melhor")).toBe("sem_meta");
  });
});

describe("validação da meta", () => {
  it("o limite de atenção fica do lado ruim da meta", () => {
    expect(validarMeta(conversao, 0.35, 0.28)).toBeNull();
    expect(validarMeta(conversao, 0.35, 0.4)).toContain("abaixo da meta");
    expect(validarMeta(perdidos, 50, 70)).toBeNull();
    expect(validarMeta(perdidos, 50, 30)).toContain("acima da meta");
  });

  it("recusa negativo, percentual acima de 100 e texto", () => {
    expect(validarMeta(leads, -1, 0)).not.toBeNull();
    expect(validarMeta(conversao, 1.2, 0.5)).toContain("0 a 100");
    expect(validarMeta(leads, Number.NaN, 1)).not.toBeNull();
  });
});

const cartao = (chave: string, numero: number | null, extra: Partial<CartaoGrr> = {}): CartaoGrr => ({
  chave,
  grupo: "conversao",
  rotulo: chave,
  valor: String(numero),
  numero,
  meta: null,
  contexto: null,
  evolucao: null,
  status: "sem_meta",
  ...extra,
});

describe("configuração aplicada aos cartões", () => {
  const config: ConfigGrr = {
    disponivel: true,
    indicadores: [
      { chave: "conversao_safra", ativo: true, dono: "Diretoria comercial" },
      { chave: "leads", ativo: false, dono: null },
      { chave: "vendas_semana", ativo: true, dono: null },
    ],
    metas: [meta({}), meta({ indicador: "vendas_semana", meta: 999, limite_atencao: 1 })],
  };
  const cartoes = [cartao("conversao_safra", 0.31), cartao("leads", 190), cartao("vendas_semana", 67, { meta: "meta 56", status: "ok" }), cartao("ticket", 110)];

  it("põe meta, farol e dono; tira o indicador desligado", () => {
    const r = aplicarConfig(cartoes, config, EMPRESA, "2026-11-10");
    expect(r.map((c) => c.chave)).toEqual(["conversao_safra", "vendas_semana", "ticket"]);
    expect(r[0]).toMatchObject({ meta: "meta 35%", status: "atencao", dono: "Diretoria comercial" });
  });

  it("indicador com regra da plataforma não muda, mesmo que alguém grave meta para ele", () => {
    const r = aplicarConfig(cartoes, config, EMPRESA, "2026-11-10");
    expect(r[1]).toMatchObject({ meta: "meta 56", status: "ok" });
  });

  it("sem as tabelas do GRR o painel fica como estava", () => {
    expect(aplicarConfig(cartoes, { disponivel: false, indicadores: [], metas: [] }, EMPRESA, "2026-11-10")).toBe(cartoes);
  });
});

describe("números digitados e exibidos", () => {
  it("lê número em português", () => {
    expect(numeroBr("1.234,5")).toBe(1234.5);
    expect(numeroBr("35")).toBe(35);
    expect(numeroBr(" 35 % ")).toBe(35);
    expect(numeroBr("R$ 120,90")).toBe(120.9);
    expect(numeroBr("")).toBeNull();
    expect(numeroBr("abc")).toBeNull();
  });

  it("mostra a meta na unidade do indicador", () => {
    expect(formatarValorDoIndicador(0.35, "percentual")).toBe("35%");
    expect(formatarValorDoIndicador(7500, "moeda")).toBe("R$ 7.500");
    expect(formatarValorDoIndicador(119.9, "moeda")).toBe("R$ 119,90");
    expect(formatarValorDoIndicador(200, "numero")).toBe("200");
  });
});
