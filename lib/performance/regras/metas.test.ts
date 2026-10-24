import { describe, expect, it } from "vitest";
import { avaliarMeta, contarDiasUteis, fimDoMes, inicioDaSemana, janelaDaMeta, membroDaMeta, projetarFechamento, valorMetaParaComparar } from "./metas";

// seg–sex úteis; 12/10/2026 (segunda) é feriado
const util = (d: string) => {
  const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5 && d !== "2026-10-12";
};

describe("janelas das metas", () => {
  it("semana começa na segunda e mês termina no último dia", () => {
    expect(inicioDaSemana("2026-10-24")).toBe("2026-10-19"); // sábado → segunda 19
    expect(inicioDaSemana("2026-10-19")).toBe("2026-10-19");
    expect(inicioDaSemana("2026-10-25")).toBe("2026-10-19"); // domingo ainda é a mesma semana
    expect(fimDoMes("2026-02-10")).toBe("2026-02-28");
    expect(fimDoMes("2026-10-24")).toBe("2026-10-31");
  });
  it("ciclo mensal vigente vai do dia 1 até a referência", () => {
    expect(janelaDaMeta({ periodicidade: "mes", inicio: "2026-10-01", fim: "2026-12-31" }, "2026-10-24")).toEqual({ situacao: "vigente", de: "2026-10-01", ate: "2026-10-24", fimCiclo: "2026-10-31" });
  });
  it("vigência recorta o ciclo (meta que começa no meio do mês)", () => {
    expect(janelaDaMeta({ periodicidade: "mes", inicio: "2026-10-15", fim: "2026-10-31" }, "2026-10-24").de).toBe("2026-10-15");
  });
  it("meta encerrada mostra o último ciclo dela; futura não apura", () => {
    expect(janelaDaMeta({ periodicidade: "semana", inicio: "2026-09-01", fim: "2026-09-30" }, "2026-10-24")).toEqual({ situacao: "encerrada", de: "2026-09-28", ate: "2026-09-30", fimCiclo: "2026-09-30" });
    expect(janelaDaMeta({ periodicidade: "dia", inicio: "2026-11-02", fim: "2026-11-30" }, "2026-10-24").situacao).toBe("futura");
  });
});

describe("dias úteis e projeção (estimativa)", () => {
  it("conta só dias úteis disponíveis (feriado e férias saem)", () => {
    expect(contarDiasUteis("2026-10-01", "2026-10-31", util)).toBe(21);
    expect(contarDiasUteis("2026-10-01", "2026-10-31", util, (d) => d >= "2026-10-26" && d <= "2026-10-30")).toBe(16);
  });
  it("ritmo dos dias encerrados × dias que faltam depois de hoje", () => {
    // 10 vendas em 15 dias encerrados, mais 1 hoje; faltam 5 dias depois de hoje → 11 + 10/15 × 5
    expect(projetarFechamento({ realizado: 11, realizadoEncerrado: 10, diasEncerrados: 15, diasRestantesDepois: 5 })).toBe(14.3);
  });
  it("com menos de 3 dias úteis encerrados não projeta", () => {
    expect(projetarFechamento({ realizado: 2, realizadoEncerrado: 2, diasEncerrados: 2, diasRestantesDepois: 19 })).toBeNull();
  });
});

describe("avaliarMeta", () => {
  const base = { aditiva: true, cicloEncerrado: false, diasRestantes: 5 };
  it("atingida, no ritmo, abaixo do ritmo", () => {
    expect(avaliarMeta({ ...base, meta: 20, realizado: 21, projecao: 25 }).situacao).toBe("atingida");
    expect(avaliarMeta({ ...base, meta: 20, realizado: 15, projecao: 20.5 }).situacao).toBe("no_ritmo");
    const r = avaliarMeta({ ...base, meta: 20, realizado: 10, projecao: 14 });
    expect(r.situacao).toBe("abaixo_do_ritmo");
    expect(r.necessarioPorDia).toBe(2);
    expect(r.pct).toBe(0.5);
  });
  it("ciclo encerrado sem bater = não atingida", () => {
    expect(avaliarMeta({ ...base, cicloEncerrado: true, meta: 20, realizado: 18, projecao: null }).situacao).toBe("nao_atingida");
  });
  it("tempo de resposta: menor é melhor", () => {
    expect(avaliarMeta({ ...base, aditiva: false, menorEhMelhor: true, meta: 15, realizado: 12, projecao: null }).situacao).toBe("atingida");
    const r = avaliarMeta({ ...base, aditiva: false, menorEhMelhor: true, meta: 15, realizado: 30, projecao: null });
    expect(r.situacao).toBe("abaixo");
    expect(r.pct).toBe(0.5);
  });
  it("sem dado não vira zero", () => {
    expect(avaliarMeta({ ...base, meta: 20, realizado: null, projecao: null }).situacao).toBe("sem_dados");
  });
});

describe("alcance e unidade da meta", () => {
  const v = { id: "v1", pop_id: "p1", coordenador_id: "c1", setor: "comercial_interno" };
  it("cada escopo alcança só quem deve", () => {
    expect(membroDaMeta({ escopo: "global", referencia: null }, v)).toBe(true);
    expect(membroDaMeta({ escopo: "unidade", referencia: "p2" }, v)).toBe(false);
    expect(membroDaMeta({ escopo: "equipe", referencia: "c1" }, v)).toBe(true);
    expect(membroDaMeta({ escopo: "funcao", referencia: "comercial_externo" }, v)).toBe(false);
    expect(membroDaMeta({ escopo: "vendedor", referencia: "v1" }, v)).toBe(true);
  });
  it("conversão é digitada em % e comparada como fração", () => {
    expect(valorMetaParaComparar("conversao", 30)).toBe(0.3);
    expect(valorMetaParaComparar("vendas", 30)).toBe(30);
  });
});
