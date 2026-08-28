import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeIso, primeiroDiaDoMes, somarDias } from "@/lib/datas";

/**
 * Congela o débito de meta do mês (inadimplentes dos 90 dias) — regra 28/08:
 * o número é apurado NO DIA 1º e fica travado o mês inteiro. Roda no ciclo do
 * sync: se o mês corrente ainda não tem fotografia, gera uma para TODAS as
 * vendedoras ativas (zeros incluídos, para marcar o mês como congelado).
 * Carga manual (origem 'manual', validada pela equipe) nunca é sobrescrita —
 * o insert ignora conflitos por (competencia, vendedor_id).
 */
export async function congelarDebitosSeNecessario(): Promise<number> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const mes = primeiroDiaDoMes(hoje);

  const { count } = await admin
    .from("debitos_meta_mensal")
    .select("id", { count: "exact", head: true })
    .eq("competencia", mes);
  if ((count ?? 0) > 0) return 0; // mês já congelado (manual ou automático)

  const [{ data: vendedores }, { data: monitorados }] = await Promise.all([
    admin.from("vendedores").select("id").eq("ativo", true),
    admin
      .from("contratos")
      .select("vendedor_id, titulos!inner(numero_parcela, status, vencimento)")
      .gte("data_venda", somarDias(mes, -90))
      .lt("data_venda", mes)
      .in("status", ["suspenso", "cancelado"])
      .not("vendedor_id", "is", null)
      .eq("titulos.numero_parcela", 1)
      .limit(3000),
  ]);

  const porVendedora = new Map<string, number>();
  for (const m of (monitorados ?? []) as unknown as {
    vendedor_id: string;
    titulos: { numero_parcela: number; status: string; vencimento: string }[];
  }[]) {
    const primeira = (m.titulos ?? []).find((t) => t.numero_parcela === 1);
    const naoPagou =
      primeira !== undefined && primeira.status !== "liquidado" && primeira.vencimento < hoje;
    if (!naoPagou) continue;
    porVendedora.set(m.vendedor_id, (porVendedora.get(m.vendedor_id) ?? 0) + 1);
  }

  const linhas = (vendedores ?? []).map((v) => ({
    competencia: mes,
    vendedor_id: v.id,
    quantidade: porVendedora.get(v.id) ?? 0,
    origem: "automatico" as const,
  }));
  if (linhas.length === 0) return 0;
  const { error } = await admin
    .from("debitos_meta_mensal")
    .upsert(linhas, { onConflict: "competencia,vendedor_id", ignoreDuplicates: true });
  if (error) {
    console.error("congelarDebitos falhou:", error.message);
    return 0;
  }
  console.log(`débito de meta congelado para ${mes}: ${linhas.length} vendedoras`);
  return linhas.length;
}

/** Débito travado do mês por vendedora (null = mês ainda não congelado). */
export async function debitosTravados(mesIso: string): Promise<Map<string, number> | null> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("debitos_meta_mensal")
    .select("vendedor_id, quantidade")
    .eq("competencia", mesIso);
  if (!data || data.length === 0) return null;
  return new Map(data.map((d) => [d.vendedor_id as string, d.quantidade as number]));
}
