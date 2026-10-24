import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Apuracao } from "./dados/apurar";
import { indexar, rotuloSetor } from "./dados/calcular";
import { ROTULO_TIPO_ALERTA } from "./alertas/regras";
import { calcularFunil } from "./dados/funil";
import { todas } from "./dados/paginar";
import type { EscopoPerformance } from "./escopo";
import { CRITERIOS, ROTULO_CRITERIO, ROTULO_OBJECAO } from "./ia/schema";
import { ROTULO_MOTIVO, type Indicador } from "./tipos";

/**
 * Relatórios gerenciais (24/10/2026): mesmos filtros e definições das telas
 * (vêm da mesma apuração). Cada relatório é uma tabela simples — o route
 * handler grava em XLSX ou CSV.
 */
export type Relatorio = { titulo: string; colunas: string[]; linhas: (string | number | null)[][] };

export const RELATORIOS: Record<string, string> = {
  performance_diaria: "Performance diária",
  performance_semanal: "Performance semanal (7 dias)",
  performance_mensal: "Performance mensal",
  performance: "Performance do período filtrado",
  ranking: "Ranking por unidade",
  produtividade: "Produtividade (esforço) por vendedor",
  canais: "Conversão por origem/canal",
  followups: "Follow-ups e atrasos",
  perdas: "Motivos de perda",
  atendimento: "Qualidade do atendimento (IA)",
  qualidade_vendas: "Qualidade das vendas",
  oportunidades: "Oportunidades esquecidas e alertas",
  ipc: "Evolução do IPC (semanal)",
  unidades: "Comparativo entre unidades",
  tendencias_ia: "Tendências comerciais identificadas pela IA",
};

/** data/hora de Santarém para planilha (follow-up de dia inteiro é gravado às 12h UTC) */
const dataHora = (iso: string | null | undefined, soData = false) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const op: Intl.DateTimeFormatOptions = soData ? { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", year: "numeric" } : { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("pt-BR", op);
};
const ROTULO_STATUS_FU: Record<string, string> = {
  sugerido: "Sugerido pela IA",
  programado: "Programado",
  pendente: "Pendente (vence hoje)",
  vencido: "Vencido",
  concluido_prazo: "Concluído no prazo",
  concluido_atraso: "Concluído com atraso",
  cancelado: "Cancelado",
  rejeitado: "Sugestão rejeitada",
};
const ROTULO_ORIGEM_FU: Record<string, string> = { crm: "CRM / Meu Dia", manual: "Agendado na Performance", ia: "Sugestão da IA", regra: "Regra automática", robo: "Robô do chat (automático)" };
const ROTULO_CATEGORIA: Record<string, string> = { critico: "Crítico", atencao: "Atenção", informativo: "Informativo" };

const valor = (i: Indicador | undefined): string | number | null => {
  if (!i) return null;
  if (!i.disponivel) return ROTULO_MOTIVO[i.motivo ?? "sem_dados"];
  if (i.valor === null) return null;
  return i.unidade === "pct" ? Math.round(i.valor * 1000) / 10 : Math.round(i.valor * 100) / 100;
};

