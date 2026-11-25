import { describe, expect, it } from "vitest";
import type { CartaoOperacao } from "./dados";
import { contagens, evolucao, feitoEm, filaValidar, filtrar, movimentoValidar, ordenar, porTipo, porUnidade, type FiltrosOperacao, type ItemHistorico } from "./painel";

const agora = Date.parse("2026-11-25T12:00:00-03:00");
const f: FiltrosOperacao = { unidade: "todas", tipos: ["instalacao", "mudanca", "suporte"], status: "todos", responsavel: "todos", soCorporativo: false, busca: "", base: "abertura", intervalo: { de: "2026-11-01", ate: "2026-11-25" }, janelaInteira: false };
const cartao = (x: Partial<CartaoOperacao>): CartaoOperacao => ({
  ocorrenciaId: "1", osId: "9", coluna: "aberta", tipo: "suporte", tipoSgp: "Suporte - Outros", statusOcorrencia: "Aberta", statusOs: "Aberta", pendente: false, corporativo: false, cliente: "Cliente", sgpContratoId: "7", sgpClienteId: null, documento: null, bairro: "Centro", unidade: "Altamira", plano: null, criadaEm: "2026-11-10T10:00:00-03:00", agendamento: null, checkin: null, osEncerradaEm: null, encerradaEm: null, tecnico: null, auxiliares: null, servicoPrestado: null, abertaPor: null, ...x,
});
const item = (x: Partial<ItemHistorico>): ItemHistorico => ({ criadaEm: "2026-11-10T10:00:00-03:00", agendamento: null, feitoEm: null, encerrada: false, encerradaEm: null, unidade: "Altamira", tipo: "suporte", ...x });

describe("painel da operação", () => {
  it("serviço feito: check-in, ou a baixa da OS sem check-in; sem serviço, nada", () => {
    const os = { status: "Encerrada", checkin: null, encerrada_em: "2026-11-12T09:00:00-03:00", servico_prestado: null };
    expect(feitoEm(os)).toBe(os.encerrada_em);
    expect(feitoEm({ ...os, checkin: "2026-11-11T08:00:00-03:00" })).toBe("2026-11-11T08:00:00-03:00");
    expect(feitoEm({ status: "Em execução", checkin: "2026-11-11T08:00:00-03:00", encerrada_em: null, servico_prestado: "" })).toBeNull();
  });

  const lista = [
    cartao({ ocorrenciaId: "a" }),
    cartao({ ocorrenciaId: "b", coluna: "validar", statusOs: "Encerrada", osEncerradaEm: "2026-11-22T10:00:00-03:00", unidade: "Brasil Novo", tipo: "instalacao" }),
    cartao({ ocorrenciaId: "c", coluna: "validar", statusOs: "Em execução Online", checkin: "2026-11-25T09:00:00-03:00", corporativo: true, tecnico: "Téc X" }),
    cartao({ ocorrenciaId: "d", coluna: "encerrada", encerradaEm: "2026-11-24T10:00:00-03:00", corporativo: true }),
    cartao({ ocorrenciaId: "e", criadaEm: "2026-10-28T10:00:00-03:00" }),
  ];

  it("conta os cartões; corporativo só em aberto", () => {
    const n = contagens(filtrar(lista, f));
    expect(n).toMatchObject({ aberta: 1, validar: 2, encerrada: 1, corporativo: 1, emAberto: 3 });
  });
  it("falta validar separa OS encerrada de OS não baixada e mede o prazo de 24 h", () => {
    const v = filaValidar(filtrar(lista, f), agora);
    expect(v).toMatchObject({ total: 2, osEncerrada: 1, osAberta: 1, acimaDoPrazo: 1 });
    expect(v.maisAntiga?.ocorrenciaId).toBe("b");
    expect(v.unidades.reduce((s, u) => s + u.n, 0)).toBe(v.total);
  });
  it("tipo e unidade somam o total em aberto", () => {
    const l = filtrar(lista, f);
    expect(porTipo(l, f.tipos).reduce((s, x) => s + x.n, 0)).toBe(3);
    expect(porUnidade(l)).toEqual([{ unidade: "Altamira", n: 2 }, { unidade: "Vitória do Xingu", n: 0 }, { unidade: "Brasil Novo", n: 1 }]);
  });
  it("filtros: unidade, status, responsável, corporativo, busca e janela inteira", () => {
    const ids = (x: Partial<FiltrosOperacao>) => filtrar(lista, { ...f, ...x }).map((c) => c.ocorrenciaId);
    expect(ids({ unidade: "Brasil Novo" })).toEqual(["b"]);
    expect(ids({ status: "validar" })).toEqual(["b", "c"]);
    expect(ids({ responsavel: "Téc X" })).toEqual(["c"]);
    expect(ids({ responsavel: "sem", status: "aberta" })).toEqual(["a"]);
    expect(ids({ soCorporativo: true })).toEqual(["c"]);
    expect(ids({ busca: "téc" })).toEqual(["c"]);
    expect(ids({ janelaInteira: true })).toContain("e");
  });

  it("evolução: estoque no fim do dia, encerradas acumuladas e o dia de hoje igual aos cartões", () => {
    const h = [
      item({}),
      item({ feitoEm: "2026-11-12T09:00:00-03:00" }),
      item({ feitoEm: "2026-11-12T09:00:00-03:00", encerrada: true, encerradaEm: "2026-11-14T22:30:00-03:00" }),
      item({ encerrada: true, encerradaEm: null }),
    ];
    const { pontos, semData } = evolucao(h, f, agora);
    const d = (x: string) => pontos.find((p) => p.dia === x)!;
    expect(pontos).toHaveLength(25);
    expect(semData).toBe(1);
    expect(d("2026-11-09")).toMatchObject({ abertas: 0, validar: 0, encerradas: 0 });
    expect(d("2026-11-11")).toMatchObject({ abertas: 3, validar: 0 });
    expect(d("2026-11-13")).toMatchObject({ abertas: 3, validar: 2, encerradas: 0 });
    expect(d("2026-11-14")).toMatchObject({ abertas: 2, validar: 1, encerradas: 1 });
    expect(d("2026-11-25")).toMatchObject({ abertas: 2, validar: 1, encerradas: 1 });
  });
  it("movimento da fila em 7 dias", () => {
    const h = [item({ feitoEm: "2026-11-24T09:00:00-03:00" }), item({ feitoEm: "2026-11-10T11:00:00-03:00", encerrada: true, encerradaEm: "2026-11-24T10:00:00-03:00" })];
    expect(movimentoValidar(h, f, agora)).toEqual({ entraram: 1, sairam: 1 });
  });
  it("ordena pela espera", () => {
    const o = ordenar(lista.filter((c) => c.coluna === "validar").reverse(), "espera");
    expect(o.map((c) => c.ocorrenciaId)).toEqual(["b", "c"]);
  });
});
