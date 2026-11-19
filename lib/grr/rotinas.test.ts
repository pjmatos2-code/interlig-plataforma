import { describe, expect, it } from "vitest";
import { avaliarCoordenacao, avaliarDiretoria, resumir, situacaoEm, type EntradaCoordenacao } from "./rotinas";

const SEMANA = { inicio: "2026-11-23", fim: "2026-11-29" };
const base: EntradaCoordenacao = { semana: SEMANA, agora: "2026-12-01T12:00:00Z", leads: [], followupsVencidosAgora: null, desvios: [], diagnosticos: [], reuniao: null, planos: [] };
const item = (itens: ReturnType<typeof avaliarCoordenacao>, chave: string) => itens.find((i) => i.chave === chave)!;

describe("rotina da coordenação", () => {
  it("lead atendido em outro dia conta como falha do dia em que chegou", () => {
    const itens = avaliarCoordenacao({
      ...base,
      leads: [
        { criado_em: "2026-11-24T13:00:00Z", primeira_tratativa_em: "2026-11-24T14:00:00Z" },
        { criado_em: "2026-11-25T13:00:00Z", primeira_tratativa_em: "2026-11-26T12:00:00Z" },
        { criado_em: "2026-11-25T13:00:00Z", primeira_tratativa_em: null },
      ],
    });
    expect(item(itens, "leads_mesmo_dia").status).toBe("nao_cumprido");
    expect(item(itens, "leads_mesmo_dia").detalhe).toContain("25/11 (2)");
  });

  it("dia que ainda não fechou não conta", () => {
    const itens = avaliarCoordenacao({ ...base, agora: "2026-11-25T15:00:00Z", leads: [{ criado_em: "2026-11-25T13:00:00Z", primeira_tratativa_em: null }] });
    expect(item(itens, "leads_mesmo_dia").status).toBe("no_prazo");
  });

  it("diagnóstico: no prazo, depois do prazo e faltando", () => {
    const desvios = [{ chave: "conversao", rotulo: "Conversão" }, { chave: "ticket", rotulo: "Ticket" }];
    expect(item(avaliarCoordenacao({ ...base, desvios, diagnosticos: [{ indicador: "conversao", criado_em: "2026-11-27T20:00:00Z" }, { indicador: "ticket", criado_em: "2026-11-26T10:00:00Z" }] }), "diagnosticos").status).toBe("cumprido");
    expect(item(avaliarCoordenacao({ ...base, desvios, diagnosticos: [{ indicador: "conversao", criado_em: "2026-11-29T10:00:00Z" }, { indicador: "ticket", criado_em: "2026-11-26T10:00:00Z" }] }), "diagnosticos").status).toBe("parcial");
    expect(item(avaliarCoordenacao({ ...base, desvios, diagnosticos: [] }), "diagnosticos").status).toBe("nao_cumprido");
    expect(item(avaliarCoordenacao({ ...base, agora: "2026-11-26T12:00:00Z", desvios, diagnosticos: [] }), "diagnosticos").status).toBe("no_prazo");
  });

  it("reunião de equipe: encerrada com compromissos cumpre; aberta depois da semana é parcial", () => {
    expect(item(avaliarCoordenacao({ ...base, reuniao: { situacao: "encerrada", data: "2026-11-28", compromissos: 3 } }), "reuniao_equipe").status).toBe("cumprido");
    expect(item(avaliarCoordenacao({ ...base, reuniao: { situacao: "aberta", data: "2026-11-28", compromissos: 3 } }), "reuniao_equipe").status).toBe("parcial");
    expect(item(avaliarCoordenacao({ ...base }), "reuniao_equipe").status).toBe("nao_cumprido");
  });

  it("planos: atrasado não cumpre; sem atualização é parcial; sem planos não se aplica", () => {
    expect(item(avaliarCoordenacao({ ...base, planos: [{ descricao: "a", prazo: "2026-11-25", situacaoNoFim: "em_andamento", atualizadoNaSemana: true }] }), "planos").status).toBe("nao_cumprido");
    expect(item(avaliarCoordenacao({ ...base, planos: [{ descricao: "a", prazo: "2026-12-07", situacaoNoFim: "em_andamento", atualizadoNaSemana: false }] }), "planos").status).toBe("parcial");
    expect(item(avaliarCoordenacao({ ...base }), "planos").status).toBe("nao_se_aplica");
  });

  it("antes do início da rotina, só o atendimento dos leads conta", () => {
    const itens = avaliarCoordenacao({ ...base, semana: { inicio: "2026-11-16", fim: "2026-11-22" }, agora: "2026-11-24T12:00:00Z", reuniao: null });
    expect(item(itens, "reuniao_equipe").status).toBe("nao_se_aplica");
    expect(item(itens, "leads_mesmo_dia").status).toBe("nao_se_aplica");
    expect(avaliarDiretoria({ semana: { inicio: "2026-11-16", fim: "2026-11-22" }, agora: "2026-11-24T12:00:00Z", reuniao: null, aprovacoes: [], validacoes: [] })[0].status).toBe("nao_se_aplica");
  });

  it("resumo conta só os itens avaliados", () => {
    expect(resumir(avaliarCoordenacao({ ...base, reuniao: { situacao: "encerrada", data: "2026-11-28", compromissos: 1 } }))).toEqual({ cumpridos: 1, avaliados: 1 });
  });
});

describe("rotina da diretoria", () => {
  const agora = "2026-12-01T12:00:00Z";
  it("decisões em até 2 dias", () => {
    const itens = avaliarDiretoria({
      semana: SEMANA,
      agora,
      reuniao: { situacao: "encerrada", data: "2026-11-23", decisoes: 2 },
      aprovacoes: [
        { descricao: "a", desde: "2026-11-24T12:00:00Z", resolvidoEm: "2026-11-25T12:00:00Z" },
        { descricao: "b", desde: "2026-11-24T12:00:00Z", resolvidoEm: "2026-11-27T12:00:00Z" },
      ],
      validacoes: [{ descricao: "c", desde: "2026-11-25T12:00:00Z", resolvidoEm: null }],
    });
    expect(itens.map((i) => i.status)).toEqual(["cumprido", "parcial", "nao_cumprido"]);
  });
  it("sem reunião depois da segunda não cumpre", () => {
    expect(avaliarDiretoria({ semana: SEMANA, agora, reuniao: null, aprovacoes: [], validacoes: [] })[0].status).toBe("nao_cumprido");
    expect(avaliarDiretoria({ semana: SEMANA, agora: "2026-11-23T15:00:00Z", reuniao: null, aprovacoes: [], validacoes: [] })[0].status).toBe("no_prazo");
  });
});

describe("situação do plano num instante", () => {
  it("segue o histórico", () => {
    const ev = [
      { tipo: "situacao", dados: { depois: "em_andamento" }, criado_em: "2026-11-24T10:00:00Z" },
      { tipo: "comentario", dados: null, criado_em: "2026-11-25T10:00:00Z" },
      { tipo: "situacao", dados: { depois: "concluida" }, criado_em: "2026-12-02T10:00:00Z" },
    ];
    expect(situacaoEm(ev, "2026-11-23T00:00:00Z")).toBe("pendente");
    expect(situacaoEm(ev, "2026-11-30T02:59:59Z")).toBe("em_andamento");
    expect(situacaoEm(ev, "2026-12-03T00:00:00Z")).toBe("concluida");
  });
});
