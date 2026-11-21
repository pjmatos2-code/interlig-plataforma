import type { DadosGrr, LinhaQuebra } from "./montar";

/**
 * Conferência dos dados do GRR (Etapa 5): verificações de consistência dos
 * números de uma semana, sem calcular indicador de novo. Compara o que o GRR
 * já montou (lib/grr/montar.ts) entre si e com as outras fontes da
 * plataforma (CRM, Relatório da diretoria e a semana congelada).
 */

export type StatusVerificacao = "ok" | "atencao" | "erro" | "info";
export type Verificacao = { chave: string; grupo: "somas" | "leads" | "vendas" | "fontes"; titulo: string; status: StatusVerificacao; valor: string; detalhe: string };

export type ExtrasConferencia = {
  /** tickets fechados como convertidos no trecho sem contrato ligado */
  convertidosSemContrato: number;
  /** leads que mudaram de agente no trecho e, desses, os convertidos por agente diferente do primeiro */
  reatribuidos: { leads: number; convertidosPorOutro: number };
  /** vendas da semana no Relatório da diretoria (null: relatório não gerado) */
  relatorioVendas: number | null;
  /** a semana congelada (null: sem foto) */
  foto: { versao: number; vendas: number; convertidos: number; recebidos: number } | null;
};

const n = (v: number) => v.toLocaleString("pt-BR");
const soma = (linhas: LinhaQuebra[], k: keyof Pick<LinhaQuebra, "vendas" | "fechados" | "convertidos" | "recebidos" | "ativacoes">) => linhas.reduce((t, l) => t + l[k], 0);

/** agentes com número impossível: mais convertidos que atendidos, ou mais convertidos que fechados */
export function agentesImpossiveis(linhas: LinhaQuebra[]): string[] {
  return linhas.filter((l) => l.safraConvertidos > l.safraAtendidos || l.convertidos > l.fechados || (l.safraTaxa ?? 0) > 1 || (l.conversao ?? 0) > 1).map((l) => l.nome);
}

