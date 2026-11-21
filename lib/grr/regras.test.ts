import { describe, expect, it } from "vitest";
import {
  aguardandoInstalacao,
  osAbertasParaBaixar,
  dataRefTicket,
  evolucao,
  metaDoEscopo,
  metaDoTrecho,
  paradaMais7Dias,
  statusAssinatura,
  statusEsteira,
  statusMesFechado,
  statusRitmo,
  trechosDaSemana,
  type MetaLinha,
} from "./regras";

const POPS = [{ id: "alt" }, { id: "bn" }, { id: "vtx" }];
const VENDEDORES = [
  { id: "a1", pop_id: "alt", ativo: true, eh_coordenador: false },
  { id: "a2", pop_id: "alt", ativo: true, eh_coordenador: false },
  { id: "a3", pop_id: "alt", ativo: true, eh_coordenador: false },
  { id: "coord", pop_id: "alt", ativo: true, eh_coordenador: true },
  { id: "saiu", pop_id: "alt", ativo: false, eh_coordenador: false },
  { id: "b1", pop_id: "bn", ativo: true, eh_coordenador: false },
  { id: "v1", pop_id: "vtx", ativo: true, eh_coordenador: false },
];
const individual = (id: string, n: number): MetaLinha => ({ escopo: "vendedora", referencia_id: id, quantidade_vendas: n });
// decisão "Meta por unidade" (23/09/2026): BN e VTX têm meta de unidade cadastrada; Altamira deriva dos agentes
const METAS: MetaLinha[] = [
  individual("a1", 70),
  individual("a2", 70),
  individual("a3", 25),
  individual("coord", 25), // meta do time do coordenador: fica fora da soma
  individual("saiu", 25), // desligada: fica fora
  individual("b1", 25),
  individual("v1", 25),
  { escopo: "pop", referencia_id: "bn", quantidade_vendas: 30 },
  { escopo: "pop", referencia_id: "vtx", quantidade_vendas: 30 },
];
const empresa = { popId: null, vendedorIds: null };

describe("meta do recorte (mesma conta do Dashboard)", () => {
  it("unidade com meta cadastrada usa a cadastrada", () => {
    expect(metaDoEscopo(METAS, VENDEDORES, POPS, { popId: "bn", vendedorIds: null })).toBe(30);
  });

  it("unidade sem meta cadastrada soma os agentes ativos, sem coordenador e sem desligados", () => {
    expect(metaDoEscopo(METAS, VENDEDORES, POPS, { popId: "alt", vendedorIds: null })).toBe(165);
  });

  it("empresa sem meta global soma as unidades", () => {
    expect(metaDoEscopo(METAS, VENDEDORES, POPS, empresa)).toBe(165 + 30 + 30);
  });

  it("empresa com meta global cadastrada usa a global", () => {
    expect(metaDoEscopo([...METAS, { escopo: "global", referencia_id: null, quantidade_vendas: 300 }], VENDEDORES, POPS, empresa)).toBe(300);
  });

  it("equipe soma as metas individuais de quem está ativo", () => {
    expect(metaDoEscopo(METAS, VENDEDORES, POPS, { popId: null, vendedorIds: ["a1", "a3", "saiu"] })).toBe(95);
  });

  it("agente usa a meta individual; sem meta devolve null", () => {
    expect(metaDoEscopo(METAS, VENDEDORES, POPS, { popId: null, vendedorIds: ["b1"] })).toBe(25);
    expect(metaDoEscopo([], VENDEDORES, POPS, { popId: null, vendedorIds: ["b1"] })).toBeNull();
    expect(metaDoEscopo([], VENDEDORES, POPS, empresa)).toBeNull();
  });
});

describe("meta do trecho e faróis (limites do Relatório da diretoria)", () => {
  it("meta da semana segue os dias de expediente", () => {
    expect(metaDoTrecho(260, 26, 6)).toBe(60);
    expect(metaDoTrecho(null, 26, 6)).toBeNull();
    expect(metaDoTrecho(260, 0, 6)).toBeNull();
  });

  it("ritmo: ok no esperado, atenção a partir de 85%, crítico abaixo", () => {
    expect(statusRitmo(60, 60)).toBe("ok");
    expect(statusRitmo(51, 60)).toBe("atencao");
    expect(statusRitmo(50, 60)).toBe("critico");
    expect(statusRitmo(10, null)).toBe("sem_meta");
    expect(statusRitmo(10, 0)).toBe("sem_meta");
  });

  it("mês fechado: ok com 100%, atenção a partir de 90%", () => {
    expect(statusMesFechado(275, 275)).toBe("ok");
    expect(statusMesFechado(248, 275)).toBe("atencao");
    expect(statusMesFechado(247, 275)).toBe("critico");
    expect(statusMesFechado(247, null)).toBe("sem_meta");
  });

  it("assinatura parada há 48h: ok com 0, atenção até 3", () => {
    expect(statusAssinatura(0)).toBe("ok");
    expect(statusAssinatura(3)).toBe("atencao");
    expect(statusAssinatura(4)).toBe("critico");
  });

  it("esteira: crítico acima de 5 paradas; venda antiga aguardando acende atenção", () => {
    expect(statusEsteira(6, 0)).toBe("critico");
    expect(statusEsteira(5, 0)).toBe("atencao");
    expect(statusEsteira(0, 2)).toBe("atencao");
    expect(statusEsteira(0, 0)).toBe("ok");
  });
});

