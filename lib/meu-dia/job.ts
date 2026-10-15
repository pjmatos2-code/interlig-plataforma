import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeIso } from "@/lib/datas";
import { ehPendente90 } from "@/lib/meu-dia/regras";

/**
 * Job diário do Meu Dia (00h05, dentro do ciclo do sync): gera o pós-venda
 * dos contratos ativados ONTEM (Bloco 4) e recalcula os pendentes 90+ do dia
 * (Bloco 5) das vendedoras do piloto. Idempotente: pode rodar de novo.
 */
export async function rodarJobMeuDia(
  opcoes: { vendedorIds?: string[]; hoje?: string } = {}
): Promise<{ posvenda: number; vendedoras: number }> {
  const admin = criarClienteAdmin();
  const hoje = opcoes.hoje ?? hojeIso();
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const limite90 = new Date(Date.parse(`${hoje}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);

  let q = admin.from("vendedores").select("id").eq("meu_dia", true).eq("ativo", true);
  if (opcoes.vendedorIds?.length) q = q.in("id", opcoes.vendedorIds);
  const { data: vends } = await q;
  let posvenda = 0;

  for (const v of vends ?? []) {
    const vendedorId = v.id as string;

    // ---- Bloco 4: passaram para ativo ontem
    const { data: ativados } = await admin
      .from("contratos")
      .select("id")
      .eq("vendedor_id", vendedorId)
      .eq("status", "ativo")
      .eq("data_ativacao", ontem);
    if (ativados?.length) {
      const { data: ins } = await admin
        .from("meu_dia_posvenda")
        .upsert(
          ativados.map((c) => ({ contrato_id: c.id as string, vendedor_id: vendedorId, ativado_em: ontem })),
          { onConflict: "contrato_id", ignoreDuplicates: true }
        )
        .select("contrato_id");
      posvenda += ins?.length ?? 0;
    }

    // ---- Bloco 5: pendentes 90+ (só quem chegou a ser instalado)
    const { data: cts } = await admin
      .from("contratos")
      .select("id, sgp_contrato_id, status, data_venda, desistencia_em, clientes(nome)")
      .eq("vendedor_id", vendedorId)
      .gte("data_venda", limite90)
      .lte("data_venda", hoje)
      .in("status", ["suspenso", "cancelado"])
      .limit(1000);
    const canceladosSgp = (cts ?? []).filter((c) => c.status === "cancelado").map((c) => c.sgp_contrato_id as string).filter(Boolean);
    const anterior = new Map<string, string>();
    for (let i = 0; i < canceladosSgp.length; i += 300) {
      const { data: cs } = await admin
        .from("cancelamentos_sgp")
        .select("sgp_contrato_id, data_cancelamento, status_anterior")
        .in("sgp_contrato_id", canceladosSgp.slice(i, i + 300))
        .order("data_cancelamento", { ascending: true });
      for (const c of cs ?? []) anterior.set(c.sgp_contrato_id as string, (c.status_anterior as string) ?? ""); // fica o mais recente
    }
    const lista = (cts ?? [])
      .filter((c) =>
        ehPendente90(
          {
            dataVenda: c.data_venda as string,
            status: c.status as string,
            desistenciaEm: (c.desistencia_em as string | null) ?? null,
            statusAnteriorCancelamento: anterior.get(c.sgp_contrato_id as string) ?? null,
          },
          hoje
        )
      )
      .map((c) => ({
        sgp: (c.sgp_contrato_id as string) ?? "",
        cliente: (c.clientes as unknown as { nome: string } | null)?.nome ?? "—",
        status: c.status as string,
        dataVenda: c.data_venda as string,
      }))
      .sort((a, b) => (a.dataVenda < b.dataVenda ? 1 : -1));
    await admin.from("meu_dia_diario").upsert(
      { vendedor_id: vendedorId, data: hoje, pendentes_90: lista.length, pendentes_lista: lista, calculado_em: new Date().toISOString() },
      { onConflict: "vendedor_id,data" }
    );
  }
  return { posvenda, vendedoras: vends?.length ?? 0 };
}
