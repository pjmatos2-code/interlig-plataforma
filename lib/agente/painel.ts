import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import type { AgentePainel } from "@/lib/comissao/painel";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";

/**
 * Indicadores do "Meu painel" além do cartão de resultado (layout aprovado
 * 01/10/2026): CRM da agente, vendas de hoje, evolução diária, foco do dia,
 * funil e mix. Tudo escopado ao vendedor_id — nada de colegas.
 */

export type ExtrasAgente = {
  hoje: string;
  crm: { abertos: number; parados: number };
  vendasHoje: { hoje: number; anterior: number; diaAnterior: string | null; metaDia: number | null };
  /** funil do mês: tickets de conversa (o automático de venda direta no SGP fica fora) */
  funil: { leads: number; atendidos: number; assinados: number; naoConvertidos: number; semTicket: number };
  conversao: number | null;
  dias: { data: string; vendas: number; util: boolean; futuro: boolean }[];
  metaDiaMes: number | null;
  mix: { plano: string; quantidade: number }[];
  ticketMedio: number;
};

/** "FIBRA 400MB | PÓS PAGO" → "Fibra 400MB" (o sufixo de cobrança não ajuda a ler) */
function nomeCurtoPlano(nome: string | null): string {
  if (!nome) return "Sem plano";
  const base = nome.split("|")[0].trim();
  return base.charAt(0) + base.slice(1).toLowerCase().replace(/(\d+)\s*(mb|gb|mbps)/gi, (_, n, u) => `${n} ${u.toUpperCase()}`);
}

export async function carregarExtrasAgente(
  vendedorId: string,
  mesIso: string,
  agente: AgentePainel | null
): Promise<ExtrasAgente> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const mes = primeiroDiaDoMes(mesIso);
  const fim = ultimoDiaDoMes(mes);
  const mesAtual = primeiroDiaDoMes(hoje);
  const limiteParado = new Date(Date.now() - 48 * 3600_000).toISOString();

  const [{ data: abertos }, { data: ticketsMes }, { data: cal }, { data: calAtual }, { data: anteriores }, { data: vendasRecentes }, { data: metaAtual }] =
    await Promise.all([
      admin.from("tickets").select("atualizado_em").eq("vendedor_id", vendedorId).neq("etapa", "fechado").limit(2000),
      admin
        .from("tickets")
        .select("etapa, desfecho, primeira_tratativa_em, contrato_id, origem_criacao")
        .eq("vendedor_id", vendedorId)
        .gte("criado_em", `${mes}T00:00:00-03:00`)
        .lte("criado_em", `${fim}T23:59:59-03:00`)
        .neq("origem_criacao", "sgp_auto")
        .limit(3000),
      admin.from("calendario").select("data, dia_util").gte("data", mes).lte("data", fim).order("data"),
      admin.from("calendario").select("data, dia_util").gte("data", mesAtual).lte("data", ultimoDiaDoMes(mesAtual)),
      admin.from("calendario").select("data").lt("data", hoje).eq("dia_util", true).order("data", { ascending: false }).limit(1),
      admin
        .from("contratos")
        .select("data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, valor_mensalidade")
        .eq("vendedor_id", vendedorId)
        .gte("data_venda", new Date(Date.parse(hoje) - 10 * 86_400_000).toISOString().slice(0, 10))
        .lte("data_venda", hoje)
        .limit(500),
      admin
        .from("metas")
        .select("quantidade_vendas")
        .eq("escopo", "vendedora")
        .eq("referencia_id", vendedorId)
        .eq("mes_ano", mesAtual)
        .maybeSingle(),
    ]);

  // ---------- CRM agora ----------
  const crm = {
    abertos: (abertos ?? []).length,
    parados: (abertos ?? []).filter((t) => (t.atualizado_em as string) < limiteParado).length,
  };

  // ---------- vendas de hoje × dia útil anterior ----------
  const recentes = (vendasRecentes ?? []) as ContratoIndicador[];
  const diaAnterior = (anteriores?.[0]?.data as string | undefined) ?? null;
  const uteisAtual = (calAtual ?? []).filter((d) => d.dia_util).length;
  const metaMesAtual = Number(metaAtual?.quantidade_vendas ?? 0);
  const vendasHoje = {
    hoje: vendasDoPeriodo(recentes, hoje, hoje).length,
    anterior: diaAnterior ? vendasDoPeriodo(recentes, diaAnterior, diaAnterior).length : 0,
    diaAnterior,
    // a meta do dia vem do mês CORRENTE (com a reposição dele, se o mês exibido for o atual)
    metaDia:
      metaMesAtual > 0 && uteisAtual > 0
        ? ((mes === mesAtual && agente ? agente.metaFinal : metaMesAtual) / uteisAtual)
        : null,
  };

  // ---------- funil do CRM no mês ----------
  const tk = ticketsMes ?? [];
  const assinadosTk = tk.filter((t) => t.etapa === "fechado" && t.desfecho === "convertido");
  const validas = (agente?.contratos ?? []).filter((c) => c.situacao !== "nao_conta" && c.situacao !== "estornada");
  const contratosComConversa = new Set(assinadosTk.map((t) => t.contrato_id as string | null).filter(Boolean));
  const funil = {
    leads: tk.length,
    atendidos: tk.filter((t) => t.primeira_tratativa_em || t.etapa !== "novo").length,
    assinados: assinadosTk.length,
    naoConvertidos: tk.filter((t) => t.etapa === "fechado" && t.desfecho === "nao_convertido").length,
    semTicket: validas.filter((c) => !contratosComConversa.has(c.id)).length,
  };

  // ---------- evolução diária (vendas que contam, por data de venda) ----------
  const porDia = new Map<string, number>();
  for (const c of agente?.contratos ?? []) {
    if (c.situacao === "nao_conta") continue;
    porDia.set(c.dataVenda, (porDia.get(c.dataVenda) ?? 0) + 1);
  }
  const diasCal = (cal ?? []) as { data: string; dia_util: boolean }[];
  const uteisMes = diasCal.filter((d) => d.dia_util).length;

  // ---------- mix por plano (vendas válidas) ----------
  const mixMapa = new Map<string, number>();
  for (const c of validas) mixMapa.set(nomeCurtoPlano(c.plano), (mixMapa.get(nomeCurtoPlano(c.plano)) ?? 0) + 1);
  const ordenado = [...mixMapa.entries()].sort((a, b) => b[1] - a[1]);
  const mix = ordenado.slice(0, 4).map(([plano, quantidade]) => ({ plano, quantidade }));
  const resto = ordenado.slice(4).reduce((s, [, n]) => s + n, 0);
  if (resto > 0) mix.push({ plano: "Outros planos", quantidade: resto });

  return {
    hoje,
    crm,
    vendasHoje,
    funil,
    conversao: funil.leads > 0 ? (funil.assinados / funil.leads) * 100 : null,
    dias: diasCal.map((d) => ({ data: d.data, vendas: porDia.get(d.data) ?? 0, util: d.dia_util, futuro: d.data > hoje })),
    metaDiaMes: agente && uteisMes > 0 ? agente.metaFinal / uteisMes : null,
    mix,
    ticketMedio: validas.length ? validas.reduce((s, c) => s + c.valor, 0) / validas.length : 0,
  };
}