export async function montarRelatorio(chave: string, ap: Apuracao, escopo: EscopoPerformance): Promise<Relatorio | null> {
  const base = ap.base;
  const linhas = ap.linhas;
  const ids = new Set(linhas.map((l) => l.vendedor.id));
  const idx = indexar(base);
  const [deMs, ateMs] = [Date.parse(`${ap.periodo.de}T00:00:00-03:00`), Date.parse(`${ap.periodo.ate}T23:59:59.999-03:00`)];
  const titulo = `${RELATORIOS[chave] ?? chave} — ${ap.periodo.rotulo}`;
  switch (chave) {
    case "performance":
    case "performance_diaria":
    case "performance_semanal":
    case "performance_mensal":
    case "ranking": {
      // ranking por unidade: posição dentro da unidade, só entre comparáveis
      const ordem =
        chave === "ranking"
          ? [...linhas].sort((a, b) => (a.vendedor.pop_nome ?? "~").localeCompare(b.vendedor.pop_nome ?? "~") || (b.ipc.valor ?? -1) - (a.ipc.valor ?? -1))
          : linhas;
      const posUnidade = new Map<string, number>();
      const contagem = new Map<string, number>();
      for (const l of ordem) {
        if (!l.flags.comparavel || l.ipc.valor === null) continue;
        const k = l.vendedor.pop_nome ?? "~";
        contagem.set(k, (contagem.get(k) ?? 0) + 1);
        posUnidade.set(l.vendedor.id, contagem.get(k)!);
      }
      return {
        titulo,
        colunas: [chave === "ranking" ? "Unidade" : "Função", chave === "ranking" ? "Posição na unidade" : "Posição", "Vendedor", chave === "ranking" ? "Função" : "Unidade", "Comparável", "Leads recebidos", "Leads trabalhados", "Vendas", "Meta proporcional", "% meta", "Conversão %", "Receita nova (R$)", "Ticket médio (R$)", "Ativações", "Esforço", "Resultado", "Qualidade", "IPC", "IPC provisório"],
        linhas: ordem.map((l) => [
          chave === "ranking" ? l.vendedor.pop_nome : rotuloSetor(l.vendedor.setor),
          chave === "ranking" ? (posUnidade.get(l.vendedor.id) ?? null) : l.posicao,
          l.vendedor.nome,
          chave === "ranking" ? rotuloSetor(l.vendedor.setor) : l.vendedor.pop_nome,
          l.flags.motivoNaoComparavel ?? "sim",
          l.numeros.leadsRecebidos, l.numeros.leadsTrabalhados, l.numeros.vendas, l.numeros.metaPeriodo,
          l.numeros.metaPct === null ? null : Math.round(l.numeros.metaPct * 1000) / 10,
          l.numeros.conversao === null ? null : Math.round(l.numeros.conversao * 1000) / 10,
          l.numeros.receitaNova, l.numeros.ticketMedio, l.numeros.ativacoes,
          l.esforco.score.valor, l.resultado.score.valor, l.qualidade.score.valor, l.ipc.valor, l.ipc.provisorio ? "sim" : "não",
        ]),
      };
    }
    case "produtividade": {
      const chaves = ["leads_recebidos", "leads_trabalhados", "leads_atendidos", "tempo_primeira_resposta", "sla_primeira_resposta", "tempo_entre_interacoes", "conversas_trabalhadas", "followups_previstos", "followups_realizados", "followups_prazo", "leads_sem_retorno", "propostas", "recuperacao", "disciplina_crm", "mensagens_enviadas", "mensagens_recebidas"];
      return {
        titulo,
        colunas: ["Vendedor", "Função", "Score de esforço", ...chaves.map((k) => (linhas[0]?.esforco.indicadores[k]?.rotulo ?? k) + (linhas[0]?.esforco.indicadores[k]?.unidade === "pct" ? " (%)" : linhas[0]?.esforco.indicadores[k]?.unidade === "seg" ? " (s)" : ""))],
        linhas: linhas.map((l) => [l.vendedor.nome, rotuloSetor(l.vendedor.setor), l.esforco.score.valor, ...chaves.map((k) => valor(l.esforco.indicadores[k]))]),
      };
    }
    case "canais":
    case "perdas": {
      // mesma regra da tela do funil (sem dono só no escopo total e sem filtro de pessoa)
      const f = calcularFunil(base, idx, ap.periodo.de, ap.periodo.ate, (t) => ap.noEscopo(t.vendedor_id, t.pop_id), "entrada");
      if (chave === "canais")
        return { titulo, colunas: ["Origem", "Leads", "Vendas", "Conversão %", "Receita nova (R$)", "Ticket médio (R$)"], linhas: f.porOrigem.map((o) => [o.origem, o.leads, o.vendas, o.conversao === null ? null : Math.round(o.conversao * 1000) / 10, o.receita, o.ticketMedio]) };
      return {
        titulo,
        colunas: ["Tipo", "Item", "Quantidade"],
        linhas: [...f.perdas.porMotivo.map((m) => ["Motivo", m.motivo, m.quantidade] as (string | number)[]), ...f.perdas.porEtapa.map((e) => ["Etapa em que parou", e.etapa, e.quantidade] as (string | number)[])],
      };
    }
    case "followups": {
      const nome = new Map(base.vendedores.map((v) => [v.id, v.nome]));
      const tk = new Map(base.tickets.map((t) => [t.id, t]));
      return {
        titulo,
        colunas: ["Prazo", "Status", "Vendedor", "Lead", "Tipo", "Origem", "Motivo / próximo passo", "Concluído em", "Evidência"],
        linhas: base.followups
          .filter((f) => (f.vendedor_id ? ids.has(f.vendedor_id) : false) && Date.parse(f.prazo) >= deMs && Date.parse(f.prazo) <= ateMs)
          .sort((a, b) => Date.parse(a.prazo) - Date.parse(b.prazo))
          .map((f) => [
            dataHora(f.prazo, f.prazo.includes("T12:00:00")),
            ROTULO_STATUS_FU[f.status] ?? f.status,
            nome.get(f.vendedor_id ?? "") ?? "",
            tk.get(f.ticket_id)?.cliente_nome ?? "",
            f.tipo,
            ROTULO_ORIGEM_FU[f.origem] ?? f.origem,
            f.proximo_passo ?? f.motivo ?? "",
            dataHora(f.concluido_em),
            f.evidencia,
          ]),
      };
    }
    case "atendimento": {
      const nome = new Map(base.vendedores.map((v) => [v.id, v.nome]));
      const an = base.analises.filter((a) => a.vendedor_id && ids.has(a.vendedor_id) && Date.parse(a.concluido_em) >= deMs && Date.parse(a.concluido_em) <= ateMs);
      const porV = new Map<string, typeof an>();
      for (const a of an) porV.set(a.vendedor_id!, [...(porV.get(a.vendedor_id!) ?? []), a]);
      return {
        titulo,
        colunas: ["Vendedor", "Conversas analisadas", "Nota média (0–100)", ...CRITERIOS.map((c) => `${ROTULO_CRITERIO[c]} (0–10)`)],
        linhas: [...porV.entries()].map(([v, lista]) => {
          const notas = lista.map((a) => a.score_atendimento).filter((x): x is number => x !== null);
          return [
            nome.get(v) ?? v,
            lista.length,
            notas.length ? Math.round((notas.reduce((s, x) => s + x, 0) / notas.length) * 10) / 10 : null,
            ...CRITERIOS.map((c) => {
              const ns = lista.flatMap((a) => ((a.resultado as { qualidade_atendimento?: { criterio: string; nota: number | null }[] } | null)?.qualidade_atendimento ?? []).filter((q) => q.criterio === c && q.nota !== null).map((q) => q.nota as number));
              return ns.length ? Math.round((ns.reduce((s, x) => s + x, 0) / ns.length) * 10) / 10 : null;
            }),
          ];
        }),
      };
    }
    case "qualidade_vendas":
      return {
        titulo,
        colunas: ["Vendedor", "Vendas", "Ticket médio (R$)", "Cancel. antes da instalação", "Cancel. 30 dias", "Churn 90 dias", "Inadimplência 1ª fatura", "Qualidade das vendas"],
        linhas: linhas.map((l) => [
          l.vendedor.nome, l.numeros.vendas, l.numeros.ticketMedio,
          ...["cancel_antes_instalacao", "cancel_30", "churn_90", "inad_1a"].map((k) => {
            const i = l.qualidade.indicadores[k];
            return i.disponivel ? `${Math.round((i.valor ?? 0) * 1000) / 10}% (${i.numerador}/${i.denominador})` : `${ROTULO_MOTIVO[i.motivo ?? "em_maturacao"]} (${i.numerador ?? 0}/${i.denominador ?? 0})`;
          }),
          l.qualidade.indicadores.qualidade_vendas.nota,
        ]),
      };
    case "oportunidades": {
      const admin = criarClienteAdmin();
      const todosAlertas = await todas<Record<string, unknown>>((de, ate) => {
        let q = admin.from("alertas_comerciais").select("id, categoria, tipo, titulo, detalhe, status, primeira_em, ultima_em, ocorrencias, vendedor_id, pop_id").gte("ultima_em", new Date(deMs).toISOString()).lte("primeira_em", new Date(ateMs).toISOString());
        if (escopo.vendedorIds !== null) q = q.in("vendedor_id", escopo.vendedorIds.length ? escopo.vendedorIds : ["00000000-0000-0000-0000-000000000000"]);
        return q.order("id").range(de, ate);
      });
      // mesmos filtros da tela (sem dono só no escopo total sem filtro de pessoa)
      const data = todosAlertas.filter((a) => ap.noEscopo(a.vendedor_id as string | null, a.pop_id as string | null)).sort((a, b) => String(b.ultima_em).localeCompare(String(a.ultima_em)));
      const nome = new Map(base.vendedores.map((v) => [v.id, v.nome]));
      return {
        titulo,
        colunas: ["Categoria", "Tipo", "Título", "Detalhe", "Situação", "Vendedor", "Desde", "Última ocorrência", "Ocorrências"],
        linhas: data.map((a) => [
          ROTULO_CATEGORIA[a.categoria as string] ?? (a.categoria as string),
          ROTULO_TIPO_ALERTA[a.tipo as string] ?? (a.tipo as string),
          a.titulo as string,
          a.detalhe as string | null,
          a.status as string,
          nome.get(a.vendedor_id as string) ?? "",
          dataHora(a.primeira_em as string),
          dataHora(a.ultima_em as string),
          a.ocorrencias as number,
        ]),
      };
    }
    case "ipc": {
      const { calcularLinha } = await import("./dados/calcular");
      const semanas: string[] = [];
      for (let i = 7; i >= 0; i--) semanas.push(new Date(Date.parse(`${ap.periodo.ate}T12:00:00Z`) - 7 * i * 86_400_000).toISOString().slice(0, 10));
      return {
        titulo,
        colunas: ["Vendedor", ...semanas.map((s) => `semana até ${s.split("-").reverse().slice(0, 2).join("/")}`)],
        linhas: linhas.filter((l) => l.vendedor.ativo).map((l) => [
          l.vendedor.nome,
          ...semanas.map((ate) => calcularLinha(base, idx, l.vendedor, new Date(Date.parse(`${ate}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10), ate).ipc.valor),
        ]),
      };
    }
    case "unidades": {
      const porPop = new Map<string, typeof linhas>();
      for (const l of linhas) porPop.set(l.vendedor.pop_nome ?? "Sem unidade", [...(porPop.get(l.vendedor.pop_nome ?? "Sem unidade") ?? []), l]);
      return {
        titulo,
        colunas: ["Unidade", "Vendedores", "Leads recebidos", "Vendas", "Meta proporcional", "% meta", "Receita nova (R$)", "IPC médio (comparáveis)"],
        linhas: [...porPop.entries()].map(([pop, ls]) => {
          const vendas = ls.reduce((s, l) => s + l.numeros.vendas, 0);
          const meta = ls.reduce((s, l) => s + (l.numeros.metaPeriodo ?? 0), 0);
          const ipcs = ls.filter((l) => l.flags.comparavel && l.ipc.valor !== null).map((l) => l.ipc.valor as number);
          return [pop, ls.length, ls.reduce((s, l) => s + l.numeros.leadsRecebidos, 0), vendas, meta || null, meta ? Math.round((vendas / meta) * 1000) / 10 : null, Math.round(ls.reduce((s, l) => s + l.numeros.receitaNova, 0) * 100) / 100, ipcs.length ? Math.round((ipcs.reduce((s, x) => s + x, 0) / ipcs.length) * 10) / 10 : null];
        }),
      };
    }
    case "tendencias_ia": {
      const popDaConversa = new Map(base.conversas.map((c) => [c.id, c.pop_id]));
      const an = base.analises.filter((a) => ap.noEscopo(a.vendedor_id, popDaConversa.get(a.conversa_id)) && Date.parse(a.concluido_em) >= deMs && Date.parse(a.concluido_em) <= ateMs);
      const contar = (f: (a: (typeof an)[number]) => string[]) => {
        const m = new Map<string, number>();
        for (const a of an) for (const k of f(a)) m.set(k, (m.get(k) ?? 0) + 1);
        return [...m.entries()].sort((x, y) => y[1] - x[1]);
      };
      return {
        titulo,
        colunas: ["Dimensão", "Valor", "Conversas"],
        linhas: [
          ...contar((a) => (a.temperatura ? [a.temperatura] : [])).map(([k, n]) => ["Temperatura", k, n]),
          ...contar((a) => a.objecoes).map(([k, n]) => ["Objeção", ROTULO_OBJECAO[k as keyof typeof ROTULO_OBJECAO] ?? k, n]),
          ...contar((a) => (a.status_lead ? [a.status_lead] : [])).map(([k, n]) => ["Situação do lead", k, n]),
          ...contar((a) => ((a.resultado as { plano_interesse?: string | null } | null)?.plano_interesse ? [String((a.resultado as { plano_interesse: string }).plano_interesse)] : [])).map(([k, n]) => ["Plano procurado", k, n]),
        ],
      };
    }
    default:
      return null;
  }
}
