import { describe, expect, it } from "vitest";
import type { CartaoGrr, DadosGrr } from "./montar";
import { alertasDoResumo, destaquesDoResumo, paraPainel, situacaoDosIndicadores, tabelaDeIndicadores, textoAtingimento } from "./painel";

const cartao = (p: Partial<CartaoGrr> & Pick<CartaoGrr, "chave" | "grupo">): CartaoGrr => ({
  rotulo: p.chave,
  valor: String(p.numero ?? "—"),
  numero: null,
  meta: null,
  contexto: null,
  evolucao: null,
  status: "sem_meta",
  ...p,
});
const vendas = { metaSemana: 55.6, metaMes: 225 } as DadosGrr["vendas"];
const dados = (cartoes: CartaoGrr[]) => ({ cartoes, vendas }) as unknown as DadosGrr;

describe("painel do GRR", () => {
  it("atingimento só com meta positiva e maior é melhor", () => {
    expect(paraPainel(cartao({ chave: "vendas_semana", grupo: "vendas", numero: 43, metaNumero: 56 }), { vendas }).atingimento).toBeCloseTo(43 / 56);
    // menor é melhor: sem percentual
    const paradas = paraPainel(cartao({ chave: "instalacoes_paradas", grupo: "ativacoes", numero: 34, metaNumero: 0 }), { vendas });
    expect(paradas.atingimento).toBeNull();
    expect(paradas.menorEMelhor).toBe(true);
    // sem meta: sem percentual
    expect(paraPainel(cartao({ chave: "ativacoes_semana", grupo: "ativacoes", numero: 18 }), { vendas }).atingimento).toBeNull();
  });

  it("foto antiga sem metaNumero usa a meta de vendas guardada", () => {
    const c = paraPainel(cartao({ chave: "vendas_semana", grupo: "vendas", numero: 50 }), { vendas });
    expect(c.metaNumero).toBe(56);
    expect(paraPainel(cartao({ chave: "vendas_mes", grupo: "vendas", numero: 100 }), { vendas }).metaNumero).toBe(225);
  });

  it("destaques na ordem vendas, ativações, conversão, receita", () => {
    const d = dados([
      cartao({ chave: "receita", grupo: "receita" }),
      cartao({ chave: "conversao", grupo: "conversao" }),
      cartao({ chave: "vendas_semana", grupo: "vendas" }),
      cartao({ chave: "ativacoes_semana", grupo: "ativacoes" }),
      cartao({ chave: "leads", grupo: "conversao" }),
    ]);
    expect(destaquesDoResumo(d).map((c) => c.chave)).toEqual(["vendas_semana", "ativacoes_semana", "conversao", "receita"]);
  });

  it("sem meta não conta como bom", () => {
    const s = situacaoDosIndicadores([
      cartao({ chave: "a", grupo: "vendas", status: "ok" }),
      cartao({ chave: "b", grupo: "vendas", status: "sem_meta" }),
      cartao({ chave: "c", grupo: "vendas", status: "critico" }),
      cartao({ chave: "d", grupo: "vendas", status: "atencao" }),
    ]);
    expect(s).toEqual({ ok: 1, atencao: 1, critico: 1, semMeta: 1, total: 4 });
  });

  it("tabela traz os oito grupos, inclusive os das próximas etapas", () => {
    const t = tabelaDeIndicadores(dados([cartao({ chave: "vendas_semana", grupo: "vendas" })]));
    expect(t).toHaveLength(8);
    expect(t.find((g) => g.grupo === "inadimplencia")?.linhas).toEqual([]);
  });

  it("alertas: críticos primeiro, sem os que estão bem ou sem meta", () => {
    const a = alertasDoResumo(
      dados([
        cartao({ chave: "x", grupo: "vendas", status: "atencao", valor: "2" }),
        cartao({ chave: "y", grupo: "ativacoes", status: "critico", valor: "34", meta: "meta 0" }),
        cartao({ chave: "z", grupo: "vendas", status: "ok" }),
        cartao({ chave: "w", grupo: "vendas", status: "sem_meta" }),
      ])
    );
    expect(a.map((x) => x.nivel)).toEqual(["critico", "atencao"]);
    expect(a[0].titulo).toBe("y: 34 (meta 0)");
  });

  it("texto do atingimento", () => {
    expect(textoAtingimento(0.764)).toBe("76%");
    expect(textoAtingimento(null)).toBe("—");
  });
});
