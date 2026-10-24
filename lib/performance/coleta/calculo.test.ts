import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO } from "../config";
import { segASab } from "../expediente";
import { calcularConversa } from "./calculo";
import { normalizarConversaSz, normalizarMensagensSz, szDataParaIso } from "./sz-normalizar";

// Amostra no formato real do relatório do SZ (24/10/2026), anonimizada
const ITEM = {
  _id: "sess-1",
  protocol: "20261021-0001",
  campaign_id: "camp-altamira",
  channel: { _id: "c1", description: "08004045005 WhatsApp (BSP)" },
  agent: { name: "Karoline Xavier", email: "x@x" },
  agent_id: "ag-1",
  contact: { _id: "k1", name: "Cliente Teste", number: "5593991234567" },
  platform_id: "5593991234567",
  typeStatus: "success",
  finished_at: { date: "2026-10-23 08:32:02.849097", timezone: "America/Santarem" },
  events: [
    { event: "humanFinish", created_at: "2026-10-23 08:32:02.679922", status: "" }, // fora de ordem de propósito
    { event: "autoStartFlow", created_at: "2026-10-21 07:36:28.631665", status: "" },
    { event: "waitStart", created_at: "2026-10-21 07:36:29.498398", status: "" },
    { event: "humanStart", created_at: "2026-10-21 08:03:53.552146", status: "" },
  ],
};
const m = (id: string, origin: string, created_at: string, message = "texto qualquer do cliente", user?: string) => ({
  message_id: id,
  origin,
  type: "text",
  created_at,
  message,
  ...(user ? { user: { name: user } } : {}),
});
const MSGS = [
  m("1", "channel", "2026-10-21 07:36:28.509519", "quero saber dos planos de internet"),
  m("2", "auto", "2026-10-21 07:36:28.863014", "Bom dia, Seja Bem Vindo(a) ao Canal de Vendas"),
  m("3", "auto", "2026-10-21 07:36:29.256148", "Desculpe, estamos fora do horário comercial"),
  m("4", "system", "2026-10-21 07:36:29.494886", "Transferido automaticamente para equipe Comercial"),
  m("5", "auto", "2026-10-21 08:03:53.387971", "Atendimento iniciado por *Karoline Xavier*"),
  m("6", "agent", "2026-10-21 08:03:57.321703", "Bom dia! Temos planos de 600 Mb e 1 Giga", "Karoline Xavier"),
  m("8", "agent", "2026-10-21 08:07:58.666484", "Qual o seu endereço?", "Karoline Xavier"), // chega antes do 7 (fora de ordem)
  m("7", "channel", "2026-10-21 08:07:05.912511", "e o valor?"),
  m("7", "channel", "2026-10-21 08:07:05.912511", "e o valor?"), // duplicata do provedor
  m("9", "channel", "2026-10-21 17:50:00.000000", "pode instalar amanhã de manhã?"),
  m("10", "agent", "2026-10-22 08:10:00.000000", "Posso agendar sim!", "Dâmely Costa"),
  m("11", "channel", "2026-10-22 09:00:00.000000", "ok"),
  m("12", "auto", "2026-10-23 08:32:02.272729", "Karoline Xavier encerrou o atendimento."),
];
const VENDEDORES: Record<string, string> = { "karoline xavier": "v-karol", "damely costa": "v-damely" };
const resolver = (nome: string) => VENDEDORES[nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()] ?? null;
const conversa = normalizarConversaSz(ITEM, MSGS, { "camp-altamira": "Comercial Altamira" });
const calc = calcularConversa(conversa, resolver, CONFIG_PADRAO.expediente, segASab);

describe("adaptador SZ → modelo interno", () => {
  it("converte o horário de Santarém para ISO com fuso", () => {
    expect(szDataParaIso("2026-10-21 07:36:28.631665")).toBe("2026-10-21T07:36:28.631-03:00");
    expect(szDataParaIso({ date: "2026-10-23 08:32:02.849097", timezone: "America/Santarem" })).toBe("2026-10-23T08:32:02.849-03:00");
    expect(szDataParaIso("lixo")).toBeNull();
  });
  it("classifica autores: cliente, agente humano, automação e sistema", () => {
    const autores = conversa.mensagens.map((x) => x.autor);
    expect(autores.filter((a) => a === "agente")).toHaveLength(3);
    expect(autores.filter((a) => a === "automacao")).toHaveLength(4);
    expect(autores.filter((a) => a === "sistema")).toHaveLength(1);
  });
  it("remove duplicata e reordena mensagens e eventos pelo horário", () => {
    expect(conversa.mensagens).toHaveLength(12);
    expect(conversa.mensagens.map((x) => x.externoId).slice(5, 8)).toEqual(["6", "7", "8"]);
    expect(conversa.eventos.map((e) => e.evento)).toEqual(["fluxo_inicio", "espera_inicio", "humano_inicio", "humano_fim"]);
  });
  it("lê equipe, canal, status, telefone (sem 55) e encerramento", () => {
    expect(conversa.equipe).toBe("Comercial Altamira");
    expect(conversa.canal).toContain("WhatsApp");
    expect(conversa.statusFinal).toBe("success");
    expect(conversa.telefone).toBe("93991234567");
    expect(conversa.finalizadaEm).toBe("2026-10-23T08:32:02.849-03:00");
  });
  it("mensagem desconhecida (bot/IA) nunca vira agente", () => {
    const [x] = normalizarMensagensSz([{ message_id: "z", origin: "ia", created_at: "2026-10-21 10:00:00.0", message: "Olá, sou a assistente" }]);
    expect(x.autor).toBe("automacao");
  });
});

