import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO } from "../config";
import { segASab } from "../expediente";
import type { BaseDados, ContratoBase, ConversaBase, TicketBase, VendedorBase } from "./base";
import { calcularLinha, calcularTotais, diaReferenciaFechamento, indexar, metaProporcional, ordenarRanking } from "./calcular";

const v = (id: string, extra: Partial<VendedorBase> = {}): VendedorBase => ({
  id, nome: id.toUpperCase(), setor: "comercial_interno", pop_id: "pop", pop_nome: "Altamira", coordenador_id: null, coordenador_nome: null,
  foto_url: null, ativo: true, eh_coordenador: false, admitido_em: null, ...extra,
});
const t = (id: string, extra: Partial<TicketBase> = {}): TicketBase => ({
  id, cliente_nome: null, vendedor_id: "ana", pop_id: "pop", etapa: "em_atendimento", desfecho: null, origem_criacao: "sz_auto", criado_em: "2026-10-05T10:00:00-03:00",
  fechado_em: null, followup_em: null, telefone: "93991230000", contrato_id: null, data_venda_contrato: null, urgencia: null, valor_estimado: null,
  reaberto_de_id: null, motivo_id: null, etapa_encerramento: null, plano_id: null, ...extra,
});
const conversa = (id: string, extra: Partial<ConversaBase> = {}): ConversaBase => ({
  id, ticket_id: null, vendedor_id: null, pop_id: null, canal: null, equipe: null, iniciada_por: "cliente", iniciada_em: "2026-10-05T10:00:00-03:00",
  finalizada_em: "2026-10-05T11:00:00-03:00", primeira_resposta_em: null, primeira_resposta_vendedor_id: null, primeira_resposta_seg: null,
  primeira_resposta_util_seg: null, cliente_sem_resposta: false, msgs_cliente: 0, msgs_agente: 0, msgs_automacao: 0, por_agente: {}, cliente_por_dia: {},
  status_final: null, ...extra,
});
const contrato = (id: string, extra: Partial<ContratoBase> = {}): ContratoBase => ({
  id, vendedor_id: "ana", pop_id: "pop", plano_id: null, data_venda: "2026-10-10", data_assinatura: null, data_ativacao: null, data_cancelamento: null,
  motivo_cancelamento: null, status: "aguardando_ativacao", valor_mensalidade: 100, origem_cadastro: null, ...extra,
});

function base(extra: Partial<BaseDados> = {}): BaseDados {
  return {
    hoje: "2026-10-24", agoraMs: Date.parse("2026-10-24T12:00:00-03:00"), cfg: CONFIG_PADRAO, ehDiaUtil: segASab,
    vendedores: [v("ana"), v("bia")], tickets: [], reatribuicoes: new Map(), acoes: [], conversas: [], followups: [], contratos: [],
    titulosPrimeira: [], osAgendadas: new Set(), metas: [], indisponibilidades: [], analises: [], propostas: [], motivos: new Map(), planos: new Map(), ...extra,
  };
}

