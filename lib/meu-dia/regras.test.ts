import { describe, expect, it } from "vitest";
import {
  classificarFollowup,
  contratoSemAssinatura,
  diasUteisRestantes,
  ehPendente90,
  metaDoDia,
  pendenciasTicket,
  type TicketFollowup,
} from "./regras";

// 15/10/2026 10:00 em Santarém (UTC-3)
const AGORA = "2026-10-15T13:00:00Z";
const base: TicketFollowup = {
  etapa: "em_atendimento",
  followupEm: null,
  urgencia: null,
  ultimaMovimentacao: "2026-10-15T12:00:00Z",
  lembretesPendentes: [],
  tratativaHoje: false,
};

describe("Bloco 2 — precedência das sub-filas", () => {
  it("retorno atrasado vence todas as outras", () => {
    expect(
      classificarFollowup(
        { ...base, followupEm: "2026-10-14T12:00:00Z", urgencia: "alta", ultimaMovimentacao: "2026-10-01T12:00:00Z" },
        AGORA
      )
    ).toBe("atrasado");
  });
  it("lembrete vencido conta como retorno atrasado (unificação)", () => {
    expect(classificarFollowup({ ...base, lembretesPendentes: ["2026-10-13T14:00:00Z"] }, AGORA)).toBe("atrasado");
  });
  it("retorno de hoje vence urgência e parada", () => {
    expect(
      classificarFollowup({ ...base, followupEm: "2026-10-15T20:00:00Z", urgencia: "alta", ultimaMovimentacao: "2026-10-01T12:00:00Z" }, AGORA)
    ).toBe("hoje");
  });
  it("retorno às 23h de Santarém ainda é hoje (fuso)", () => {
    expect(classificarFollowup({ ...base, followupEm: "2026-10-16T02:00:00Z" }, AGORA)).toBe("hoje");
  });
  it("urgência alta vence negociação parada", () => {
    expect(classificarFollowup({ ...base, urgencia: "alta", ultimaMovimentacao: "2026-10-01T12:00:00Z" }, AGORA)).toBe("urgencia");
  });
  it("parada depois de 12h sem movimentação", () => {
    expect(classificarFollowup({ ...base, ultimaMovimentacao: "2026-10-14T23:59:00Z" }, AGORA)).toBe("parada");
    expect(classificarFollowup({ ...base, ultimaMovimentacao: "2026-10-15T02:00:00Z" }, AGORA)).toBe(null);
  });
  it("com retorno futuro marcado não está parada", () => {
    expect(
      classificarFollowup({ ...base, followupEm: "2026-10-20T12:00:00Z", ultimaMovimentacao: "2026-10-01T12:00:00Z" }, AGORA)
    ).toBe(null);
  });
  it("tratativa registrada hoje conclui o follow-up do dia", () => {
    expect(classificarFollowup({ ...base, followupEm: "2026-10-14T12:00:00Z", tratativaHoje: true }, AGORA)).toBe(null);
  });
  it("Sem contato e fechado ficam fora (Bloco 1 / encerrado)", () => {
    expect(classificarFollowup({ ...base, etapa: "novo", followupEm: "2026-10-14T12:00:00Z" }, AGORA)).toBe(null);
    expect(classificarFollowup({ ...base, etapa: "fechado", urgencia: "alta" }, AGORA)).toBe(null);
  });
});

