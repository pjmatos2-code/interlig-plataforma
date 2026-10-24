/**
 * "O que fazer agora?" (24/10/2026) — ações priorizadas a partir de dados
 * verificáveis, cada uma com destino real (nenhum botão sem função).
 * Puro sobre a apuração.
 */
import type { BaseDados } from "./base";
import type { LinhaPerformance, TotaisPerformance } from "./calcular";

export type AcaoPrioritaria = {
  chave: string;
  titulo: string;
  detalhe: string;
  quantidade: number;
  prioridade: "alta" | "urgente" | "atencao" | "oportunidade";
  href: string;
  rotuloLink: string;
};

export function acoesPrioritarias(base: BaseDados, linhas: LinhaPerformance[], totais: TotaisPerformance, opts: { vendedorId?: string | null } = {}): AcaoPrioritaria[] {
  const soma = (f: (l: LinhaPerformance) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const ids = new Set(linhas.map((l) => l.vendedor.id));
  const pendentesInstalacao = base.contratos.filter(
    (c) => c.vendedor_id && ids.has(c.vendedor_id) && !c.data_ativacao && c.status !== "cancelado" && base.osAgendadas.has(c.id)
  ).length;
  const qs = opts.vendedorId ? `?vendedor=${opts.vendedorId}` : "";
  const itens: AcaoPrioritaria[] = [
    {
      chave: "quentes",
      titulo: "Retornar leads quentes parados",
      detalhe: "Cliente com intenção de compra ou urgência alta e sem ação humana depois do sinal.",
      quantidade: totais.leadsQuentesParados,
      prioridade: "alta",
      href: `/performance/alertas?tipo=lead_quente_sem_retorno`,
      rotuloLink: "Ver leads",
    },
    {
      chave: "vencidos",
      titulo: "Executar follow-ups vencidos",
      detalhe: "Retornos programados que passaram do prazo.",
      quantidade: soma((l) => l.numeros.followupsAtrasados),
      prioridade: "urgente",
      href: `/performance/followups?status=vencido${opts.vendedorId ? `&vendedor=${opts.vendedorId}` : ""}`,
      rotuloLink: "Ver tarefas",
    },
    {
      chave: "aguardando",
      titulo: "Fazer o 1º contato com leads aguardando",
      detalhe: "Leads abertos que ainda não receberam nenhuma ação humana.",
      quantidade: totais.leadsAguardando,
      prioridade: "urgente",
      href: "/crm",
      rotuloLink: "Abrir CRM",
    },
    {
      chave: "sem_retorno",
      titulo: "Retomar leads sem retorno",
      detalhe: `Sem ação humana há mais de ${base.cfg.sla.sem_retorno_horas} h de expediente e sem retorno agendado.`,
      quantidade: soma((l) => l.numeros.leadsSemRetorno),
      prioridade: "atencao",
      href: `/performance/followups?aba=sem_retorno${opts.vendedorId ? `&vendedor=${opts.vendedorId}` : ""}`,
      rotuloLink: "Ver leads",
    },
    {
      chave: "instalacoes",
      titulo: "Acompanhar instalações agendadas",
      detalhe: "Vendas com OS agendada ainda não ativadas no SGP.",
      quantidade: pendentesInstalacao,
      prioridade: "oportunidade",
      href: `/esteira${qs}`,
      rotuloLink: "Ver esteira",
    },
  ];
  return itens.filter((i) => i.quantidade > 0);
}
