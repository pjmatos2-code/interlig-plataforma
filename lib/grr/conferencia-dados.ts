import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Semana } from "@/lib/relatorio-semanal/periodo";
import type { ExtrasConferencia } from "./conferencia";
import { lerFoto } from "./fotos-dados";
import type { DadosGrr } from "./montar";

/** o que a conferência precisa além do painel: CRM, Relatório da diretoria e semana congelada (empresa) */
export async function extrasDaConferencia(semana: Semana, dados: DadosGrr): Promise<ExtrasConferencia> {
  const db = criarClienteServidor();
  const de = `${dados.trechos.atual.de}T00:00:00-03:00`;
  const ate = `${dados.trechos.atual.ate}T23:59:59.999-03:00`;
  const [semContrato, trocas, relatorio, foto] = await Promise.all([
    db.from("tickets").select("id", { count: "exact", head: true }).eq("desfecho", "convertido").is("contrato_id", null).gte("fechado_em", de).lte("fechado_em", ate),
    db.from("ticket_eventos").select("ticket_id, dados, criado_em, tickets(desfecho, vendedor_id)").eq("tipo", "reatribuicao").gte("criado_em", de).lte("criado_em", ate).order("criado_em").limit(2000),
    criarClienteAdmin().from("relatorios_semanais").select("vendas:dados->vendas->semana").eq("semana_inicio", semana.inicio).maybeSingle(),
    lerFoto(semana, { tipo: "empresa", ref: null }).catch(() => null),
  ]);
  // primeiro agente de cada lead trocado no trecho
  const primeiro = new Map<string, { de: string | null; final: { desfecho: string | null; vendedor_id: string | null } | null }>();
  for (const e of (trocas.data ?? []) as unknown as { ticket_id: string; dados: { de?: string | null }; tickets: { desfecho: string | null; vendedor_id: string | null } | null }[]) {
    if (!primeiro.has(e.ticket_id)) primeiro.set(e.ticket_id, { de: e.dados?.de ?? null, final: e.tickets });
  }
  const convertidosPorOutro = [...primeiro.values()].filter((x) => x.final?.desfecho === "convertido" && x.de && x.de !== x.final.vendedor_id).length;
  const fd = foto?.dados;
  return {
    convertidosSemContrato: semContrato.count ?? 0,
    reatribuidos: { leads: primeiro.size, convertidosPorOutro },
    relatorioVendas: relatorio.data && (relatorio.data as { vendas: unknown }).vendas != null ? Number((relatorio.data as { vendas: unknown }).vendas) : null,
    foto: foto && fd ? { versao: foto.versao, vendas: fd.vendas.semana, convertidos: fd.conversao.convertidos, recebidos: fd.conversao.recebidos } : null,
  };
}
