import type { DadosRelatorio, ItemPlacar, Status } from "./tipos";
import { dataBr, diaMes, diasEntre } from "./periodo";
import { dec1, lista, num, pct, plural, reais, reais2, sinal, variacao } from "./formato";

/**
 * Placar da semana: os dez indicadores do modelo aprovado pela diretoria,
 * com o status calculado pela plataforma (não pelo Claude). Os limites de
 * cada status estão aqui e no rodapé do relatório — mudar só aqui.
 *
 * Os sete primeiros o comercial controla; os três últimos dependem de
 * outras áreas, mas o diretor comercial leva o problema.
 */

export const DONOS = {
  comercial: "Paulo, diretor comercial",
  origem: "Paulo, diretor comercial, e Marketing",
  base: "CEO, Comercial e Financeiro",
  esteira: "Operações (instalação)",
  retencao: "Sandryne executa · Paulo cobra",
};

/** limites dos status — também impressos no rodapé do relatório */
export const LIMITES = {
  /** mês fechado: ok a partir de 100% da meta; atenção a partir de 90% */
  mesAtencao: 0.9,
  /** semana e mês aberto: ok no ritmo da meta; atenção a partir de 85% dele */
  ritmoAtencao: 0.85,
  /** % das vendas sem consulta de crédito: ok até 2%, atenção até 10% */
  consultaOk: 0.02,
  consultaAtencao: 0.1,
  /** assinaturas da semana paradas há 48h ou mais: ok com 0, atenção até 3 */
  assinaturaAtencao: 3,
  /** top 3 com esta fatia da semana (ou mais) acende atenção */
  concentracaoAtencao: 0.85,
  /** % das vendas com origem preenchida: ok a partir de 95%, atenção de 70% */
  origemOk: 0.95,
  origemAtencao: 0.7,
  /** instalações paradas há mais de 7 dias: atenção até 5 */
  esteiraCritico: 5,
  /** % da fila de débito contatada em 7 dias: ok a partir de 90%, atenção de 50% */
  filaOk: 0.9,
  filaAtencao: 0.5,
};

type Dados = Omit<DadosRelatorio, "placar">;

const faixa = (v: number, ok: number, atencao: number): Status => (v >= ok ? "ok" : v >= atencao ? "atencao" : "critico");

/** dias de expediente na semana (os que entram na meta diária) */
const expedienteSemana = (d: Dados) => d.vendas.porDia.filter((x) => x.expediente).length;

function vendasDoMes(d: Dados): ItemPlacar {
  const v = d.vendas;
  const m = d.leitura.mes;
  const fechado = m.fechado;
  const semVend =
    (v.semVendedorMes > 0 ? ` Os vendedores somam ${num(v.mes - v.semVendedorMes)}: ${plural(v.semVendedorMes, "venda está", "vendas estão")} sem vendedor.` : "") +
    (v.fora.mes > 0
      ? ` O Dashboard mostra ${num(v.mes + v.fora.mes)}, com ${lista(Object.entries(v.fora.mesPorTipo).map(([tipo, n]) => `${num(n)} ${tipo === "Prefeitura" ? "da Prefeitura" : "de rede neutra"}`))}, ${v.fora.mes === 1 ? "que fica fora" : "que ficam fora"} das vendas do comercial.`
      : "");
  let status: Status = "sem_meta";
  let meta = "Sem meta cadastrada";
  let metaDetalhe = `Cadastre a meta de ${m.nome} na plataforma para ter ritmo e cobrança.${semVend}`;
  if (v.metaMes) {
    if (fechado) {
      const at = v.mes / v.metaMes;
      status = at >= 1 ? "ok" : at >= LIMITES.mesAtencao ? "atencao" : "critico";
      meta = `${num(v.metaMes)} (${pct(at)} atingido)`;
      metaDetalhe = (v.mes >= v.metaMes ? `Meta batida com ${num(v.mes - v.metaMes)} acima.` : `Faltaram ${num(v.metaMes - v.mes)} vendas.`) + semVend;
    } else {
      const esperado = (v.metaMes * v.diasExpedienteDecorridos) / Math.max(1, v.diasExpedienteMes);
      const ritmo = esperado ? v.mes / esperado : 0;
      status = faixa(ritmo, 1, LIMITES.ritmoAtencao);
      meta = `${num(v.metaMes)} no mês`;
      metaDetalhe = `Esperado até ${diaMes(d.leitura.semana.fim)}: ${num(Math.round(esperado))} (${v.diasExpedienteDecorridos} de ${v.diasExpedienteMes} dias de expediente). Realizado é ${pct(ritmo)} do esperado.${semVend}`;
    }
  }
  const comparacao = fechado
    ? `${variacao(v.mes, v.mesAnterior)} de ${d.leitura.mesAnterior.nome} (${num(v.mesAnterior)})`
    : `${d.leitura.mesAnterior.nome} fechou com ${num(v.mesAnterior)}`;
  return {
    chave: "vendas_mes",
    grupo: "comercial",
    status,
    indicador: "Vendas do mês",
    subtitulo: fechado ? `${m.nome} fechado contra a meta` : `${m.nome} até ${diaMes(d.leitura.semana.fim)} contra a meta`,
    realizado: `${plural(v.mes, "venda", "vendas")}`,
    realizadoDetalhe: `${reais(v.receitaMes)} contratados · ${comparacao}.`,
    meta,
    metaDetalhe,
    dono: DONOS.comercial,
  };
}

