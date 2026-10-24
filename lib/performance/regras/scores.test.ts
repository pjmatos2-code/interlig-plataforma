import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, mesclarConfig, pesosDoSetor } from "../config";
import { combinar, mediana, notaInversa, notaLinear, percentil, razao } from "./normalizacao";
import { calcularEsforco, calcularIpc, calcularQualidade, calcularResultado, type EntradasEsforco } from "./scores";

const cfg = CONFIG_PADRAO;
const pesos = pesosDoSetor(cfg, "comercial_interno");

describe("normalização 0–100", () => {
  it("linear: piso = 0, alvo = 100, meio proporcional, acima do alvo trava em 100", () => {
    const f = { piso: 0.5, alvo: 0.9 };
    expect(notaLinear(0.5, f)).toBe(0);
    expect(notaLinear(0.7, f)).toBe(50);
    expect(notaLinear(0.9, f)).toBe(100);
    expect(notaLinear(1.2, f)).toBe(100);
    expect(notaLinear(0.1, f)).toBe(0);
  });
  it("inversa (menor é melhor): até o alvo 100, no máximo 0", () => {
    const l = { alvo: 0.05, maximo: 0.25 };
    expect(notaInversa(0.02, l)).toBe(100);
    expect(notaInversa(0.15, l)).toBe(50);
    expect(notaInversa(0.3, l)).toBe(0);
  });
  it("estatística: mediana, percentil e razão sem denominador", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeNull();
    expect(percentil([10, 20, 30, 40, 50], 90)).toBe(46);
    expect(razao(3, 0)).toBeNull();
  });
});

describe("combinar — redistribuição de pesos", () => {
  it("só itens aplicáveis entram; o peso dos indisponíveis é redistribuído", () => {
    const s = combinar([
      { chave: "a", rotulo: "A", peso: 20, nota: 100 },
      { chave: "b", rotulo: "B", peso: 20, nota: 50 },
      { chave: "c", rotulo: "C", peso: 60, nota: null, motivo: "nao_aplicavel" },
    ]);
    expect(s.valor).toBe(75); // (100×20 + 50×20) / 40
    expect(s.cobertura).toBe(0.4);
    expect(s.composicao.find((i) => i.chave === "a")!.pesoEfetivo).toBe(50);
    expect(s.composicao.find((i) => i.chave === "c")!.motivo).toBe("nao_aplicavel");
  });
  it("nenhum item com dado → score indisponível (não zero)", () => {
    const s = combinar([{ chave: "a", rotulo: "A", peso: 10, nota: null }]);
    expect(s.valor).toBeNull();
    expect(s.provisorio).toBe(true);
  });
  it("cobertura baixa ou essencial faltando marca provisório", () => {
    expect(combinar([{ chave: "a", rotulo: "A", peso: 10, nota: 80 }, { chave: "b", rotulo: "B", peso: 90, nota: null }]).provisorio).toBe(true);
    expect(combinar([{ chave: "a", rotulo: "A", peso: 50, nota: 80 }, { chave: "b", rotulo: "B", peso: 50, nota: null }], { essenciais: ["b"] }).provisorio).toBe(true);
  });
  it("peso zero não entra nem no denominador da cobertura", () => {
    const s = combinar([{ chave: "a", rotulo: "A", peso: 0, nota: 10 }, { chave: "b", rotulo: "B", peso: 10, nota: 90 }]);
    expect(s.valor).toBe(90);
    expect(s.cobertura).toBe(1);
  });
});

const baseEsforco: EntradasEsforco = {
  temCanalChat: true,
  leadsRecebidos: 20,
  leadsRecebidosAtendidos: 19,
  leadsTrabalhados: 22,
  conversasAtendidas: 18,
  conversasTrabalhadas: 17,
  primeiraResposta: { util: [60, 120, 300, 600, 1200, 2400], bruto: [60, 120, 300, 600, 1200, 9000] },
  gaps: { util: [30, 60, 90], bruto: [30, 60, 900] },
  followups: { previstos: 10, devidos: 10, noPrazo: 9, realizados: 9, vencidos: 1 },
  leadsAbertos: 10,
  leadsSemRetorno: 1,
  propostas: 11,
  funcaoRegistraPropostas: true,
  recuperacao: { recuperados: 1, elegiveis: 10 },
  disciplina: { checagens: 30, ok: 27 },
  mensagens: { enviadas: 400, recebidas: 380 },
};

