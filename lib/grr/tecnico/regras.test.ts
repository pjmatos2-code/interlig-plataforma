import { describe, expect, it } from "vitest";
import type { MetaGrr } from "../config";
import { unidadeDoPop } from "./catalogo";
import { instalacaoNoPrazo, montarTecnico, mudancaNoPrazo, situacaoAgenda, trechosTecnico, type BaseTecnico, type RecorteTecnico } from "./regras";

const meta = (indicador: string, valor: number, limite: number, escopo: Partial<MetaGrr> = {}): MetaGrr => ({
  id: indicador, indicador, escopo_tipo: "empresa", escopo_ref: null, vigente_desde: "2026-11-16", meta: valor, limite_atencao: limite, observacao: null, criado_em: "2026-11-21T12:00:00Z", criado_por: null, ...escopo,
});
const METAS: MetaGrr[] = [
  meta("tec_instalacoes", 308, 262),
  meta("tec_instalacoes", 248, 211, { escopo_tipo: "unidade", escopo_ref: "pop-atm" }),
  meta("tec_instalacao_48h", 0.8, 0.65),
  meta("tec_suporte_24h", 0.75, 0.6),
  meta("tec_corporativo_4h", 0.6, 0.4),
  meta("tec_mudanca_24h", 0.4, 0.2),
  meta("tec_retorno_7d", 0.08, 0.12),
  meta("tec_agendamentos_vencidos", 5, 15),
  meta("tec_falta_validar", 10, 40),
  meta("tec_os_para_baixar", 5, 20),
];
const EMPRESA: RecorteTecnico = { tipo: "empresa", unidade: null, chave: { tipo: "empresa", ref: null }, rotulo: "Empresa" };
const ALTAMIRA: RecorteTecnico = { tipo: "unidade", unidade: "Altamira", chave: { tipo: "unidade", ref: "pop-atm" }, rotulo: "Altamira" };
const SEMANA = { inicio: "2026-11-16", fim: "2026-11-22" };

const base = (): BaseTecnico => ({
  ativacoes: [
    ...Array.from({ length: 60 }, () => ({ dia: "2026-11-17", unidade: "Altamira" as const })),
    ...Array.from({ length: 8 }, () => ({ dia: "2026-11-18", unidade: "Vitória do Xingu" as const })),
    ...Array.from({ length: 50 }, () => ({ dia: "2026-11-10", unidade: "Altamira" as const })),
  ],
  instalacoes: [
    { unidade: "Altamira", diaAtivacao: "2026-11-17", ativadoEm: null, direcionadaEm: "2026-11-15T10:00:00-03:00" }, // 2 dias: no prazo
    { unidade: "Altamira", diaAtivacao: "2026-11-20", ativadoEm: null, direcionadaEm: "2026-11-16T10:00:00-03:00" }, // 4 dias: fora
    { unidade: "Altamira", diaAtivacao: "2026-11-21", ativadoEm: "2026-11-21T20:00:00-03:00", direcionadaEm: "2026-11-20T09:00:00-03:00" }, // 35 h
    { unidade: "Altamira", diaAtivacao: "2026-11-18", ativadoEm: null, direcionadaEm: null }, // sem hora
  ],
  suporte: [
    { unidade: "Altamira", abertaEm: "2026-11-17T08:00:00-03:00", atendidaEm: "2026-11-17T15:00:00-03:00", corporativo: true },
    { unidade: "Altamira", abertaEm: "2026-11-15T08:00:00-03:00", atendidaEm: "2026-11-17T15:00:00-03:00", corporativo: false },
  ],
  mudancas: [{ unidade: "Altamira", abertaEm: "2026-11-01T08:00:00-03:00", agendamento: "2026-11-18T08:00:00-03:00", atendidaEm: "2026-11-18T17:00:00-03:00" }],
  servicos: [
    { unidade: "Altamira", atendidaEm: "2026-11-10T10:00:00-03:00", retornou: true },
    { unidade: "Altamira", atendidaEm: "2026-11-11T10:00:00-03:00", retornou: false },
    { unidade: "Vitória do Xingu", atendidaEm: "2026-11-12T10:00:00-03:00", retornou: false },
    { unidade: "Altamira", atendidaEm: "2026-11-18T10:00:00-03:00", retornou: true }, // semana atual: entra só na próxima
  ],
  estoques: { agendamentosVencidos: { Altamira: 9, "Vitória do Xingu": 16 }, faltaValidar: { Altamira: 100 }, osParaBaixar: { Altamira: 44, "Brasil Novo": 4 }, medidoEm: "21/11 18:00" },
});
// novembro/2026: 20 dias de expediente (seg–sex sem feriado); semana inteira 5, até sábado 21 também 5
const EXP = { mes: 20, semana: 5, ateHoje: 5 };