function vendasDaSemana(d: Dados): ItemPlacar {
  const v = d.vendas;
  const dias = expedienteSemana(d);
  const porDia = dias ? v.semana / dias : 0;
  const comExp = v.porDia.filter((x) => x.expediente);
  let status: Status = "sem_meta";
  let meta = "Sem meta cadastrada";
  let metaDetalhe = "Sem meta do mês não há meta diária.";
  if (v.metaDiaria) {
    const bateu = comExp.filter((x) => x.vendas >= v.metaDiaria!);
    status = faixa(v.semana / (v.metaDiaria * Math.max(1, dias)), 1, LIMITES.ritmoAtencao);
    meta = `${dec1(v.metaDiaria)} por dia`;
    const pior = [...comExp].sort((a, b) => a.vendas - b.vendas)[0];
    metaDetalhe = `Bateu a meta em ${bateu.length} dos ${comExp.length} dias de expediente.${pior && pior.vendas < v.metaDiaria ? ` ${pior.rotulo} fez ${num(pior.vendas)}.` : ""}`;
  }
  const melhor = [...comExp].sort((a, b) => b.vendas - a.vendas)[0];
  return {
    chave: "vendas_semana",
    grupo: "comercial",
    status,
    indicador: "Vendas da semana",
    subtitulo: "ritmo por dia de expediente",
    realizado: `${plural(v.semana, "venda", "vendas")} (${variacao(v.semana, v.semanaAnterior)} da semana anterior, ${num(v.semanaAnterior)})`,
    realizadoDetalhe: `${dec1(porDia)} por dia em ${dias} dias de expediente.${melhor ? ` Melhor dia: ${melhor.rotulo}, com ${num(melhor.vendas)}.` : ""}`,
    meta,
    metaDetalhe,
    dono: DONOS.comercial,
  };
}

function receitaTicket(d: Dados): ItemPlacar {
  const v = d.vendas;
  const foraValor = v.fora.semana.reduce((t, x) => t + x.valor, 0);
  const fora = v.fora.semana.length
    ? ` Fora da conta: ${plural(v.fora.semana.length, "contrato", "contratos")} de ${lista([...new Set(v.fora.semana.map((x) => x.tipo))])} (${reais(foraValor)}), que o Dashboard soma.`
    : "";
  return {
    chave: "receita_ticket",
    grupo: "comercial",
    status: "sem_meta",
    indicador: "Receita nova e ticket médio",
    subtitulo: "quanto cada venda vale",
    realizado: `${reais(v.receitaSemana)} na semana · ticket ${v.ticketSemana != null ? reais2(v.ticketSemana) : "—"}`,
    realizadoDetalhe: `Mês: ${reais(v.receitaMes)} · ticket ${v.ticketMes != null ? reais2(v.ticketMes) : "—"}.${fora}`,
    meta: "Não há meta de ticket",
    metaDetalhe:
      v.ticketSemanaAnterior != null && v.ticketSemana != null
        ? `Ticket de ${reais2(v.ticketSemanaAnterior)} na semana anterior e ${reais2(v.ticketSemana)} nesta. Definir meta de ticket e de mix.`
        : "Definir meta de ticket e de mix.",
    dono: DONOS.comercial,
  };
}