describe("Score de Esforço", () => {
  it("SLA: conta só as respostas dentro de 15 min de expediente", () => {
    const { indicadores } = calcularEsforco(baseEsforco, cfg, pesos.esforco);
    // 60, 120, 300, 600 ≤ 900 s → 4 de 6
    expect(indicadores.sla_primeira_resposta.numerador).toBe(4);
    expect(indicadores.sla_primeira_resposta.valor).toBeCloseTo(4 / 6);
    expect(indicadores.tempo_primeira_resposta.valor).toBe(450); // mediana útil
  });
  it("vendedor sem leads não é punido: itens de taxa ficam 'volume insuficiente'", () => {
    const { indicadores, score } = calcularEsforco(
      { ...baseEsforco, leadsRecebidos: 1, leadsRecebidosAtendidos: 0, leadsTrabalhados: 1, followups: { previstos: 0, devidos: 0, noPrazo: 0, realizados: 0, vencidos: 0 } },
      cfg,
      pesos.esforco
    );
    expect(indicadores.leads_atendidos.nota).toBeNull();
    expect(indicadores.leads_atendidos.motivo).toBe("volume_insuficiente");
    expect(indicadores.followups_prazo.motivo).toBe("sem_dados");
    expect(score.valor).not.toBe(0);
  });
  it("venda externa (sem chat): itens de chat 'não se aplica' e o peso vai para os demais", () => {
    const { indicadores, score } = calcularEsforco({ ...baseEsforco, temCanalChat: false }, cfg, pesos.esforco);
    expect(indicadores.sla_primeira_resposta.motivo).toBe("nao_aplicavel");
    expect(indicadores.conversas_trabalhadas.motivo).toBe("nao_aplicavel");
    expect(score.composicao.find((c) => c.chave === "sla_primeira_resposta")!.pesoEfetivo).toBe(0);
    const somaEfetiva = score.composicao.reduce((s, c) => s + c.pesoEfetivo, 0);
    expect(Math.round(somaEfetiva)).toBe(100);
  });
  it("mandar mais mensagens não aumenta o score (volume é só contexto)", () => {
    const a = calcularEsforco(baseEsforco, cfg, pesos.esforco).score.valor;
    const b = calcularEsforco({ ...baseEsforco, mensagens: { enviadas: 5000, recebidas: 380 } }, cfg, pesos.esforco).score.valor;
    expect(b).toBe(a);
  });
  it("sem atraso: 100 sem leads parados, 0 quando 20%+ dos abertos estão sem retorno", () => {
    expect(calcularEsforco({ ...baseEsforco, leadsSemRetorno: 0 }, cfg, pesos.esforco).indicadores.sem_atraso.nota).toBe(100);
    expect(calcularEsforco({ ...baseEsforco, leadsSemRetorno: 1 }, cfg, pesos.esforco).indicadores.sem_atraso.nota).toBe(50);
    expect(calcularEsforco({ ...baseEsforco, leadsSemRetorno: 5 }, cfg, pesos.esforco).indicadores.sem_atraso.nota).toBe(0);
  });
  it("função que não registra proposta no CRM não é avaliada por proposta", () => {
    const { indicadores } = calcularEsforco({ ...baseEsforco, funcaoRegistraPropostas: false }, cfg, pesos.esforco);
    expect(indicadores.propostas.motivo).toBe("nao_aplicavel");
  });
  it("ligações aparecem como sem integração", () => {
    expect(calcularEsforco(baseEsforco, cfg, pesos.esforco).indicadores.ligacoes.motivo).toBe("sem_integracao");
  });
  it("pesos configurados por setor mudam a composição", () => {
    const c = mesclarConfig({ pesos_por_setor: { comercial_interno: { esforco: { propostas: 0 } } } });
    const s = calcularEsforco(baseEsforco, c, pesosDoSetor(c, "comercial_interno").esforco).score;
    expect(s.composicao.find((i) => i.chave === "propostas")!.pesoEfetivo).toBe(0);
  });
});