describe("calcularConversa — 1ª resposta e interações", () => {
  it("1ª resposta conta da entrada na fila até a 1ª mensagem HUMANA (automação não conta)", () => {
    expect(calc.primeira_resposta_em).toBe("2026-10-21T08:03:57.321-03:00");
    expect(calc.primeira_resposta_agente).toBe("Karoline Xavier");
    expect(calc.primeira_resposta_vendedor_id).toBe("v-karol");
    // bruto 07:36:29.498 → 08:03:57.321 ≈ 27 min 28 s; útil só a partir das 08:00
    expect(calc.primeira_resposta_seg).toBe(1648);
    expect(calc.primeira_resposta_util_seg).toBe(237);
  });
  it("tempo entre interações vai para quem respondeu e respeita o expediente", () => {
    const karol = calc.por_agente["v-karol"];
    const damely = calc.por_agente["v-damely"];
    expect(karol.msgs).toBe(2);
    expect(karol.msgs_por_dia).toEqual({ "2026-10-21": 2 });
    expect(karol.gaps.map((g) => g[1])).toEqual([53]); // 08:07:05 → 08:07:58
    expect(karol.gaps[0][0]).toBe(Math.round(Date.parse("2026-10-21T08:07:58.666-03:00") / 1000)); // quando respondeu
    expect(damely.respostas).toBe(1);
    expect(damely.gaps[0][1]).toBe(14 * 3600 + 20 * 60); // 17:50 → 08:10 corridos
    expect(damely.gaps[0][2]).toBe(20 * 60); // só 10 min + 10 min de expediente
  });
  it("cortesia final ('ok') não marca cliente sem resposta", () => {
    expect(calc.cliente_sem_resposta).toBe(false);
  });
  it("conta mensagens por autor, eventos e agente principal", () => {
    expect([calc.msgs_cliente, calc.msgs_agente, calc.msgs_automacao, calc.msgs_sistema]).toEqual([4, 3, 4, 1]);
    expect(calc.cliente_por_dia).toEqual({ "2026-10-21": 3, "2026-10-22": 1 });
    expect(calc.iniciada_por).toBe("cliente");
    expect(calc.espera_inicio_em).toBe("2026-10-21T07:36:29.498-03:00");
    expect(calc.vendedor_principal_id).toBe("v-karol");
    expect(calc.transferencias).toBe(0);
  });
});

describe("calcularConversa — casos de borda", () => {
  const exp = CONFIG_PADRAO.expediente;
  it("conversa iniciada pelo agente (contato ativo) não tem 1ª resposta", () => {
    const c = normalizarConversaSz({ _id: "s2", events: [] }, [
      m("a", "agent", "2026-10-21 09:00:00.0", "Olá, tudo bem? Passando para saber do plano", "Karoline Xavier"),
      m("b", "channel", "2026-10-21 09:30:00.0", "oi, ainda estou pensando no plano"),
      m("c", "agent", "2026-10-21 09:35:00.0", "Sem problemas", "Karoline Xavier"),
    ], {});
    const r = calcularConversa(c, resolver, exp, segASab);
    expect(r.iniciada_por).toBe("agente");
    expect(r.primeira_resposta_em).toBeNull();
    expect(r.por_agente["v-karol"].gaps.map((g) => g[1])).toEqual([300]);
  });
  it("cliente na fila sem nenhum humano = sem resposta (abandono)", () => {
    const c = normalizarConversaSz(
      { _id: "s3", events: [{ event: "waitStart", created_at: "2026-10-21 09:00:00.0" }] },
      [m("a", "channel", "2026-10-21 08:59:00.0", "quero contratar a internet hoje")],
      {}
    );
    const r = calcularConversa(c, resolver, exp, segASab);
    expect(r.primeira_resposta_em).toBeNull();
    expect(r.cliente_sem_resposta).toBe(true);
  });
  it("cliente que desistiu ainda no robô (sem fila, sem humano) não é culpa do vendedor", () => {
    const c = normalizarConversaSz({ _id: "s4", events: [] }, [
      m("a", "channel", "2026-10-21 08:59:00.0", "segunda via do boleto por favor"),
      m("b", "auto", "2026-10-21 08:59:01.0", "Digite 1 para financeiro"),
    ], {});
    expect(calcularConversa(c, resolver, exp, segASab).cliente_sem_resposta).toBe(false);
  });
  it("conta transferências sem duplicar pedido/resposta", () => {
    const c = normalizarConversaSz(
      {
        _id: "s5",
        events: [
          { event: "agentRequestTransfer", created_at: "2026-10-21 09:00:00.0" },
          { event: "agentResponseTransfer", created_at: "2026-10-21 09:00:05.0" },
          { event: "humanTransferAgent", created_at: "2026-10-21 09:00:06.0" },
          { event: "humanTransfer", created_at: "2026-10-21 10:00:00.0" },
        ],
      },
      [],
      {}
    );
    expect(calcularConversa(c, resolver, exp, segASab).transferencias).toBe(2);
  });
  it("agente não mapeado fica identificado pelo nome, sem vendedor", () => {
    const c = normalizarConversaSz({ _id: "s6", events: [] }, [
      m("a", "channel", "2026-10-21 09:00:00.0", "boa tarde, queria um plano"),
      m("b", "agent", "2026-10-21 09:01:00.0", "Boa tarde!", "Fulano Novo"),
    ], {});
    const r = calcularConversa(c, resolver, exp, segASab);
    expect(r.primeira_resposta_vendedor_id).toBeNull();
    expect(Object.keys(r.por_agente)).toEqual(["nome:fulano novo"]);
  });
});