function consultaCredito(d: Dados): ItemPlacar {
  const c = d.consulta;
  const fracao = c.vendasSemana ? c.semConsultaSemana / c.vendasSemana : 0;
  const status: Status = !c.vendasSemana ? "ok" : fracao <= LIMITES.consultaOk ? "ok" : fracao <= LIMITES.consultaAtencao ? "atencao" : "critico";
  const porVend = d.vendas.porVendedor
    .filter((x) => x.semConsultaSemana > 0)
    .sort((a, b) => b.semConsultaSemana - a.semConsultaSemana)
    .map((x) => `${x.nome} ${num(x.semConsultaSemana)} (em ${num(x.vendasSemana)})`);
  return {
    chave: "consulta",
    grupo: "comercial",
    status,
    indicador: "Consulta de crédito feita",
    subtitulo: "antes de assinar o contrato",
    realizado: c.vendasSemana
      ? `${pct(1 - fracao)} das vendas da semana com consulta (${num(c.semConsultaSemana)} de ${num(c.vendasSemana)} sem)`
      : "Sem vendas na semana",
    realizadoDetalhe: porVend.length ? `Sem consulta por vendedor: ${lista(porVend)}.` : "Nenhuma venda da semana sem consulta.",
    meta: "100% das vendas",
    metaDetalhe: `No mês, ${plural(c.semConsultaMes, "venda sem consulta", "vendas sem consulta")}.`,
    dono: DONOS.comercial,
  };
}

function assinatura(d: Dados): ItemPlacar {
  const a = d.assinatura;
  const status: Status = a.acima48hSemana === 0 ? "ok" : a.acima48hSemana <= LIMITES.assinaturaAtencao ? "atencao" : "critico";
  const acima = a.pendentesSemana.filter((p) => p.idadeDias >= 2);
  const porVend = new Map<string, number>();
  for (const p of acima) porVend.set(p.vendedor ?? "sem vendedor", (porVend.get(p.vendedor ?? "sem vendedor") ?? 0) + 1);
  const maisVelho = acima.reduce((m, p) => Math.max(m, p.idadeDias), 0);
  return {
    chave: "assinatura",
    grupo: "comercial",
    status,
    indicador: "Assinatura em até 48h",
    subtitulo: "contratos parados",
    realizado: `${plural(a.acima48hSemana, "contrato", "contratos")} das vendas da semana há 48h ou mais sem assinar`,
    realizadoDetalhe:
      (acima.length
        ? `${lista([...porVend].sort((x, y) => y[1] - x[1]).map(([n, q]) => `${n} ${num(q)}`))}. O mais antigo tem ${plural(maisVelho, "dia", "dias")}. `
        : "") + `De vendas antigas, ${plural(a.antigasSemAssinar, "contrato segue", "contratos seguem")} sem assinar.`,
    meta: "0 acima de 48h",
    metaDetalhe: a.pendentesSemana.length > acima.length ? `${num(a.pendentesSemana.length - acima.length)} da semana ainda dentro das 48h.` : "",
    dono: DONOS.comercial,
  };
}

function time(d: Dados): ItemPlacar {
  const vend = d.vendas.porVendedor;
  const zeradosMes = vend.filter((x) => (x.metaMes ?? 0) > 0 && x.vendasMes === 0).map((x) => x.nome);
  const zeradosSemana = vend.filter((x) => x.vendasSemana === 0).map((x) => x.nome);
  const comVendedor = vend.reduce((s, x) => s + x.vendasSemana, 0);
  const top3 = [...vend].sort((a, b) => b.vendasSemana - a.vendasSemana).slice(0, 3);
  const top3n = top3.reduce((s, x) => s + x.vendasSemana, 0);
  const fatia = comVendedor ? top3n / comVendedor : 0;
  const status: Status = zeradosMes.length >= 2 ? "critico" : zeradosMes.length === 1 || fatia >= LIMITES.concentracaoAtencao ? "atencao" : "ok";
  const somaMetas = vend.reduce((s, x) => s + (x.metaMes ?? 0), 0);
  const metas = d.vendas.metaMes && somaMetas && somaMetas !== d.vendas.metaMes
    ? `As metas individuais de ${d.leitura.mes.nome} somam ${num(somaMetas)} contra ${num(d.vendas.metaMes)} da meta geral.`
    : somaMetas ? "" : `Metas individuais de ${d.leitura.mes.nome} não cadastradas.`;
  return {
    chave: "time",
    grupo: "comercial",
    status,
    indicador: "Time: zerados e concentração",
    subtitulo: "quem vende e quem não vende",
    realizado: zeradosMes.length
      ? `${plural(zeradosMes.length, "vendedor com meta e 0 venda", "vendedores com meta e 0 venda")} no mês`
      : "Nenhum vendedor com meta zerado no mês",
    realizadoDetalhe:
      (zeradosMes.length ? `${lista(zeradosMes)}. ` : "") +
      (zeradosSemana.length ? `Na semana, ${plural(zeradosSemana.length, "vendedor ficou zerado", "vendedores ficaram zerados")} (${lista(zeradosSemana)}). ` : "") +
      (comVendedor ? `Top 3 fizeram ${pct(fatia)} da semana (${num(top3n)} de ${num(comVendedor)}: ${lista(top3.map((x) => x.nome))}).` : ""),
    meta: "0 zerados",
    metaDetalhe: metas,
    dono: DONOS.comercial,
  };
}