describe("Score de Resultado", () => {
  it("meta proporcional e conversão real (PRD 5.14)", () => {
    const { indicadores, score } = calcularResultado(
      { vendas: 10, metaPeriodo: 12.5, fechados: 20, convertidos: 8, receitaNova: 1000, metaReceita: null, ativacoes: 7 },
      cfg,
      pesos.resultado
    );
    expect(indicadores.meta_vendas.nota).toBe(80);
    expect(indicadores.conversao.valor).toBe(0.4);
    expect(indicadores.conversao.nota).toBeCloseTo(85.7, 1); // (0.4−0.1)/(0.45−0.1)
    expect(indicadores.receita_nova.motivo).toBe("sem_meta");
    expect(score.valor).toBeCloseTo(0.6 * 80 + 0.4 * 85.7, 0);
  });
  it("sem meta cadastrada o item fica indisponível e a conversão carrega o score", () => {
    const { score } = calcularResultado({ vendas: 3, metaPeriodo: null, fechados: 10, convertidos: 3, receitaNova: 0, metaReceita: null, ativacoes: 0 }, cfg, pesos.resultado);
    expect(score.composicao.find((c) => c.chave === "meta_vendas")!.motivo).toBe("sem_meta");
    expect(score.valor).toBe(score.composicao.find((c) => c.chave === "conversao")!.nota);
  });
  it("bater 150% da meta não passa de 100 pontos", () => {
    const { indicadores } = calcularResultado({ vendas: 15, metaPeriodo: 10, fechados: 0, convertidos: 0, receitaNova: 0, metaReceita: null, ativacoes: 0 }, cfg, pesos.resultado);
    expect(indicadores.meta_vendas.nota).toBe(100);
    expect(indicadores.meta_vendas.valor).toBe(1.5);
  });
});

describe("Score de Qualidade e IPC", () => {
  const maduro = { casos: 1, base: 20 };
  it("coorte imatura: qualidade das vendas em maturação e IPC provisório", () => {
    const q = calcularQualidade(
      { cancelAntesInstalacao: { casos: 0, base: 3 }, cancel30: { casos: 0, base: 0 }, churn90: { casos: 0, base: 0 }, inad1: { casos: 0, base: 2 }, atendimento: [], iaHabilitada: false },
      cfg,
      pesos.qualidade
    );
    expect(q.indicadores.qualidade_vendas.motivo).toBe("em_maturacao");
    expect(q.indicadores.qualidade_atendimento.motivo).toBe("sem_integracao");
    expect(q.score.valor).toBeNull();
    const e = combinar([{ chave: "x", rotulo: "x", peso: 1, nota: 80 }]);
    const r = combinar([{ chave: "y", rotulo: "y", peso: 1, nota: 60 }]);
    const ipc = calcularIpc(e, r, q.score, pesos.ipc);
    expect(ipc.provisorio).toBe(true);
    expect(ipc.valor).toBeCloseTo((80 * 35 + 60 * 40) / 75, 0);
  });
  it("vendas canceladas pesam contra pela régua inversa; só sinais maduros entram", () => {
    const q = calcularQualidade(
      { cancelAntesInstalacao: { casos: 3, base: 20 }, cancel30: maduro, churn90: { casos: 0, base: 4 }, inad1: { casos: 1, base: 20 }, atendimento: [80, 90, 70, 85, 75], iaHabilitada: true },
      cfg,
      pesos.qualidade
    );
    expect(q.indicadores.cancel_antes_instalacao.nota).toBe(50); // 15% entre 5% e 25%
    expect(q.indicadores.churn_90.motivo).toBe("em_maturacao");
    expect(q.indicadores.qualidade_vendas.detalhe).toContain("3 de 4");
    expect(q.indicadores.qualidade_atendimento.nota).toBe(80);
    expect(q.score.provisorio).toBe(false);
  });
  it("IPC com os três componentes = 35/40/25", () => {
    const s = (v: number) => combinar([{ chave: "k", rotulo: "k", peso: 1, nota: v }]);
    const ipc = calcularIpc(s(90), s(70), s(80), pesos.ipc);
    expect(ipc.valor).toBe(Math.round((90 * 0.35 + 70 * 0.4 + 80 * 0.25) * 10) / 10);
    expect(ipc.provisorio).toBe(false);
  });
});