describe("Bloco 3 — pendências da esteira", () => {
  const t = { etapa: "aguardando", desfecho: null, propostas: 1, consultas: 1, adiantamentoValor: null, adiantamentoRecebidoEm: null, scoreFaixa: null };
  it("Criação do contrato sem proposta", () => expect(pendenciasTicket({ ...t, propostas: 0 })).toEqual(["sem_proposta"]));
  it("etapa avançada sem consulta de crédito", () => expect(pendenciasTicket({ ...t, consultas: 0 })).toEqual(["sem_consulta"]));
  it("proposta/consulta só cobradas em Criação do contrato", () =>
    expect(pendenciasTicket({ ...t, etapa: "em_atendimento", propostas: 0, consultas: 0 })).toEqual([]));
  it("adiantamento recomendado e não confirmado (amarelo/vermelho)", () => {
    expect(pendenciasTicket({ ...t, adiantamentoValor: 49, scoreFaixa: "amarelo" })).toEqual(["adiantamento"]);
    expect(pendenciasTicket({ ...t, adiantamentoValor: 49, scoreFaixa: "amarelo", adiantamentoRecebidoEm: "2026-10-15" })).toEqual([]);
    expect(pendenciasTicket({ ...t, etapa: "fechado", desfecho: "convertido", adiantamentoValor: 100, scoreFaixa: "vermelho" })).toEqual(["adiantamento"]);
    expect(pendenciasTicket({ ...t, etapa: "fechado", desfecho: "nao_convertido", adiantamentoValor: 100, scoreFaixa: "vermelho" })).toEqual([]);
  });
  it("venda sem assinatura de termo/fidelidade", () => {
    const c = { status: "aguardando_ativacao", termoAssinado: true, fidelidadeAssinada: false, assinaturaDispensada: false, desistenciaEm: null };
    expect(contratoSemAssinatura(c)).toBe(true);
    expect(contratoSemAssinatura({ ...c, fidelidadeAssinada: true })).toBe(false);
    expect(contratoSemAssinatura({ ...c, assinaturaDispensada: true })).toBe(false);
    expect(contratoSemAssinatura({ ...c, status: "cancelado" })).toBe(false);
    expect(contratoSemAssinatura({ ...c, desistenciaEm: "2026-10-10" })).toBe(false);
  });
});

describe("Bloco 5 — pendentes 90+", () => {
  const c = { dataVenda: "2026-09-01", status: "suspenso", desistenciaEm: null, statusAnteriorCancelamento: null };
  const HOJE = "2026-10-15";
  it("suspenso dentro de 90 dias conta", () => expect(ehPendente90(c, HOJE)).toBe(true));
  it("cancelado depois de instalado conta", () => {
    expect(ehPendente90({ ...c, status: "cancelado", statusAnteriorCancelamento: "Ativo" }, HOJE)).toBe(true);
    expect(ehPendente90({ ...c, status: "cancelado", statusAnteriorCancelamento: "Suspenso" }, HOJE)).toBe(true);
  });
  it("cancelou antes de instalar não conta", () => {
    expect(ehPendente90({ ...c, status: "cancelado", statusAnteriorCancelamento: "Inativo" }, HOJE)).toBe(false);
    expect(ehPendente90({ ...c, status: "cancelado", statusAnteriorCancelamento: "Novo" }, HOJE)).toBe(false);
    expect(ehPendente90({ ...c, status: "suspenso", desistenciaEm: "2026-09-05" }, HOJE)).toBe(false);
  });
  it("venda com mais de 90 dias ou ativa não conta", () => {
    expect(ehPendente90({ ...c, dataVenda: "2026-07-16" }, HOJE)).toBe(false);
    expect(ehPendente90({ ...c, dataVenda: "2026-07-17" }, HOJE)).toBe(true);
    expect(ehPendente90({ ...c, status: "ativo" }, HOJE)).toBe(false);
  });
});

describe("Bloco 6 — meta do dia", () => {
  const out = Array.from({ length: 31 }, (_, i) => {
    const data = `2026-10-${String(i + 1).padStart(2, "0")}`;
    const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
    return { data, dia_util: dow !== 0 && data !== "2026-10-12" };
  });
  it("dias úteis restantes contam hoje e pulam domingo e feriado", () => {
    expect(diasUteisRestantes(out, "2026-10-01")).toBe(26);
    expect(diasUteisRestantes(out, "2026-10-31")).toBe(1);
  });
  it("início do mês: meta inteira dividida pelos dias úteis", () => {
    expect(metaDoDia(70, 0, 26)).toEqual({ metaDia: 3, batida: false, falta: 70 });
  });
  it("meio do mês arredonda para cima", () => {
    expect(metaDoDia(70, 24, 14)).toEqual({ metaDia: 4, batida: false, falta: 46 });
  });
  it("meta batida", () => {
    expect(metaDoDia(70, 70, 5)).toEqual({ metaDia: 0, batida: true, falta: 0 });
    expect(metaDoDia(70, 80, 5).batida).toBe(true);
  });
  it("último dia útil: tudo o que falta", () => {
    expect(metaDoDia(70, 60, 1)).toEqual({ metaDia: 10, batida: false, falta: 10 });
  });
  it("sem dia útil restante não divide por zero", () => {
    expect(metaDoDia(70, 60, 0).metaDia).toBe(10);
  });
});