describe("apuração por vendedor", () => {
  it("lead que mudou de mãos: os dois recebem; esforço é de quem agiu", () => {
    const b = base({
      tickets: [t("L1", { vendedor_id: "bia" })],
      reatribuicoes: new Map([["L1", [{ em: "2026-10-08T09:00:00-03:00", de: "ana", para: "bia" }]]]),
      acoes: [
        { ticketId: "L1", vendedorId: "ana", em: Date.parse("2026-10-06T10:00:00-03:00"), fonte: "tratativa" },
        { ticketId: "L1", vendedorId: "bia", em: Date.parse("2026-10-09T10:00:00-03:00"), fonte: "proposta" },
      ],
    });
    const idx = indexar(b);
    const ana = calcularLinha(b, idx, b.vendedores[0], "2026-10-01", "2026-10-07");
    const bia = calcularLinha(b, idx, b.vendedores[1], "2026-10-01", "2026-10-07");
    expect(ana.numeros.leadsRecebidos).toBe(1);
    expect(ana.numeros.leadsTrabalhados).toBe(1);
    expect(bia.numeros.leadsRecebidos).toBe(0); // recebeu só no dia 8
    const biaDepois = calcularLinha(b, idx, b.vendedores[1], "2026-10-08", "2026-10-10");
    expect(biaDepois.numeros.leadsRecebidos).toBe(1);
    expect(biaDepois.numeros.leadsTrabalhados).toBe(1);
  });

  it("ação do robô/rotina (sem usuário) não entra; tickets do SGP não são leads", () => {
    const b = base({ tickets: [t("L1"), t("S1", { origem_criacao: "sgp_auto", etapa: "fechado", desfecho: "convertido", fechado_em: "2026-10-06T10:00:00-03:00" })] });
    const linha = calcularLinha(b, indexar(b), b.vendedores[0], "2026-10-01", "2026-10-24");
    expect(linha.numeros.leadsRecebidos).toBe(1);
    expect(linha.numeros.leadsTrabalhados).toBe(0);
    expect(linha.resultado.indicadores.conversao.denominador).toBe(0);
  });

  it("chat: 1ª resposta e tempos só do próprio vendedor e dentro do período", () => {
    const b = base({
      conversas: [
        conversa("c1", {
          ticket_id: "L1", vendedor_id: "ana", primeira_resposta_em: "2026-10-05T10:05:00-03:00", primeira_resposta_vendedor_id: "ana",
          primeira_resposta_seg: 300, primeira_resposta_util_seg: 300,
          por_agente: { ana: { vendedor_id: "ana", agente_nome: "Ana", msgs: 4, msgs_por_dia: { "2026-10-05": 4 }, respostas: 1, gaps: [[Date.parse("2026-10-05T10:30:00-03:00") / 1000, 120, 120]], primeira_msg_em: "2026-10-05T10:05:00-03:00", ultima_msg_em: "2026-10-05T10:40:00-03:00" } },
          cliente_por_dia: { "2026-10-05": 5 },
        }),
        conversa("c2", { primeira_resposta_em: "2026-09-20T10:05:00-03:00", primeira_resposta_vendedor_id: "ana", primeira_resposta_util_seg: 9999, primeira_resposta_seg: 9999 }),
      ],
      tickets: [t("L1")],
    });
    const linha = calcularLinha(b, indexar(b), b.vendedores[0], "2026-10-01", "2026-10-24");
    expect(linha.esforco.indicadores.tempo_primeira_resposta.valor).toBe(300);
    expect(linha.esforco.indicadores.tempo_primeira_resposta.denominador).toBe(1); // a de setembro fica fora
    expect(linha.esforco.indicadores.mensagens_enviadas.valor).toBe(4);
    expect(linha.esforco.indicadores.mensagens_recebidas.valor).toBe(5);
    expect(linha.numeros.leadsTrabalhados).toBe(1);
    expect(linha.flags.temCanalChat).toBe(true);
  });

  it("vendedor sem chat (venda externa) não é avaliado por SLA de chat", () => {
    const b = base({ vendedores: [v("jes", { setor: "comercial_externo" })] });
    const linha = calcularLinha(b, indexar(b), b.vendedores[0], "2026-10-01", "2026-10-24");
    expect(linha.flags.temCanalChat).toBe(false);
    expect(linha.esforco.indicadores.sla_primeira_resposta.motivo).toBe("nao_aplicavel");
  });

  it("vendas canceladas por erro de cadastro não contam; conversão pela data da venda", () => {
    const b = base({
      contratos: [contrato("k1"), contrato("k2", { status: "cancelado", motivo_cancelamento: "Erro de cadastro" }), contrato("k3", { data_venda: "2026-09-30" })],
      tickets: [
        t("L1", { etapa: "fechado", desfecho: "convertido", fechado_em: "2026-10-02T10:00:00-03:00", data_venda_contrato: "2026-09-30" }),
        t("L2", { etapa: "fechado", desfecho: "nao_convertido", fechado_em: "2026-10-03T10:00:00-03:00", motivo_id: "m" }),
      ],
    });
    const linha = calcularLinha(b, indexar(b), b.vendedores[0], "2026-10-01", "2026-10-24");
    expect(linha.numeros.vendas).toBe(1);
    expect(linha.numeros.receitaNova).toBe(100);
    expect(diaReferenciaFechamento(b.tickets[0])).toBe("2026-09-30");
    expect(linha.resultado.indicadores.conversao.denominador).toBe(1); // o convertido conta em setembro
  });

  it("meta proporcional desconta dias úteis de férias", () => {
    // outubro/2026 tem 27 dias úteis (seg–sáb, 4 domingos); meta 27 → 1/dia útil
    const b = base({
      metas: [{ vendedor_id: "ana", mes_ano: "2026-10-01", quantidade_vendas: 27, receita: null }],
      indisponibilidades: [{ vendedor_id: "ana", inicio: "2026-10-05", fim: "2026-10-10", tipo: "ferias" }],
    });
    expect(metaProporcional(b, "ana", "2026-10-01", "2026-10-10").vendas).toBe(3); // 9 úteis − 6 de férias
    expect(metaProporcional(b, "bia", "2026-10-01", "2026-10-10").vendas).toBeNull(); // sem meta
  });

  it("coorte sem maturidade: qualidade em maturação e IPC provisório", () => {
    const b = base({ contratos: [contrato("k1", { data_venda: "2026-10-01", data_ativacao: "2026-10-05" })] });
    const linha = calcularLinha(b, indexar(b), b.vendedores[0], "2026-10-01", "2026-10-24");
    expect(linha.qualidade.indicadores.qualidade_vendas.motivo).toBe("em_maturacao");
    expect(linha.ipc.provisorio).toBe(true);
  });

  it("lead aberto sem ação e sem retorno agendado há mais de 24h úteis = sem retorno; com retorno futuro, não", () => {
    const b = base({
      tickets: [t("L1", { criado_em: "2026-10-19T10:00:00-03:00" }), t("L2", { criado_em: "2026-10-19T10:00:00-03:00", followup_em: "2026-10-26T09:00:00-03:00" })],
    });
    const linha = calcularLinha(b, indexar(b), b.vendedores[0], "2026-10-01", "2026-10-24");
    expect(linha.numeros.leadsSemRetorno).toBe(1);
  });

  it("ranking só compara a mesma função e deixa coordenação e rampa de fora", () => {
    const b = base({
      vendedores: [v("ana"), v("bia"), v("coord", { eh_coordenador: true }), v("nova", { admitido_em: "2026-10-15" }), v("ext", { setor: "comercial_externo" })],
      tickets: [t("L1", { etapa: "fechado", desfecho: "convertido", fechado_em: "2026-10-05T10:00:00-03:00" })],
    });
    const idx = indexar(b);
    const linhas = ordenarRanking(b.vendedores.map((x) => calcularLinha(b, idx, x, "2026-10-01", "2026-10-24")));
    const pos = Object.fromEntries(linhas.map((l) => [l.vendedor.id, l.posicao]));
    expect(pos.coord).toBeNull();
    expect(pos.nova).toBeNull();
    expect(linhas.find((l) => l.vendedor.id === "nova")!.flags.motivoNaoComparavel).toContain("rampa");
    const totais = calcularTotais(b, idx, linhas, "2026-10-01", "2026-10-24", { incluirSemDono: true });
    expect(totais.leadsRecebidos).toBe(1);
  });
});