function origem(d: Dados): ItemPlacar {
  const o = d.vendas.origem;
  const outroSemana = o.filter((x) => /^(outro|sem origem)$/i.test(x.nome)).reduce((s, x) => s + x.semana, 0);
  const outroMes = o.filter((x) => /^(outro|sem origem)$/i.test(x.nome)).reduce((s, x) => s + x.mes, 0);
  const preenchida = d.vendas.semana ? 1 - outroSemana / d.vendas.semana : 1;
  const principais = [...o].filter((x) => !/^(outro|sem origem)$/i.test(x.nome) && x.semana > 0).sort((a, b) => b.semana - a.semana).slice(0, 3);
  return {
    chave: "origem",
    grupo: "comercial",
    status: faixa(preenchida, LIMITES.origemOk, LIMITES.origemAtencao),
    indicador: "Origem da venda",
    subtitulo: "funil e canal",
    realizado: `${pct(preenchida)} com origem preenchida (${num(outroSemana)} de ${num(d.vendas.semana)} como "Outro" na semana; ${num(outroMes)} de ${num(d.vendas.mes)} no mês)`,
    realizadoDetalhe: principais.length ? `Principais canais da semana: ${lista(principais.map((x) => `${x.nome} ${num(x.semana)}`))}.` : "Não dá para saber qual campanha ou canal vendeu.",
    meta: "100% com origem preenchida",
    metaDetalhe: "Sem origem não existe custo por venda.",
    dono: DONOS.origem,
  };
}

function base(d: Dados): ItemPlacar {
  const b = d.base;
  const semanas = Math.max(1, b.diasRestantes / 7);
  const porSemana = b.faltam > 0 ? Math.ceil(b.faltam / semanas) : 0;
  const varSemana = b.ativosAnterior != null ? b.ativos - b.ativosAnterior : null;
  const status: Status = b.faltam <= 0 ? "ok" : varSemana == null ? "atencao" : varSemana >= porSemana ? "ok" : varSemana > 0 ? "atencao" : "critico";
  const porPraca = b.porPracaAnterior
    ? b.porPraca.map((p) => `${p.nome} ${sinal(p.ativos - (b.porPracaAnterior!.find((x) => x.nome === p.nome)?.ativos ?? p.ativos))}`)
    : [];
  return {
    chave: "base",
    grupo: "outras",
    status,
    indicador: "Crescimento líquido da base",
    subtitulo: "entradas menos saídas",
    realizado: `${num(b.ativos)} ativos (${dec1((b.ativos / b.meta) * 100)}% de ${num(b.meta)})`,
    realizadoDetalhe:
      (varSemana != null
        ? `${varSemana >= 0 ? "Subiu" : "Caiu"} ${num(Math.abs(varSemana))} em relação aos ${num(b.ativosAnterior!)} do relatório anterior${porPraca.length ? ` (${lista(porPraca)})` : ""}. `
        : "Primeiro relatório: a variação da semana aparece a partir do próximo. ") +
      `Na semana: ${plural(d.esteira.ativacoesSemana, "ativação", "ativações")} e ${plural(d.esteira.cancelamentosSemana, "cancelamento", "cancelamentos")}. ` +
      `Mais ${plural(b.suspensos, "suspenso", "suspensos")} por débito, que ${b.suspensos === 1 ? "volta" : "voltam"} ao pagar` +
      (b.fechamento ? `; ${b.fechamento.mes} fechou com ${num(b.fechamento.ativos)} ativos e ${num(b.fechamento.suspensos)} suspensos.` : "."),
    meta: `${num(b.meta)} até ${dataBr(b.prazo)}`,
    metaDetalhe: b.faltam > 0 ? `Faltam ${num(b.faltam)} em ${plural(b.diasRestantes, "dia", "dias")}: cerca de ${num(porSemana)} líquidos por semana.` : "Meta do ano alcançada.",
    dono: DONOS.base,
  };
}