describe("prazos", () => {
  it("instalação: 48 h com a hora da ativação; até 2 dias sem ela", () => {
    expect(instalacaoNoPrazo({ diaAtivacao: "2026-11-17", ativadoEm: null, direcionadaEm: "2026-11-15T23:00:00-03:00" })).toBe(true);
    expect(instalacaoNoPrazo({ diaAtivacao: "2026-11-18", ativadoEm: null, direcionadaEm: "2026-11-15T23:00:00-03:00" })).toBe(false);
    expect(instalacaoNoPrazo({ diaAtivacao: "2026-11-17", ativadoEm: "2026-11-17T11:00:00-03:00", direcionadaEm: "2026-11-15T10:00:00-03:00" })).toBe(false);
  });
  it("mudança: 24 h da data agendada; sem agendamento, da abertura", () => {
    expect(mudancaNoPrazo({ abertaEm: "2026-11-01T08:00:00Z", agendamento: "2026-11-10T08:00:00Z", atendidaEm: "2026-11-11T07:00:00Z" })).toBe(true);
    expect(mudancaNoPrazo({ abertaEm: "2026-11-01T08:00:00Z", agendamento: null, atendidaEm: "2026-11-03T08:00:00Z" })).toBe(false);
  });
  it("trechos: semana em andamento compara com o mesmo número de dias", () => {
    expect(trechosTecnico(SEMANA, "2026-11-19")).toEqual({ atual: { de: "2026-11-16", ate: "2026-11-19" }, anterior: { de: "2026-11-09", ate: "2026-11-12" }, emAndamento: true });
  });
  it("unidade pelo POP", () => {
    expect(unidadeDoPop("Altamira - Corporativo-PA")).toBe("Altamira");
    expect(unidadeDoPop("Vitória do Xingu")).toBe("Vitória do Xingu");
    expect(unidadeDoPop("Brasil Novo-PA")).toBe("Brasil Novo");
    expect(unidadeDoPop(null)).toBeNull();
  });
});

describe("montarTecnico", () => {
  const porChave = (r: ReturnType<typeof montarTecnico>) => Object.fromEntries(r.cartoes.map((c) => [c.chave, c]));

  it("empresa: meta mensal vira meta da semana pelos dias úteis; taxas e estoques com farol", () => {
    const c = porChave(montarTecnico({ base: base(), semana: SEMANA, hoje: "2026-11-21", recorte: EMPRESA, metas: METAS, expediente: EXP }));
    expect(c.tec_instalacoes.numero).toBe(68);
    expect(c.tec_instalacoes.meta).toBe("meta 77 na semana · 77 até hoje");
    expect(c.tec_instalacoes.status).toBe("atencao"); // 68 ≥ 65,5 (262 × 5/20) e < 77
    expect(c.tec_instalacao_48h.numero).toBeCloseTo(2 / 3);
    expect(c.tec_instalacao_48h.contexto).toContain("1 sem a hora do direcionamento");
    expect(c.tec_suporte_24h.numero).toBe(0.5);
    expect(c.tec_corporativo_4h.numero).toBe(0); // 7 h
    expect(c.tec_mudanca_24h.numero).toBe(1);
    expect(c.tec_retorno_7d.numero).toBeCloseTo(1 / 3);
    expect(c.tec_retorno_7d.status).toBe("critico");
    expect(c.tec_agendamentos_vencidos.numero).toBe(25);
    expect(c.tec_agendamentos_vencidos.status).toBe("critico");
    expect(c.tec_os_para_baixar.contexto).toContain("ATM 44 · VTX 0 · BN 4");
  });

  it("unidade: meta mensal própria; taxas herdam a empresa; estoque sem meta", () => {
    const c = porChave(montarTecnico({ base: base(), semana: SEMANA, hoje: "2026-11-21", recorte: ALTAMIRA, metas: METAS, expediente: EXP }));
    expect(c.tec_instalacoes.numero).toBe(60);
    expect(c.tec_instalacoes.metaNumero).toBe(62);
    expect(c.tec_suporte_24h.meta).toBe("meta 75%");
    expect(c.tec_retorno_7d.numero).toBe(0.5);
    expect(c.tec_agendamentos_vencidos.numero).toBe(9);
    expect(c.tec_agendamentos_vencidos.status).toBe("sem_meta");
  });

  it("semana antiga sem foto: estoques sem número", () => {
    const c = porChave(montarTecnico({ base: { ...base(), estoques: null }, semana: SEMANA, hoje: "2026-11-30", recorte: EMPRESA, metas: METAS, expediente: EXP }));
    expect(c.tec_falta_validar.valor).toBe("—");
    expect(c.tec_falta_validar.status).toBe("sem_meta");
  });
});