export function conferirSemana(d: DadosGrr, x: ExtrasConferencia): Verificacao[] {
  const v: Verificacao[] = [];
  const confere = (chave: string, grupo: Verificacao["grupo"], titulo: string, total: number, partes: number, oQue: string) =>
    v.push({
      chave,
      grupo,
      titulo,
      status: total === partes ? "ok" : "erro",
      valor: total === partes ? n(total) : `${n(partes)} ≠ ${n(total)}`,
      detalhe: total === partes ? `A soma por ${oQue} bate com o total.` : `A soma por ${oQue} (${n(partes)}) não bate com o total (${n(total)}).`,
    });

  // ---------- somas ----------
  confere("soma_vendas_agente", "somas", "Vendas: soma por agente", d.vendas.semana, soma(d.porAgente, "vendas"), "agente (com a linha Sem agente)");
  confere("soma_vendas_unidade", "somas", "Vendas: soma por unidade", d.vendas.semana, soma(d.porUnidade, "vendas"), "unidade (com a linha Sem unidade)");
  confere("soma_fechados_agente", "somas", "Tickets fechados: soma por agente", d.conversao.fechados, soma(d.porAgente, "fechados"), "agente");
  confere("soma_convertidos_agente", "somas", "Convertidos do CRM: soma por agente", d.conversao.convertidos, soma(d.porAgente, "convertidos"), "agente");
  const safraPartes = d.porAgente.reduce((t, l) => t + l.safraConvertidos, 0);
  v.push({
    chave: "soma_safra_agente",
    grupo: "somas",
    titulo: "Conversão por safra: soma por agente",
    status: safraPartes === d.conversao.safra.convertidos ? "ok" : "info",
    valor: safraPartes === d.conversao.safra.convertidos ? n(safraPartes) : `${n(safraPartes)} × ${n(d.conversao.safra.convertidos)}`,
    detalhe:
      safraPartes === d.conversao.safra.convertidos
        ? "Os leads convertidos por agente somam o total."
        : "Diferença esperada quando um mesmo lead passou por mais de um agente: na conta por agente ele aparece com cada um; no total, uma vez só.",
  });
  const impossiveis = agentesImpossiveis(d.porAgente);
  v.push({
    chave: "taxas_possiveis",
    grupo: "somas",
    titulo: "Taxas de conversão por agente",
    status: impossiveis.length ? "erro" : "ok",
    valor: impossiveis.length ? `${impossiveis.length} com erro` : "ok",
    detalhe: impossiveis.length ? `Mais convertidos que atendidos ou que fechados: ${impossiveis.join(", ")}.` : "Nenhum agente com mais convertidos que atendidos ou que fechados.",
  });

  // ---------- leads ----------
  const semAtendimentoSemana = Math.max(0, d.conversao.safra.leads - d.conversao.safra.atendidos);
  v.push({
    chave: "leads_sem_atendimento",
    grupo: "leads",
    titulo: "Leads da semana sem atendimento",
    status: semAtendimentoSemana > 0 ? "atencao" : "ok",
    valor: `${n(semAtendimentoSemana)} de ${n(d.conversao.safra.leads)}`,
    detalhe: "Leads que chegaram no trecho e não tiveram a primeira tratativa registrada no CRM: ficam fora da conversão por safra.",
  });
  v.push({
    chave: "abertos_sem_atendimento",
    grupo: "leads",
    titulo: "Abertos hoje sem atendimento",
    status: d.conversao.novosSemAtendimento > 0 ? "info" : "ok",
    valor: n(d.conversao.novosSemAtendimento),
    detalhe: "Estoque de hoje (de qualquer semana): tickets em aberto que ainda não tiveram a primeira tratativa.",
  });
  v.push({
    chave: "leads_repetidos",
    grupo: "leads",
    titulo: "Tickets repetidos do mesmo lead",
    status: d.conversao.safra.repetidos > 0 ? "info" : "ok",
    valor: n(d.conversao.safra.repetidos),
    detalhe: "Mesmo telefone ou mesmo contrato em mais de um ticket: a conversão por safra conta como um lead só; a do CRM conta cada ticket.",
  });
  v.push({
    chave: "leads_reatribuidos",
    grupo: "leads",
    titulo: "Leads que mudaram de agente",
    status: x.reatribuidos.convertidosPorOutro > 0 ? "atencao" : x.reatribuidos.leads > 0 ? "info" : "ok",
    valor: n(x.reatribuidos.leads),
    detalhe: `${n(x.reatribuidos.convertidosPorOutro)} deles viraram venda com agente diferente do primeiro. A conversão fica com quem fechou; o histórico da troca fica no ticket.`,
  });
  v.push({
    chave: "leads_fora",
    grupo: "leads",
    titulo: "Fechados fora da conversão",
    status: "info",
    valor: n(d.conversao.foraDaConversao),
    detalhe: "Já é cliente da base ou transferido: não entram em nenhuma das duas conversões.",
  });

  // ---------- vendas ----------
  v.push({
    chave: "vendas_sem_agente",
    grupo: "vendas",
    titulo: "Vendas sem agente",
    status: d.vendas.semVendedorSemana > 0 ? "atencao" : "ok",
    valor: n(d.vendas.semVendedorSemana),
    detalhe: "Contratos da semana sem vendedor identificado no SGP. Não são atribuídos a ninguém automaticamente.",
  });
  v.push({
    chave: "vendas_sem_ticket",
    grupo: "vendas",
    titulo: "Vendas lançadas direto no SGP",
    status: d.conversao.convertidasSemLead > 0 ? "info" : "ok",
    valor: n(d.conversao.convertidasSemLead),
    detalhe: "Convertidas sem atendimento no CRM: contam na conversão do CRM e ficam fora da conversão por safra.",
  });
  v.push({
    chave: "convertidos_sem_contrato",
    grupo: "vendas",
    titulo: "Convertidos sem contrato ligado",
    status: x.convertidosSemContrato > 0 ? "atencao" : "ok",
    valor: n(x.convertidosSemContrato),
    detalhe: "Tickets fechados como venda que ainda não foram reconciliados com um contrato do SGP.",
  });
  v.push({
    chave: "os_para_baixar",
    grupo: "vendas",
    titulo: "OS abertas de contratos já em serviço",
    status: (d.ativacoes.osParaBaixar ?? 0) > 0 ? "atencao" : "ok",
    valor: d.ativacoes.osParaBaixar == null ? "—" : n(d.ativacoes.osParaBaixar),
    detalhe: "OS de instalação que continuam abertas no SGP com o contrato já ativo ou suspenso. Não contam como aguardando instalação; precisam ser baixadas no SGP.",
  });
  const avisoAtivacao = d.avisos.find((a) => a.startsWith("Ativações:"));
  v.push({
    chave: "data_ativacao",
    grupo: "vendas",
    titulo: "Data de ativação",
    status: avisoAtivacao ? "atencao" : "ok",
    valor: avisoAtivacao ? `${n(d.ativacoes.noDiaDaVenda)} de ${n(d.ativacoes.semana)}` : "ok",
    detalhe: avisoAtivacao ?? "As datas de ativação não repetem a data da venda.",
  });

  // ---------- outras fontes ----------
  if (x.relatorioVendas == null) {
    v.push({ chave: "relatorio", grupo: "fontes", titulo: "GRR × Relatório da diretoria", status: "info", valor: "—", detalhe: "O Relatório da diretoria desta semana não foi gerado." });
  } else {
    const dif = d.vendas.semana - x.relatorioVendas;
    v.push({
      chave: "relatorio",
      grupo: "fontes",
      titulo: "GRR × Relatório da diretoria",
      status: dif === 0 ? "ok" : "info",
      valor: dif === 0 ? n(d.vendas.semana) : `${n(d.vendas.semana)} × ${n(x.relatorioVendas)}`,
      detalhe:
        dif === 0
          ? "As vendas da semana batem com o relatório."
          : `O relatório foi gerado com ${n(x.relatorioVendas)} vendas; hoje a semana tem ${n(d.vendas.semana)}. A diferença vem de contratos lidos do SGP ou ajustados depois da geração.`,
    });
  }
  if (x.foto) {
    const mudou = x.foto.vendas !== d.vendas.semana || x.foto.convertidos !== d.conversao.convertidos || x.foto.recebidos !== d.conversao.recebidos;
    v.push({
      chave: "foto",
      grupo: "fontes",
      titulo: "Números de agora × semana congelada",
      status: mudou ? "info" : "ok",
      valor: mudou ? `vendas ${n(x.foto.vendas)} → ${n(d.vendas.semana)}` : `versão ${x.foto.versao}`,
      detalhe: mudou
        ? `Depois do congelamento (versão ${x.foto.versao}) os números mudaram: convertidos ${n(x.foto.convertidos)} → ${n(d.conversao.convertidos)}, leads ${n(x.foto.recebidos)} → ${n(d.conversao.recebidos)}. A foto não muda; para corrigir, congele de novo com motivo.`
        : "Os números de agora são os mesmos da semana congelada.",
    });
  } else {
    v.push({ chave: "foto", grupo: "fontes", titulo: "Números de agora × semana congelada", status: "info", valor: "—", detalhe: "A semana ainda não foi congelada." });
  }
  return v;
}

export function resumoConferencia(v: Verificacao[]): Record<StatusVerificacao, number> {
  const r: Record<StatusVerificacao, number> = { ok: 0, atencao: 0, erro: 0, info: 0 };
  for (const x of v) r[x.status]++;
  return r;
}
