import { describe, expect, it } from "vitest";
import { resolverEscopo, type CadastroGrr } from "./escopo";
import { montarGrr, type BaseGrr, type ContratoGrr, type TicketGrr } from "./montar";

const HOJE = "2026-11-18"; // quarta-feira
const ULTIMA = { inicio: "2026-11-09", fim: "2026-11-15" };
const expediente = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay() !== 0; // segunda a sábado

const CADASTRO: CadastroGrr = {
  pops: [
    { id: "alt", nome: "Altamira" },
    { id: "bn", nome: "Brasil Novo" },
  ],
  vendedores: [
    { id: "ana", nome: "Ana", pop_id: "alt", setor: "comercial_interno", ativo: true, eh_coordenador: false, coordenador_id: "coord" },
    { id: "bia", nome: "Bia", pop_id: "bn", setor: "comercial_externo", ativo: true, eh_coordenador: false, coordenador_id: null },
  ],
  equipes: [{ coordenadorId: "coord", nome: "Marcelo", vendedorIds: ["ana"] }],
};

let n = 0;
const venda = (dia: string, vendedor: string | null, pop: string, extra: Partial<ContratoGrr> = {}): ContratoGrr => ({
  id: `c${++n}`,
  sgp_contrato_id: String(23000 + n),
  data_venda: dia,
  data_assinatura: dia,
  data_ativacao: dia,
  data_cancelamento: null,
  motivo_cancelamento: null,
  status: "ativo",
  valor_mensalidade: 100,
  vendedor_id: vendedor,
  pop_id: pop,
  fora: null,
  ...extra,
});
const ticket = (id: string, vendedor: string, extra: Partial<TicketGrr>): TicketGrr => ({
  id,
  cliente_nome: `Cliente ${id}`,
  vendedor_id: vendedor,
  pop_id: vendedor === "bia" ? "bn" : "alt",
  origem_criacao: "sz_auto",
  etapa: "fechado",
  criado_em: "2026-11-10T13:00:00Z",
  primeira_tratativa_em: "2026-11-10T13:20:00Z",
  followup_em: null,
  followup_feito_em: null,
  fechado_em: "2026-11-12T15:00:00Z",
  desfecho: "convertido",
  contrato_id: null,
  reconciliado_em: null,
  atualizado_em: "2026-11-12T15:00:00Z",
  data_venda_contrato: null,
  motivos_nao_conversao: null,
  ...extra,
});

function base(): BaseGrr {
  n = 0;
  const vendas = [
    venda("2026-11-10", "ana", "alt"),
    venda("2026-11-12", "ana", "alt", { valor_mensalidade: 130 }),
    venda("2026-11-13", "bia", "bn", { data_assinatura: null, data_ativacao: null, status: "pendente_assinatura" }),
    venda("2026-11-11", null, "alt", { fora: "Prefeitura", valor_mensalidade: 900 }),
    venda("2026-11-04", "ana", "alt"), // semana anterior
    venda("2026-11-12", "bia", "bn", { status: "cancelado", data_ativacao: null, motivo_cancelamento: "Erro de cadastro" }), // 5.1: não conta
  ];
  return {
    vendas,
    ativados: vendas.filter((c) => c.data_ativacao),
    pendencias: vendas.filter((c) => c.status !== "cancelado" && (!c.data_assinatura || !c.data_ativacao)),
    osAbertas: [],
    ticketsAbertos: [ticket("t5", "bia", { etapa: "em_atendimento", desfecho: null, fechado_em: null, followup_em: "2026-11-17T12:00:00Z" })],
    ticketsFechados: [
      ticket("t1", "ana", {}),
      ticket("t2", "ana", { desfecho: "nao_convertido", motivos_nao_conversao: { nome: "Preço" } }),
      ticket("t3", "bia", { desfecho: "nao_convertido", motivos_nao_conversao: { nome: "Já é cliente da base" } }), // fora da conversão
      ticket("t4", "bia", { origem_criacao: "sgp_auto", data_venda_contrato: "2026-11-13" }),
    ],
    acoes: [
      { quando: "2026-11-16T12:00:00Z", concluida_em: null, vendedor_id: "ana", pop_id: "alt", ticketAberto: true }, // vencida
      { quando: "2026-11-12T12:00:00Z", concluida_em: "2026-11-12T18:00:00Z", vendedor_id: "ana", pop_id: "alt", ticketAberto: false }, // feita na semana
    ],
    metas: [
      { escopo: "vendedora", referencia_id: "ana", quantidade_vendas: 50 },
      { escopo: "vendedora", referencia_id: "bia", quantidade_vendas: 25 },
    ],
  };
}