function esteira(d: Dados): ItemPlacar {
  const e = d.esteira;
  const status: Status = e.paradasMais7Dias > LIMITES.esteiraCritico ? "critico" : e.paradasMais7Dias > 0 || e.antigasAguardando > 0 ? "atencao" : "ok";
  return {
    chave: "esteira",
    grupo: "outras",
    status,
    indicador: "Esteira de ativação",
    subtitulo: "da venda à instalação",
    realizado:
      e.diasVendaAtivacao != null
        ? `${dec1(e.diasVendaAtivacao)} ${e.diasVendaAtivacao < 2 ? "dia" : "dias"} da venda à ativação (${plural(e.ativacoesSemana, "ativação", "ativações")} na semana)`
        : `${plural(e.ativacoesSemana, "ativação", "ativações")} na semana`,
    realizadoDetalhe: `${plural(e.aguardandoSemana, "venda da semana aguarda", "vendas da semana aguardam")} instalação. De vendas antigas, ${plural(e.antigasAguardando, "segue", "seguem")} aguardando instalação.`,
    meta: "0 paradas há mais de 7 dias",
    metaDetalhe: e.paradasMais7Dias
      ? `${plural(e.paradasMais7Dias, "instalação parada", "instalações paradas")} há mais de 7 dias (vendas dos últimos 60 dias).`
      : "Nenhuma instalação parada há mais de 7 dias nas vendas dos últimos 60 dias.",
    dono: DONOS.esteira,
  };
}

function debito(d: Dados): ItemPlacar {
  const f = d.debito;
  const contatados = f.clientes ? f.contatados7d / f.clientes : 1;
  return {
    chave: "debito",
    grupo: "outras",
    status: f.clientes === 0 ? "ok" : faixa(contatados, LIMITES.filaOk, LIMITES.filaAtencao),
    indicador: "Fila de débito (retenção)",
    subtitulo: "clientes perto de cancelar",
    realizado: `${plural(f.clientes, "cliente", "clientes")} · ${reais(f.emRisco)}/mês em risco`,
    realizadoDetalhe:
      (f.anterior
        ? `Eram ${num(f.anterior.clientes)} e ${reais(f.anterior.emRisco)} no relatório anterior (${sinal(f.clientes - f.anterior.clientes)} clientes, ${f.emRisco >= f.anterior.emRisco ? "+" : "−"}${reais(Math.abs(f.emRisco - f.anterior.emRisco))}). `
        : "") + `${plural(f.contatados7d, "cliente contatado", "clientes contatados")} nos últimos 7 dias (${pct(contatados)} da fila).`,
    meta: "100% contatados na semana",
    metaDetalhe: `Boleto vencido há mais de 15 dias: ${reais(f.emAberto)} em aberto em ${plural(f.boletos, "boleto", "boletos")}.`,
    dono: DONOS.retencao,
  };
}

export function montarPlacar(d: Dados): ItemPlacar[] {
  return [vendasDoMes(d), vendasDaSemana(d), receitaTicket(d), consultaCredito(d), assinatura(d), time(d), origem(d), base(d), esteira(d), debito(d)];
}

export function contagemStatus(placar: ItemPlacar[]): Record<Status, number> {
  const c: Record<Status, number> = { ok: 0, atencao: 0, critico: 0, sem_meta: 0 };
  for (const p of placar) c[p.status]++;
  return c;
}

export const ROTULO_STATUS: Record<Status, string> = { ok: "Ok", atencao: "Atenção", critico: "Crítico", sem_meta: "Sem meta" };

/** dias entre a venda e hoje (idade de um pendente) — reexportado para os testes */
export const idadeEmDias = (venda: string, hoje: string) => diasEntre(venda, hoje);