const contrato = (id: string, extra: Partial<{ data_venda: string; data_assinatura: string | null; data_ativacao: string | null; status: string }> = {}) => ({
  id,
  data_venda: "2026-11-10",
  data_assinatura: "2026-11-10",
  data_ativacao: null,
  data_cancelamento: null,
  motivo_cancelamento: null,
  status: "aguardando_ativacao",
  valor_mensalidade: 99.9,
  ...extra,
});

describe("quem aguarda instalação (D9)", () => {
  const HOJE = "2026-11-18";

  it("junta OS aberta com assinado sem ativação, sem contar o mesmo contrato duas vezes", () => {
    const comOs = contrato("c1");
    const pendente = contrato("c2");
    const itens = aguardandoInstalacao([comOs, pendente], [pendente], HOJE);
    expect(itens.map((i) => i.contrato.id).sort()).toEqual(["c1", "c2"]);
    expect(itens.find((i) => i.contrato.id === "c1")!.idadeDias).toBe(8);
  });

  it("contrato já em serviço com OS aberta não aguarda: é OS para baixar no SGP (21/11/2026)", () => {
    const ativo = contrato("c6", { status: "ativo", data_ativacao: "2026-11-10" });
    const suspenso = contrato("c7", { status: "suspenso", data_ativacao: "2026-11-01" });
    const esperando = contrato("c8");
    expect(aguardandoInstalacao([ativo, suspenso, esperando], [], HOJE).map((i) => i.contrato.id)).toEqual(["c8"]);
    expect(osAbertasParaBaixar([ativo, suspenso, esperando, ativo]).map((c) => c.id)).toEqual(["c6", "c7"]);
  });

  it("contrato cancelado com OS aberta não aguarda instalação", () => {
    expect(aguardandoInstalacao([contrato("c3", { status: "cancelado" })], [], HOJE)).toHaveLength(0);
  });

  it("parada é venda dos últimos 60 dias aguardando há mais de 7 dias", () => {
    expect(paradaMais7Dias({ contrato: contrato("c4"), idadeDias: 8 }, HOJE)).toBe(true);
    expect(paradaMais7Dias({ contrato: contrato("c5"), idadeDias: 7 }, HOJE)).toBe(false);
    expect(paradaMais7Dias({ contrato: contrato("c6", { data_venda: "2026-08-01" }), idadeDias: 100 }, HOJE)).toBe(false);
  });
});

describe("data em que o ticket fechado conta", () => {
  it("convertido com contrato conta no dia da venda", () => {
    expect(dataRefTicket({ desfecho: "convertido", fechado_em: "2026-11-13T15:00:00Z", data_venda_contrato: "2026-11-11" })).toBe("2026-11-11");
  });

  it("os demais contam no dia do fechamento, no fuso de Santarém", () => {
    // 01:30 UTC de segunda ainda é domingo à noite em Santarém
    expect(dataRefTicket({ desfecho: "nao_convertido", fechado_em: "2026-11-16T01:30:00Z", data_venda_contrato: null })).toBe("2026-11-15");
    expect(dataRefTicket({ desfecho: "convertido", fechado_em: "2026-11-12T12:00:00Z", data_venda_contrato: null })).toBe("2026-11-12");
    expect(dataRefTicket({ desfecho: null, fechado_em: null, data_venda_contrato: null })).toBeNull();
  });
});

describe("trechos de comparação da semana", () => {
  const SEMANA = { inicio: "2026-11-16", fim: "2026-11-22" };

  it("semana completa compara com a anterior completa", () => {
    const t = trechosDaSemana({ inicio: "2026-11-09", fim: "2026-11-15" }, "2026-11-18");
    expect(t.emAndamento).toBe(false);
    expect(t.atual).toEqual({ de: "2026-11-09", ate: "2026-11-15" });
    expect(t.anterior).toEqual({ de: "2026-11-02", ate: "2026-11-08" });
  });

  it("semana em andamento compara segunda a hoje com o mesmo trecho da anterior", () => {
    const t = trechosDaSemana(SEMANA, "2026-11-18");
    expect(t.emAndamento).toBe(true);
    expect(t.atual).toEqual({ de: "2026-11-16", ate: "2026-11-18" });
    expect(t.anterior).toEqual({ de: "2026-11-09", ate: "2026-11-11" });
    expect(t.dias).toBe(3);
  });
});

describe("evolução do cartão", () => {
  it("a seta segue o número e diz quanto subiu ou caiu", () => {
    expect(evolucao(30, 20)).toEqual({ texto: "50% acima da semana anterior", direcao: "sobe", bom: true });
    expect(evolucao(15, 20)).toEqual({ texto: "25% abaixo da semana anterior", direcao: "desce", bom: false });
    expect(evolucao(20, 20)).toMatchObject({ direcao: "neutro", bom: null });
    expect(evolucao(5, 0)).toMatchObject({ direcao: "neutro", bom: null });
  });

  it("quando menor é melhor, cair é bom e subir é ruim", () => {
    expect(evolucao(5, 10, { menorEMelhor: true })).toMatchObject({ direcao: "desce", bom: true });
    expect(evolucao(12, 10, { menorEMelhor: true })).toMatchObject({ direcao: "sobe", bom: false });
  });
});