const direcao = { perfil: "direcao" as const, pop_id: null };
const cartao = (d: ReturnType<typeof montarGrr>, chave: string) => d.cartoes.find((c) => c.chave === chave)!;

describe("montagem do GRR Comercial", () => {
  const d = montarGrr(base(), ULTIMA, resolverEscopo(direcao, null, {}, CADASTRO), CADASTRO, expediente, HOJE);

  it("vendas pela regra 5.1, sem Prefeitura e rede neutra", () => {
    expect(d.vendas.semana).toBe(3);
    expect(d.vendas.anterior).toBe(1);
    expect(d.vendas.foraSemana).toBe(1);
    expect(cartao(d, "vendas_semana").valor).toBe("3");
    expect(cartao(d, "vendas_semana").evolucao).toMatchObject({ direcao: "sobe", bom: true });
    expect(d.avisos.some((a) => a.includes("Prefeitura"))).toBe(true);
  });

  it("meta da empresa soma as unidades e a meta da semana segue os dias de expediente", () => {
    expect(d.vendas.metaMes).toBe(75);
    // novembro de 2026 tem 25 dias de segunda a sábado; a semana tem 6
    expect(d.vendas.metaSemana).toBeCloseTo((75 * 6) / 25, 5);
    expect(cartao(d, "vendas_semana").status).toBe("critico");
    expect(cartao(d, "vendas_mes").meta).toBe("meta 75");
  });

  it("receita e ticket médio pelas regras 5.2 e 5.3", () => {
    expect(d.receita.semana).toBe(330);
    expect(d.receita.ticket).toBeCloseTo(110, 5);
    expect(cartao(d, "ticket").valor).toBe("R$ 110,00");
  });

  it("conversão é a oficial do CRM: convertidos ÷ fechados, sem os motivos fora da conversão", () => {
    expect([d.conversao.convertidos, d.conversao.fechados]).toEqual([2, 3]);
    expect(d.conversao.taxa).toBeCloseTo(2 / 3, 5);
    expect(d.conversao.foraDaConversao).toBe(1);
    expect(d.conversao.convertidasSemLead).toBe(1);
    expect(cartao(d, "conversao").valor).toBe("67%");
  });

  it("perdidos, motivos e retornos", () => {
    expect(d.perdas.perdidos).toBe(1);
    expect(d.perdas.motivos).toEqual([{ motivo: "Preço", quantidade: 1 }]);
    expect(d.perdas.retornosVencidos).toBe(2); // o retorno do ticket da Bia e a ação agendada da Ana
    expect(d.perdas.retornosFeitosSemana).toBe(1);
    expect(d.perdas.primeiraRespostaMin).toBe(20);
  });

  it("ativações contam só as vendas do comercial", () => {
    expect(d.ativacoes.semana).toBe(2); // as duas da Ana; a da Prefeitura fica fora
    expect(d.ativacoes.receitaAtivada).toBe(230);
    expect(d.ativacoes.noDiaDaVenda).toBe(2);
  });

  it("avisa quando a data de ativação é quase sempre a da venda", () => {
    const b = base();
    b.vendas.push(...Array.from({ length: 4 }, () => venda("2026-11-14", "ana", "alt")));
    b.ativados = b.vendas.filter((c) => c.data_ativacao);
    const x = montarGrr(b, ULTIMA, resolverEscopo(direcao, null, {}, CADASTRO), CADASTRO, expediente, HOJE);
    expect(x.avisos.some((a) => a.startsWith("Ativações:"))).toBe(true);
    expect(cartao(x, "ativacoes_semana").contexto).toContain("igual à da venda");
    // com poucas ativações no trecho não há base para o aviso
    expect(d.avisos.some((a) => a.startsWith("Ativações:"))).toBe(false);
  });

  it("assinatura parada há 48h acende o farol", () => {
    expect(d.ativacoes.acima48hDaSemana).toBe(1);
    expect(cartao(d, "assinatura_48h").status).toBe("atencao");
  });

  it("quebras por unidade, equipe e agente somam o recorte", () => {
    expect(d.porUnidade.map((l) => [l.nome, l.vendas, l.metaMes])).toEqual([
      ["Altamira", 2, 50],
      ["Brasil Novo", 1, 25],
    ]);
    expect(d.porEquipe.map((l) => [l.nome, l.vendas, l.metaMes])).toEqual([["Marcelo", 2, 50]]);
    expect(d.porAgente.map((l) => [l.nome, l.vendas, l.convertidos, l.fechados])).toEqual([
      ["Ana", 2, 1, 2],
      ["Bia", 1, 1, 1],
    ]);
    expect(cartao(d, "agentes_com_venda").valor).toBe("2 de 2");
  });

  it("evolução traz as semanas da mais antiga para a mais recente", () => {
    expect(d.evolucao.at(-1)).toMatchObject({ inicio: "2026-11-09", vendas: 3 });
    expect(d.evolucao.at(-2)).toMatchObject({ inicio: "2026-11-02", vendas: 1 });
  });

  it("lista os tickets que compõem a semana, com a situação de cada um", () => {
    expect(d.tickets.map((t) => [t.id, t.situacao]).sort()).toEqual([
      ["t1", "convertido"],
      ["t2", "perdido"],
      ["t3", "fora"],
      ["t4", "convertido"],
      ["t5", "aberto"], // recebido na semana e ainda em negociação
    ]);
    expect(d.tickets.find((t) => t.id === "t4")!.semLead).toBe(true);
  });
});

