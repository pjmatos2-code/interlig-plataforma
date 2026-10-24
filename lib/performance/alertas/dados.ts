import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { EscopoPerformance } from "../escopo";

export type AlertaPersistido = {
  id: string;
  chave: string;
  categoria: "critico" | "atencao" | "informativo";
  tipo: string;
  titulo: string;
  detalhe: string | null;
  vendedor_id: string | null;
  ticket_id: string | null;
  status: "aberto" | "reconhecido" | "resolvido" | "silenciado";
  ocorrencias: number;
  primeira_em: string;
  ultima_em: string;
  silenciado_ate: string | null;
  origem: string;
  evidencias: Record<string, unknown>;
  resolvido_em: string | null;
};

const ORDEM = { critico: 0, atencao: 1, informativo: 2 } as const;

/** alertas do escopo do usuário (servidor filtra por vendedor) */
export async function listarAlertas(
  escopo: EscopoPerformance,
  opts: { status?: ("aberto" | "reconhecido" | "resolvido" | "silenciado")[]; categoria?: string | null; tipo?: string | null; limite?: number; desde?: string | null } = {}
): Promise<AlertaPersistido[]> {
  let q = criarClienteAdmin()
    .from("alertas_comerciais")
    .select("id, chave, categoria, tipo, titulo, detalhe, vendedor_id, ticket_id, status, ocorrencias, primeira_em, ultima_em, silenciado_ate, origem, evidencias, resolvido_em")
    .in("status", opts.status ?? ["aberto", "reconhecido"])
    .order("ultima_em", { ascending: false })
    .limit(opts.limite ?? 200);
  if (opts.categoria) q = q.eq("categoria", opts.categoria);
  if (opts.tipo) q = q.eq("tipo", opts.tipo);
  if (opts.desde) q = q.gte("ultima_em", opts.desde);
  if (escopo.vendedorIds !== null) q = q.in("vendedor_id", escopo.vendedorIds.length ? escopo.vendedorIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return ((data ?? []) as AlertaPersistido[]).sort((a, b) => ORDEM[a.categoria] - ORDEM[b.categoria] || Date.parse(b.ultima_em) - Date.parse(a.ultima_em));
}