describe("agenda cumprida", () => {
  const hoje = "2026-11-21";
  it("situação de cada OS agendada", () => {
    expect(situacaoAgenda({ agendamento: "2026-11-18T08:00:00-03:00", checkin: "2026-11-18T15:00:00-03:00", status: "Encerrada" }, hoje)).toBe("cumprida");
    expect(situacaoAgenda({ agendamento: "2026-11-18T08:00:00-03:00", checkin: "2026-11-19T09:00:00-03:00", status: "Encerrada" }, hoje)).toBe("atrasada");
    expect(situacaoAgenda({ agendamento: "2026-11-18T08:00:00-03:00", checkin: "2026-11-18T09:00:00-03:00", status: "Pendente Online" }, hoje)).toBe("atrasada");
    expect(situacaoAgenda({ agendamento: "2026-11-19T08:00:00-03:00", checkin: null, status: "Aberta Online" }, hoje)).toBe("atrasada");
    expect(situacaoAgenda({ agendamento: "2026-11-19T08:00:00-03:00", checkin: null, status: "Encerrada" }, hoje)).toBe("sem_registro");
    expect(situacaoAgenda({ agendamento: "2026-11-21T16:00:00-03:00", checkin: null, status: "Aberta Online" }, hoje)).toBe("a_vencer");
  });
  it("indicador da equipe e quadro por técnico (sem farol abaixo de 10 OS)", () => {
    const ag = (tecnico: string, dia: string, checkin: string | null, status = "Encerrada") => ({ unidade: "Altamira" as const, tecnico, agendamento: `${dia}T08:00:00-03:00`, checkin: checkin ? `${checkin}T10:00:00-03:00` : null, status });
    const agendadas = [
      ...Array.from({ length: 10 }, () => ag("Técnico A", "2026-11-17", "2026-11-17")),
      ag("Técnico A", "2026-11-17", "2026-11-18"),
      ag("Técnico A", "2026-11-18", null, "Aberta Online"),
      ag("Técnico B", "2026-11-18", "2026-11-18"),
      ag("Técnico B", "2026-11-19", null, "Encerrada"),
      ag("Técnico B", "2026-11-21", null, "Aberta Online"), // hoje: ainda não venceu
    ];
    const metas = [...METAS, meta("tec_agenda_no_dia", 0.95, 0.9)];
    const r = montarTecnico({ base: { ...base(), agendadas }, semana: SEMANA, hoje: "2026-11-21", recorte: EMPRESA, metas, expediente: EXP });
    const c = r.cartoes.find((x) => x.chave === "tec_agenda_no_dia")!;
    expect(c.numero).toBeCloseTo(11 / 13);
    expect(c.status).toBe("critico");
    expect(r.porTecnico.map((l) => [l.tecnico, l.agendadas, l.cumpridas, l.atrasadas, l.semRegistro, l.status])).toEqual([
      ["Técnico A", 12, 10, 2, 0, "critico"],
      ["Técnico B", 2, 1, 0, 1, "sem_meta"],
    ]);
  });
});