describe("recorte por agente e por coordenação", () => {
  it("agente: só as vendas, os tickets e a meta dela", () => {
    const d = montarGrr(base(), ULTIMA, resolverEscopo(direcao, null, { agente: "bia" }, CADASTRO), CADASTRO, expediente, HOJE);
    expect(d.vendas.semana).toBe(1);
    expect(d.vendas.metaMes).toBe(25);
    expect([d.conversao.convertidos, d.conversao.fechados]).toEqual([1, 1]);
    expect(d.porEquipe).toEqual([]);
  });

  it("coordenação de unidade não recebe dado de outra unidade nem a quebra por equipe", () => {
    const d = montarGrr(base(), ULTIMA, resolverEscopo({ perfil: "supervisor", pop_id: "bn" }, null, {}, CADASTRO), CADASTRO, expediente, HOJE);
    expect(d.vendas.semana).toBe(1);
    expect(d.porUnidade.map((l) => l.nome)).toEqual(["Brasil Novo"]);
    expect(d.porAgente.map((l) => l.nome)).toEqual(["Bia"]);
    expect(d.porEquipe).toEqual([]);
    expect(d.tickets.every((t) => t.unidade === "Brasil Novo")).toBe(true);
  });

  it("semana em andamento compara com o mesmo trecho da anterior e avisa", () => {
    const d = montarGrr(base(), { inicio: "2026-11-16", fim: "2026-11-22" }, resolverEscopo(direcao, null, {}, CADASTRO), CADASTRO, expediente, HOJE);
    expect(d.trechos.emAndamento).toBe(true);
    expect(d.vendas.anterior).toBe(1); // 09 a 11/11: só a venda de 10/11 (a de 11/11 é da Prefeitura)
    expect(d.avisos[0]).toContain("Semana em andamento");
  });
});
